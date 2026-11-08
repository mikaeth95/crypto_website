/**
 * Datenkontext für importierte Transaktionen und Importdateien.
 *
 * Zweck:
 *   Lädt die Transaktionen und Importdateien des gewählten Börsenkontos aus
 *   Supabase, baut daraus die Dashboard-Daten (WorkbookData) und führt den
 *   CSV-Import durch: Börsenkonto vorbereiten, Datei ablegen, Importdatei
 *   protokollieren, neue Transaktionen mit Verweis auf die Datei speichern.
 *
 * Eingaben:
 *   - Angemeldeter Benutzer (AuthContext).
 *   - Gewähltes Börsenkonto und Liste aller Konten (UserDataContext).
 *   - Beim Import: die hochgeladene Datei und die gewählte Plattform.
 *
 * Ausgaben:
 *   - data: aufbereitete Dashboard-Daten.
 *   - importHistoryFiles: protokollierte Importdateien des gewählten Bereichs.
 *   - importTransactionsFromFile: Import mit Zusammenfassung, wie viele
 *     Datensätze tatsächlich neu gespeichert wurden.
 *
 * Annahmen:
 *   - Zugriffsschutz liegt ausschließlich in den Row-Level-Security-Regeln der
 *     Datenbank (owns_account). Die Abfragen filtern deshalb nicht mehr selbst
 *     nach dem Benutzer; die Datenbank liefert nur eigene Zeilen.
 *   - Das Sammelkonto "All" enthält selbst keine Transaktionen. Ist es gewählt,
 *     werden die Transaktionen aller eigenen Konten geladen.
 *   - Jede Importplattform hat genau ein eigenes Börsenkonto
 *     (represented_accounts mit provider = Plattform). Dort landen die Transaktionen.
 *   - Supabase begrenzt die Zeilen je Abfrage (Projekteinstellung "Max rows",
 *     Standard 1000). TRANSACTIONS_PAGE_SIZE darf nicht größer sein, sonst
 *     endet das seitenweise Laden zu früh.
 */
import { createContext, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useAuth } from "../hooks/useAuth";
import { useUserData } from "../hooks/useUserData";
import {
  createRepresentedAccountSeed,
  isAllRepresentedAccount,
} from "../lib/representedAccounts";
import { supabase } from "../lib/supabase";
import {
  buildWorkbookDataFromImportedTransactions,
  IMPORT_PLATFORM_OPTIONS,
  parseImportedTransactionsFromFile,
  type SupportedImportPlatform,
  type TransactionOriginContext,
} from "../lib/transactionImports";
import {
  buildImportHistoryStoragePath,
  buildImportHistoryStoredFileName,
  IMPORT_HISTORY_BUCKET,
} from "../lib/importHistory";
import type { WorkbookData } from "../types/portfolio";
import type { ImportHistoryFileRecord, ImportedTransactionRecord } from "../types/supabase";

type TransactionImportSummary = {
  fileName: string;
  originalFileName: string;
  /** Anzahl der Zeilen, die die Datenbank tatsächlich neu angelegt hat. */
  importedCount: number;
  /** Erkannte Vorgänge, die bereits gespeichert waren und übersprungen wurden. */
  skippedCount: number;
  totalParsedCount: number;
  platform: SupportedImportPlatform;
};

export interface AppDataContextValue {
  data: WorkbookData;
  importHistoryFiles: ImportHistoryFileRecord[];
  loading: boolean;
  error: string | null;
  importing: boolean;
  importTransactionsFromFile: (
    file: File,
    platform: SupportedImportPlatform,
  ) => Promise<TransactionImportSummary>;
  downloadImportHistoryFile: (historyFile: ImportHistoryFileRecord) => Promise<void>;
  refreshAppData: () => Promise<void>;
}

/** Zeilen je Abfrage beim Nachladen der Transaktionen (siehe Annahmen oben). */
const TRANSACTIONS_PAGE_SIZE = 1000;
/** Zeilen je Schreibvorgang beim Import, damit einzelne Anfragen klein bleiben. */
const TRANSACTIONS_WRITE_BATCH_SIZE = 250;

const createEmptyWorkbookData = (): WorkbookData => ({
  fileName: "No imported transactions",
  loadedAt: new Date().toISOString(),
  summary: {
    totalPortfolioValueEUR: null,
    totalPortfolioValueUSD: null,
    totalInvestedEUR: null,
    totalInvestedUSD: null,
    totalProfitEUR: null,
    totalProfitUSD: null,
    performanceEUR: null,
    performanceUSD: null,
  },
  assets: [],
  transactions: [],
  performance: [],
  errors: [],
});

