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
  importedCount: number;
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

const sanitiseImportedTransactionRecord = (value: unknown): ImportedTransactionRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ImportedTransactionRecord>;
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

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.owner_user_id !== "string" ||
    typeof candidate.represented_account_id !== "string" ||
    typeof candidate.source_platform !== "string" ||
    typeof candidate.external_id !== "string" ||
    typeof candidate.occurred_at !== "string" ||
    typeof candidate.transaction_type !== "string" ||
    typeof candidate.asset !== "string" ||
    typeof candidate.exchange !== "string" ||
    typeof candidate.data_source !== "string" ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    owner_user_id: candidate.owner_user_id,
    represented_account_id: candidate.represented_account_id,
    source_platform: candidate.source_platform,
    external_id: candidate.external_id,
    source_file_name: typeof candidate.source_file_name === "string" ? candidate.source_file_name : null,
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
    exchange: candidate.exchange,
    data_source: candidate.data_source,
    raw_payload: candidate.raw_payload ?? null,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
};

const sanitiseImportHistoryFileRecord = (value: unknown): ImportHistoryFileRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ImportHistoryFileRecord>;
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

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.owner_user_id !== "string" ||
    typeof candidate.represented_account_id !== "string" ||
    typeof candidate.source_platform !== "string" ||
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
    owner_user_id: candidate.owner_user_id,
    represented_account_id: candidate.represented_account_id,
    source_platform: candidate.source_platform,
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

export const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export const AppDataProvider = ({ children }: PropsWithChildren) => {
  const { user } = useAuth();
  const { loading: userDataLoading, selectedRepresentedAccount, selectedRepresentedAccountId } = useUserData();
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

    const importedTransactionsQuery = supabase
      .from("imported_transactions")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("occurred_at", { ascending: false });
    const importHistoryQuery = supabase
      .from("import_history_files")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("imported_at", { ascending: false });

    const [transactionsResult, historyResult] = await Promise.all([
      isAllRepresentedAccount(selectedRepresentedAccount)
        ? importedTransactionsQuery
        : importedTransactionsQuery.eq("represented_account_id", selectedRepresentedAccountId),
      isAllRepresentedAccount(selectedRepresentedAccount)
        ? importHistoryQuery
        : importHistoryQuery.eq("represented_account_id", selectedRepresentedAccountId),
    ]);

    if (transactionsResult.error || historyResult.error) {
      setError(transactionsResult.error?.message ?? historyResult.error?.message ?? "Failed to load app data.");
      setImportedTransactions([]);
      setImportHistoryFiles([]);
      setLoading(false);
      return;
    }

    setError(null);
    setImportedTransactions(
      Array.isArray(transactionsResult.data)
        ? transactionsResult.data
            .map((record) => sanitiseImportedTransactionRecord(record))
            .filter((record): record is ImportedTransactionRecord => record !== null)
        : [],
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

      setImporting(true);
      setError(null);

      try {
        const fileText = await file.text();
        const storedFileName = buildImportHistoryStoredFileName(platform);
        const parsedTransactions = parseImportedTransactionsFromFile(fileText, platform, storedFileName);
        const platformLabel =
          IMPORT_PLATFORM_OPTIONS.find((option) => option.id === platform)?.label ?? platform;
        const { data: representedAccountData, error: representedAccountError } = await supabase
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

        const storagePath = buildImportHistoryStoragePath(user.id, representedAccountData.id, storedFileName);

        const existingExternalIds = new Set(
          importedTransactions
            .filter((transaction) =>
              isAllRepresentedAccount(selectedRepresentedAccount)
                ? transaction.source_platform === platform
                : transaction.represented_account_id === representedAccountData.id,
            )
            .map((transaction) => transaction.external_id),
        );
        const newTransactions = parsedTransactions.filter(
          (transaction) => !existingExternalIds.has(transaction.external_id),
        );

        if (newTransactions.length > 0) {
          const rowsToInsert = newTransactions.map((transaction) => ({
            owner_user_id: user.id,
            represented_account_id: representedAccountData.id,
            ...transaction,
          }));

          for (let index = 0; index < rowsToInsert.length; index += 250) {
            const batch = rowsToInsert.slice(index, index + 250);
            const { data, error: queryError } = await supabase
              .from("imported_transactions")
              .upsert(batch, {
                onConflict: "owner_user_id,represented_account_id,source_platform,external_id",
                ignoreDuplicates: true,
              })
              .select("*");

            if (queryError) {
              throw new Error(queryError.message);
            }
          }
        }

        const { error: uploadError } = await supabase.storage
          .from(IMPORT_HISTORY_BUCKET)
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: file.type || "text/csv",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const { error: importHistoryError } = await supabase.from("import_history_files").insert({
          owner_user_id: user.id,
          represented_account_id: representedAccountData.id,
          source_platform: platform,
          stored_file_name: storedFileName,
          original_file_name: file.name,
          storage_bucket: IMPORT_HISTORY_BUCKET,
          storage_path: storagePath,
          content_type: file.type || "text/csv",
          file_size_bytes: file.size,
        });

        if (importHistoryError) {
          await supabase.storage.from(IMPORT_HISTORY_BUCKET).remove([storagePath]);
          throw new Error(importHistoryError.message);
        }

        await refreshAppData();

        return {
          fileName: storedFileName,
          originalFileName: file.name,
          importedCount: newTransactions.length,
          skippedCount: parsedTransactions.length - newTransactions.length,
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
    [importedTransactions, refreshAppData, selectedRepresentedAccount, user],
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

  const data = useMemo(
    () =>
      importedTransactions.length > 0
        ? buildWorkbookDataFromImportedTransactions(importedTransactions)
        : createEmptyWorkbookData(),
    [importedTransactions],
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