/** Zahlen kommen aus PostgREST je nach Spaltentyp als number oder string. */
const parseNumeric = (numericValue: unknown): number | null => {
  if (numericValue === null || numericValue === undefined || numericValue === "") {
    return null;
  }

  if (typeof numericValue === "number") {
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  const parsed = Number.parseFloat(String(numericValue));

  return Number.isFinite(parsed) ? parsed : null;
};

/** Prüft eine Zeile aus imported_transactions. Unvollständige Zeilen werden verworfen. */
const sanitiseImportedTransactionRecord = (value: unknown): ImportedTransactionRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ImportedTransactionRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.represented_account_id !== "string" ||
    typeof candidate.external_id !== "string" ||
    typeof candidate.occurred_at !== "string" ||
    typeof candidate.transaction_type !== "string" ||
    typeof candidate.asset !== "string" ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    represented_account_id: candidate.represented_account_id,
    import_file_id: typeof candidate.import_file_id === "string" ? candidate.import_file_id : null,
    external_id: candidate.external_id,
    occurred_at: candidate.occurred_at,
    transaction_type: candidate.transaction_type,
    asset: candidate.asset,
    quote: typeof candidate.quote === "string" ? candidate.quote : null,
    quantity: parseNumeric(candidate.quantity),
    execution_price: parseNumeric(candidate.execution_price),
    gross_value: parseNumeric(candidate.gross_value),
    fee: parseNumeric(candidate.fee),
    fee_currency: typeof candidate.fee_currency === "string" ? candidate.fee_currency : null,
    net_quantity: parseNumeric(candidate.net_quantity),
    net_value: parseNumeric(candidate.net_value),
    raw_payload: candidate.raw_payload ?? null,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
};

/** Prüft eine Zeile aus import_history_files. Unvollständige Zeilen werden verworfen. */
const sanitiseImportHistoryFileRecord = (value: unknown): ImportHistoryFileRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ImportHistoryFileRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.represented_account_id !== "string" ||
    typeof candidate.stored_file_name !== "string" ||
    typeof candidate.storage_bucket !== "string" ||
    typeof candidate.storage_path !== "string" ||
    typeof candidate.imported_at !== "string" ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    represented_account_id: candidate.represented_account_id,
    stored_file_name: candidate.stored_file_name,
    original_file_name: typeof candidate.original_file_name === "string" ? candidate.original_file_name : null,
    storage_bucket: candidate.storage_bucket,
    storage_path: candidate.storage_path,
    content_type: typeof candidate.content_type === "string" ? candidate.content_type : null,
    file_size_bytes: parseNumeric(candidate.file_size_bytes) ?? 0,
    imported_at: candidate.imported_at,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
};

type SupabaseClientInstance = NonNullable<typeof supabase>;

/**
 * Lädt alle Transaktionen seitenweise, bis eine Seite weniger Zeilen liefert
 * als angefordert. Ohne diese Schleife würden bei großen Beständen die ältesten
 * Vorgänge stillschweigend fehlen und Bestände falsch berechnet.
 * Die zweite Sortierung nach id macht die Reihenfolge eindeutig, damit beim
 * Blättern keine Zeile doppelt kommt oder verloren geht.
 *
 * accountId = null lädt alle eigenen Konten (Sammelkonto "All").
 */
const fetchAllImportedTransactions = async (
  client: SupabaseClientInstance,
  accountId: string | null,
): Promise<{ rows: unknown[]; errorMessage: string | null }> => {
  const rows: unknown[] = [];

  for (let from = 0; ; from += TRANSACTIONS_PAGE_SIZE) {
    let query = client.from("imported_transactions").select("*");

    if (accountId) {
      query = query.eq("represented_account_id", accountId);
    }

    const { data, error } = await query
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + TRANSACTIONS_PAGE_SIZE - 1);

    if (error) {
      return { rows: [], errorMessage: error.message };
    }

    const page = Array.isArray(data) ? data : [];

    rows.push(...page);

    if (page.length < TRANSACTIONS_PAGE_SIZE) {
      return { rows, errorMessage: null };
    }
  }
};

export const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export const AppDataProvider = ({ children }: PropsWithChildren) => {
  const { user } = useAuth();
  const {
    loading: userDataLoading,
    representedAccounts,
    selectedRepresentedAccount,
    selectedRepresentedAccountId,
  } = useUserData();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedTransactions, setImportedTransactions] = useState<ImportedTransactionRecord[]>([]);
  const [importHistoryFiles, setImportHistoryFiles] = useState<ImportHistoryFileRecord[]>([]);

  const refreshAppData = useCallback(async () => {
    if (!supabase || !user) {
      setImportedTransactions([]);
      setImportHistoryFiles([]);
      setLoading(false);
      return;
    }

    if (!selectedRepresentedAccountId) {
      setImportedTransactions([]);
      setImportHistoryFiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Kein Filter auf den Benutzer: Die Zugriffsregeln der Datenbank liefern
    // ohnehin nur Zeilen aus eigenen Börsenkonten.
    const accountFilter = isAllRepresentedAccount(selectedRepresentedAccount) ? null : selectedRepresentedAccountId;
    const importHistoryQuery = supabase
      .from("import_history_files")
      .select("*")
      .order("imported_at", { ascending: false });

    const [transactionsResult, historyResult] = await Promise.all([
      fetchAllImportedTransactions(supabase, accountFilter),
      accountFilter ? importHistoryQuery.eq("represented_account_id", accountFilter) : importHistoryQuery,
    ]);

    if (transactionsResult.errorMessage || historyResult.error) {
      setError(transactionsResult.errorMessage ?? historyResult.error?.message ?? "Failed to load app data.");
      setImportedTransactions([]);
      setImportHistoryFiles([]);
      setLoading(false);
      return;
    }

    setError(null);
    setImportedTransactions(
      transactionsResult.rows
        .map((record) => sanitiseImportedTransactionRecord(record))
        .filter((record): record is ImportedTransactionRecord => record !== null),
    );
    setImportHistoryFiles(
      Array.isArray(historyResult.data)
        ? historyResult.data
            .map((record) => sanitiseImportHistoryFileRecord(record))
            .filter((record): record is ImportHistoryFileRecord => record !== null)
        : [],
    );
    setLoading(false);
  }, [selectedRepresentedAccount, selectedRepresentedAccountId, user]);

  useEffect(() => {
    if (userDataLoading) {
      setLoading(true);
      return;
    }

    void refreshAppData();
  }, [refreshAppData, userDataLoading]);

  /**
   * Importablauf. Die Reihenfolge ist fachlich bedingt: Jede Transaktion
   * verweist über import_file_id auf ihre Importdatei, also muss die Datei
   * protokolliert sein, bevor die Transaktionen geschrieben werden.
   *   1. Börsenkonto der Plattform anlegen oder aktualisieren
   *   2. Datei in den Storage hochladen
   *   3. Eintrag in import_history_files anlegen und dessen id übernehmen
   *   4. Neue Transaktionen mit import_file_id schreiben
   */
  const importTransactionsFromFile = useCallback(
    async (
      file: File,
      platform: SupportedImportPlatform,
    ): Promise<TransactionImportSummary> => {
      if (!supabase || !user) {
        const message = "Supabase import is not available right now.";

        setError(message);
        throw new Error(message);
      }

      const client = supabase;

      setImporting(true);
      setError(null);

      try {
        const fileText = await file.text();
        const storedFileName = buildImportHistoryStoredFileName(platform);
        // Zuerst parsen: Ist die Datei unbrauchbar, wird weder Konto noch Datei angelegt.
        const parsedTransactions = parseImportedTransactionsFromFile(fileText, platform);
        const platformLabel =
          IMPORT_PLATFORM_OPTIONS.find((option) => option.id === platform)?.label ?? platform;

        // Schritt 1: Börsenkonto. represented_accounts behält owner_user_id,
        // es ist die einzige Stelle, an der das Eigentum gespeichert wird.
        const { data: representedAccountData, error: representedAccountError } = await client
          .from("represented_accounts")
          .upsert(
            {
              owner_user_id: user.id,
              ...createRepresentedAccountSeed(platform, platformLabel),
            },
            { onConflict: "owner_user_id,provider,name" },
          )
          .select("id")
          .single();

        if (representedAccountError || !representedAccountData?.id) {
          throw new Error(representedAccountError?.message ?? "Failed to prepare the exchange account.");
        }

        const representedAccountId: string = representedAccountData.id;

        // Vorfilter gegen bereits geladene Vorgänge desselben Kontos. Das spart
        // Schreibzugriffe; die verbindliche Dublettenprüfung macht die Datenbank
        // über den Schlüssel (represented_account_id, external_id).
        const existingExternalIds = new Set(
          importedTransactions
            .filter((transaction) => transaction.represented_account_id === representedAccountId)
            .map((transaction) => transaction.external_id),
        );
        const newTransactions = parsedTransactions.filter(
          (transaction) => !existingExternalIds.has(transaction.external_id),
        );

        // Schritt 2: Datei im Storage ablegen.
        const storagePath = buildImportHistoryStoragePath(user.id, representedAccountId, storedFileName);
        const { error: uploadError } = await client.storage
          .from(IMPORT_HISTORY_BUCKET)
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: file.type || "text/csv",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        // Schritt 3: Importdatei protokollieren und ihre id für die Transaktionen übernehmen.
        const { data: importFileData, error: importHistoryError } = await client
          .from("import_history_files")
          .insert({
            represented_account_id: representedAccountId,
            stored_file_name: storedFileName,
            original_file_name: file.name,
            storage_bucket: IMPORT_HISTORY_BUCKET,
            storage_path: storagePath,
            content_type: file.type || "text/csv",
            file_size_bytes: file.size,
          })
          .select("id")
          .single();

        if (importHistoryError || !importFileData?.id) {
          await client.storage.from(IMPORT_HISTORY_BUCKET).remove([storagePath]);
          throw new Error(importHistoryError?.message ?? "Failed to record the import file.");
        }

        const importFileId: string = importFileData.id;

        // Schritt 4: Transaktionen schreiben. ignoreDuplicates entspricht
        // "on conflict do nothing"; die Datenbank gibt dann nur die tatsächlich
        // neu angelegten Zeilen zurück. Deren Anzahl ist die gemeldete Importzahl.
        let insertedCount = 0;

        try {
          const rowsToInsert = newTransactions.map((transaction) => ({
            represented_account_id: representedAccountId,
            import_file_id: importFileId,
            ...transaction,
          }));

          for (let index = 0; index < rowsToInsert.length; index += TRANSACTIONS_WRITE_BATCH_SIZE) {
            const batch = rowsToInsert.slice(index, index + TRANSACTIONS_WRITE_BATCH_SIZE);
            const { data: insertedRows, error: queryError } = await client
              .from("imported_transactions")
              .upsert(batch, {
                onConflict: "represented_account_id,external_id",
                ignoreDuplicates: true,
              })
              .select("id");

            if (queryError) {
              throw new Error(queryError.message);
            }

            insertedCount += Array.isArray(insertedRows) ? insertedRows.length : 0;
          }
        } catch (writeError) {
          // Wurde noch keine Transaktion gespeichert, ist die protokollierte Datei
          // ohne Bezug. Dann Protokolleintrag und Datei wieder entfernen.
          // Wurden schon Stapel gespeichert, bleibt die Datei als deren Herkunft stehen.
          if (insertedCount === 0) {
            await client.from("import_history_files").delete().eq("id", importFileId);
            await client.storage.from(IMPORT_HISTORY_BUCKET).remove([storagePath]);
          }

          throw writeError;
        }

        await refreshAppData();

        return {
          fileName: storedFileName,
          originalFileName: file.name,
          importedCount: insertedCount,
          skippedCount: parsedTransactions.length - insertedCount,
          totalParsedCount: parsedTransactions.length,
          platform,
        };
      } catch (importError) {
        const message =
          importError instanceof Error ? importError.message : "Failed to import transactions.";
        setError(message);
        throw new Error(message);
      } finally {
        setImporting(false);
      }
    },
    [importedTransactions, refreshAppData, user],
  );

  const downloadImportHistoryFile = useCallback(async (historyFile: ImportHistoryFileRecord) => {
    if (!supabase) {
      const message = "Supabase storage is not available right now.";

      setError(message);
      throw new Error(message);
    }

    const { data, error: downloadError } = await supabase.storage
      .from(historyFile.storage_bucket)
      .download(historyFile.storage_path);

    if (downloadError || !data) {
      const message = downloadError?.message ?? "Failed to download the import history file.";

      setError(message);
      throw new Error(message);
    }

    const url = URL.createObjectURL(data);
    const link = document.createElement("a");

    link.href = url;
    link.download = historyFile.stored_file_name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  // Herkunft für die Anzeige: Plattform über das Börsenkonto, Dateiname über
  // die Importdatei. Beides wird nicht mehr in der Transaktion gespeichert.
  const transactionOrigin = useMemo<TransactionOriginContext>(
    () => ({
      providerByAccountId: new Map(representedAccounts.map((account) => [account.id, account.provider])),
      fileNameByImportFileId: new Map(importHistoryFiles.map((file) => [file.id, file.stored_file_name])),
    }),
    [importHistoryFiles, representedAccounts],
  );

  const data = useMemo(
    () =>
      importedTransactions.length > 0
        ? buildWorkbookDataFromImportedTransactions(importedTransactions, transactionOrigin)
        : createEmptyWorkbookData(),
    [importedTransactions, transactionOrigin],
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      data,
      importHistoryFiles,
      loading,
      error,
      importing,
      importTransactionsFromFile,
      downloadImportHistoryFile,
      refreshAppData,
    }),
    [
      data,
      importHistoryFiles,
      loading,
      error,
      importing,
      importTransactionsFromFile,
      downloadImportHistoryFile,
      refreshAppData,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};
