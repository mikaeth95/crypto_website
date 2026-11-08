/**
 * Benutzerbezogene Stammdaten und Einstellungen.
 *
 * Zweck:
 *   Lädt Profil (inklusive Rolle), Börsenkonten, Chart-Zusammenstellungen und
 *   Einstellungen des angemeldeten Benutzers und stellt sie der Oberfläche
 *   bereit. Verwaltet außerdem das Anlegen, Ändern und Löschen von
 *   Chart-Zusammenstellungen.
 *
 * Eingaben:
 *   - Angemeldeter Benutzer (AuthContext).
 *   - Tabellen profiles, represented_accounts, live_chart_presets,
 *     live_chart_preset_assets und user_preferences.
 *
 * Ausgaben:
 *   - profile und role: Die Rolle steuert nur die Bedienerführung (Menüpunkt
 *     "Administration", Routenprüfung). Der Schutz liegt in der Datenbank.
 *   - liveChartPresets: Zusammenstellungen im bisherigen Oberflächenformat
 *     (name, assets in fester Reihenfolge, provider).
 *
 * Annahmen:
 *   - Jede Zusammenstellung gehört zu genau einem Börsenkonto
 *     (represented_account_id ist nach der Migration Pflicht).
 *   - Die Handelspaare liegen je Zeile in live_chart_preset_assets mit
 *     position 1 bis 4. Die Reihenfolge der Oberfläche entspricht position.
 *   - provider einer Zusammenstellung wird nicht mehr gespeichert, sondern aus
 *     dem Börsenkonto abgeleitet. Für das Sammelkonto "All" (provider "all")
 *     gibt es keine eigene Marktdatenquelle, dort gilt die Standardquelle
 *     LIVE_CHART_PROVIDER.
 *   - Fehlt die Rollenspalte (Migration 02 noch nicht eingespielt), gilt "user".
 */
import { createContext, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  DEFAULT_ALL_REPRESENTED_ACCOUNT,
  isAllRepresentedAccount,
  sortRepresentedAccounts,
} from "../lib/representedAccounts";
import { supabase } from "../lib/supabase";
import { sanitizePresetAssets } from "../lib/liveChartPresets";
import {
  CHART_TIMEFRAMES,
  DEFAULT_TIMEFRAME,
  LIVE_CHART_PROVIDER,
  type ChartTimeframe,
  type LiveChartProvider,
  type MarketSymbol,
} from "../types/market";
import type {
  LiveChartPresetAssetRecord,
  LiveChartPresetRecord,
  ProfileRecord,
  RepresentedAccountRecord,
  UserPreferencesRecord,
  UserRole,
} from "../types/supabase";

/**
 * Zusammenstellung im Format der Oberfläche: Kopfzeile aus live_chart_presets
 * plus die sortierten Handelspaare und die aus dem Konto abgeleitete Datenquelle.
 */
export type LiveChartPresetView = LiveChartPresetRecord & {
  provider: LiveChartProvider | string;
  assets: MarketSymbol[];
};

type CreateLiveChartPresetInput = {
  name: string;
  assets: string[];
  representedAccountId?: string | null;
};

type UpdateLiveChartPresetInput = {
  name: string;
  assets: string[];
};

type CreateLiveChartPresetOptions = {
  ignoreDuplicate?: boolean;
};

export interface UserDataContextValue {
  loading: boolean;
  error: string | null;
  profile: ProfileRecord | null;
  /** Rolle des angemeldeten Benutzers. Nur Bedienerführung, kein Schutz. */
  role: UserRole;
  isAdmin: boolean;
  representedAccounts: RepresentedAccountRecord[];
  selectedRepresentedAccountId: string | null;
  selectedRepresentedAccount: RepresentedAccountRecord | null;
  liveChartPresets: LiveChartPresetView[];
  selectedPresetId: string | null;
  selectedTimeframe: ChartTimeframe;
  refreshUserData: () => Promise<void>;
  setSelectedRepresentedAccountId: (accountId: string | null) => Promise<void>;
  setSelectedPresetId: (presetId: string | null) => Promise<void>;
  setSelectedTimeframe: (timeframe: ChartTimeframe) => Promise<void>;
  createLiveChartPreset: (
    input: CreateLiveChartPresetInput,
    options?: CreateLiveChartPresetOptions,
  ) => Promise<LiveChartPresetView | null>;
  updateLiveChartPreset: (
    presetId: string,
    input: UpdateLiveChartPresetInput,
  ) => Promise<LiveChartPresetView | null>;
  deleteLiveChartPreset: (presetId: string) => Promise<boolean>;
}

const isChartTimeframe = (value: string | null | undefined): value is ChartTimeframe =>
  CHART_TIMEFRAMES.includes(value as ChartTimeframe);

const sanitiseProfileRecord = (value: unknown): ProfileRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ProfileRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    display_name: typeof candidate.display_name === "string" ? candidate.display_name : null,
    // Alles außer "admin" wird als Standardbenutzer behandelt (sichere Voreinstellung).
    role: candidate.role === "admin" ? "admin" : "user",
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
};

const sanitiseRepresentedAccountRecord = (value: unknown): RepresentedAccountRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RepresentedAccountRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.owner_user_id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.provider !== "string" ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    owner_user_id: candidate.owner_user_id,
    name: candidate.name,
    provider: candidate.provider,
    base_currency: typeof candidate.base_currency === "string" ? candidate.base_currency : null,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
};

/** Spaltenliste für Zusammenstellungen inklusive eingebetteter Handelspaare. */
const LIVE_CHART_PRESET_SELECT = "*, live_chart_preset_assets(position, instrument)";

/**
 * Datenquelle einer Zusammenstellung aus dem Börsenkonto. Nur Konten einer
 * echten Plattform liefern einen eigenen Wert, sonst gilt die Standardquelle.
 */
const resolvePresetProvider = (
  representedAccountId: string,
  accounts: RepresentedAccountRecord[],
): LiveChartProvider | string => {
  const account = accounts.find((candidate) => candidate.id === representedAccountId);

  return account && !isAllRepresentedAccount(account) ? account.provider : LIVE_CHART_PROVIDER;
};

/** Sortiert die eingebetteten Handelspaare nach position und liefert die Symbole. */
const extractPresetAssets = (value: unknown): MarketSymbol[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows = value.filter(
    (row): row is Pick<LiveChartPresetAssetRecord, "position" | "instrument"> =>
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as { position?: unknown }).position === "number" &&
      typeof (row as { instrument?: unknown }).instrument === "string",
  );

  return sanitizePresetAssets(
    [...rows].sort((left, right) => left.position - right.position).map((row) => row.instrument),
  );
};

/**
 * Prüft eine Zusammenstellung aus der Datenbank und bildet sie auf das
 * Oberflächenformat ab. Zusammenstellungen ohne gültige Handelspaare werden
 * ausgeblendet, weil die Oberfläche mindestens ein Paar erwartet.
 */
const sanitiseLiveChartPresetRecord = (
  value: unknown,
  accounts: RepresentedAccountRecord[],
): LiveChartPresetView | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<LiveChartPresetRecord> & { live_chart_preset_assets?: unknown };
  const assets = extractPresetAssets(candidate.live_chart_preset_assets);

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.represented_account_id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string" ||
    assets.length === 0
  ) {
    return null;
  }

  return {
    id: candidate.id,
    represented_account_id: candidate.represented_account_id,
    provider: resolvePresetProvider(candidate.represented_account_id, accounts),
    name: candidate.name,
    assets,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
};

/** Zeilen für live_chart_preset_assets: position beginnt bei 1, Reihenfolge wie übergeben. */
const buildPresetAssetRows = (presetId: string, assets: MarketSymbol[]): LiveChartPresetAssetRecord[] =>
  assets.map((instrument, index) => ({
    preset_id: presetId,
    position: index + 1,
    instrument,
  }));

const sortPresetsByCreation = (presets: LiveChartPresetView[]): LiveChartPresetView[] =>
  [...presets].sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  );

const sanitiseUserPreferencesRecord = (value: unknown): UserPreferencesRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<UserPreferencesRecord>;

  if (typeof candidate.owner_user_id !== "string" || typeof candidate.updated_at !== "string") {
    return null;
  }

  return {
    owner_user_id: candidate.owner_user_id,
    selected_preset_id:
      typeof candidate.selected_preset_id === "string" ? candidate.selected_preset_id : null,
    selected_timeframe:
      typeof candidate.selected_timeframe === "string" ? candidate.selected_timeframe : null,
    selected_represented_account_id:
      typeof candidate.selected_represented_account_id === "string"
        ? candidate.selected_represented_account_id
        : null,
    updated_at: candidate.updated_at,
  };
};

export const UserDataContext = createContext<UserDataContextValue | undefined>(undefined);

export const UserDataProvider = ({ children }: PropsWithChildren) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [representedAccounts, setRepresentedAccounts] = useState<RepresentedAccountRecord[]>([]);
  const [liveChartPresets, setLiveChartPresets] = useState<LiveChartPresetView[]>([]);
  const [selectedRepresentedAccountId, setSelectedRepresentedAccountIdState] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetIdState] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframeState] = useState<ChartTimeframe>(DEFAULT_TIMEFRAME);

  const savePreferences = useCallback(
    async (nextPreferences: {
      selectedPresetId: string | null;
      selectedRepresentedAccountId: string | null;
      selectedTimeframe: ChartTimeframe;
    }) => {
      if (!supabase || !user) {
        return null;
      }

      setSelectedPresetIdState(nextPreferences.selectedPresetId);
      setSelectedRepresentedAccountIdState(nextPreferences.selectedRepresentedAccountId);
      setSelectedTimeframeState(nextPreferences.selectedTimeframe);

      const { data, error: queryError } = await supabase
        .from("user_preferences")
        .upsert(
          {
            owner_user_id: user.id,
            selected_preset_id: nextPreferences.selectedPresetId,
            selected_represented_account_id: nextPreferences.selectedRepresentedAccountId,
            selected_timeframe: nextPreferences.selectedTimeframe,
          },
          { onConflict: "owner_user_id" },
        )
        .select("*")
        .single();

      if (queryError) {
        setError(queryError.message);
        return null;
      }

      const nextRecord = sanitiseUserPreferencesRecord(data);

      if (!nextRecord) {
        setError("Supabase returned an invalid preferences payload.");
        return null;
      }

      setError(null);
      setSelectedPresetIdState(nextRecord.selected_preset_id);
      setSelectedRepresentedAccountIdState(nextRecord.selected_represented_account_id);
      setSelectedTimeframeState(
        isChartTimeframe(nextRecord.selected_timeframe) ? nextRecord.selected_timeframe : DEFAULT_TIMEFRAME,
      );

      return nextRecord;
    },
    [user],
  );

  const ensureDefaultRepresentedAccount = useCallback(async () => {
    if (!supabase || !user) {
      return null;
    }

    const { data, error: queryError } = await supabase
      .from("represented_accounts")
      .upsert(
          {
            owner_user_id: user.id,
            ...DEFAULT_ALL_REPRESENTED_ACCOUNT,
          },
        { onConflict: "owner_user_id,provider,name" },
      )
      .select("*")
      .single();

    if (queryError) {
      setError(queryError.message);
      return null;
    }

    const nextAccount = sanitiseRepresentedAccountRecord(data);

    if (!nextAccount) {
      setError("Supabase returned an invalid represented account payload.");
      return null;
    }

    setRepresentedAccounts((currentAccounts) => {
      const hasAccount = currentAccounts.some((account) => account.id === nextAccount.id);

      return hasAccount ? currentAccounts : sortRepresentedAccounts([...currentAccounts, nextAccount]);
    });

    return nextAccount;
  }, [user]);

  const refreshUserData = useCallback(async () => {
    if (!supabase || !user) {
      setLoading(false);
      setProfile(null);
      setRepresentedAccounts([]);
      setLiveChartPresets([]);
      setSelectedRepresentedAccountIdState(null);
      setSelectedPresetIdState(null);
      setSelectedTimeframeState(DEFAULT_TIMEFRAME);
      return;
    }

    setLoading(true);
    setError(null);

    const [profileResult, accountsResult, presetsResult, preferencesResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("represented_accounts").select("*").order("created_at", { ascending: true }),
      supabase.from("live_chart_presets").select(LIVE_CHART_PRESET_SELECT).order("created_at", { ascending: true }),
      supabase.from("user_preferences").select("*").eq("owner_user_id", user.id).maybeSingle(),
    ]);

    const firstError =
      profileResult.error ?? accountsResult.error ?? presetsResult.error ?? preferencesResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    let nextAccounts = Array.isArray(accountsResult.data)
      ? accountsResult.data
          .map((account) => sanitiseRepresentedAccountRecord(account))
          .filter((account): account is RepresentedAccountRecord => account !== null)
      : [];

    if (!nextAccounts.some((account) => isAllRepresentedAccount(account))) {
      const defaultAccount = await ensureDefaultRepresentedAccount();

      if (defaultAccount) {
        nextAccounts = [
          defaultAccount,
          ...nextAccounts.filter((account) => account.id !== defaultAccount.id),
        ];
      }
    }

    const nextPresets = Array.isArray(presetsResult.data)
      ? presetsResult.data
          .map((preset) => sanitiseLiveChartPresetRecord(preset, nextAccounts))
          .filter((preset): preset is LiveChartPresetView => preset !== null)
      : [];

    const nextPreferences = sanitiseUserPreferencesRecord(preferencesResult.data);
    const nextSelectedRepresentedAccountId =
      nextAccounts.find((account) => account.id === nextPreferences?.selected_represented_account_id)?.id ??
      nextAccounts.find((account) => isAllRepresentedAccount(account))?.id ??
      nextAccounts[0]?.id ??
      null;
    const nextSelectedTimeframe = isChartTimeframe(nextPreferences?.selected_timeframe)
      ? nextPreferences.selected_timeframe
      : DEFAULT_TIMEFRAME;
    const nextSelectedPresetId =
      nextPresets.find(
        (preset) =>
          preset.id === nextPreferences?.selected_preset_id &&
          preset.represented_account_id === nextSelectedRepresentedAccountId,
      )?.id ?? null;

    setProfile(sanitiseProfileRecord(profileResult.data));
    setRepresentedAccounts(sortRepresentedAccounts(nextAccounts));
    setLiveChartPresets(sortPresetsByCreation(nextPresets));
    setSelectedRepresentedAccountIdState(nextSelectedRepresentedAccountId);
    setSelectedPresetIdState(nextSelectedPresetId);
    setSelectedTimeframeState(nextSelectedTimeframe);

    if (
      !nextPreferences ||
      nextPreferences.selected_preset_id !== nextSelectedPresetId ||
      nextPreferences.selected_represented_account_id !== nextSelectedRepresentedAccountId ||
      !isChartTimeframe(nextPreferences.selected_timeframe)
    ) {
      await savePreferences({
        selectedPresetId: nextSelectedPresetId,
        selectedRepresentedAccountId: nextSelectedRepresentedAccountId,
        selectedTimeframe: nextSelectedTimeframe,
      });
    }

    setLoading(false);
  }, [ensureDefaultRepresentedAccount, savePreferences, user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setError(null);
      setProfile(null);
      setRepresentedAccounts([]);
      setLiveChartPresets([]);
      setSelectedRepresentedAccountIdState(null);
      setSelectedPresetIdState(null);
      setSelectedTimeframeState(DEFAULT_TIMEFRAME);
      return;
    }

    void refreshUserData();
  }, [refreshUserData, user]);

  /** Liest eine Zusammenstellung samt Handelspaaren neu, nachdem sie geschrieben wurde. */
  const reloadPreset = useCallback(
    async (presetId: string): Promise<LiveChartPresetView | null> => {
      if (!supabase) {
        return null;
      }

      const { data, error: reloadError } = await supabase
        .from("live_chart_presets")
        .select(LIVE_CHART_PRESET_SELECT)
        .eq("id", presetId)
        .single();

      if (reloadError) {
        setError(reloadError.message);
        return null;
      }

      const preset = sanitiseLiveChartPresetRecord(data, representedAccounts);

      if (!preset) {
        setError("Supabase returned an invalid live chart preset payload.");
        return null;
      }

      setError(null);
      return preset;
    },
    [representedAccounts],
  );

  /**
   * Legt eine Zusammenstellung an: zuerst die Kopfzeile, danach die
   * Handelspaare einzeln mit position 1 bis 4. Scheitert das Schreiben der
   * Paare, wird die Kopfzeile wieder gelöscht, damit keine leere
   * Zusammenstellung den Namen blockiert.
   */
  const createLiveChartPreset = useCallback(
    async (
      input: CreateLiveChartPresetInput,
      options?: CreateLiveChartPresetOptions,
    ): Promise<LiveChartPresetView | null> => {
      if (!supabase || !user) {
        return null;
      }

      const representedAccountId = input.representedAccountId ?? selectedRepresentedAccountId;
      const assets = sanitizePresetAssets(input.assets);
      const name = input.name.trim();

      if (!name || assets.length === 0) {
        setError("Preset name and assets are required.");
        return null;
      }

      if (!representedAccountId) {
        setError("Select a represented account before creating presets.");
        return null;
      }

      const { data, error: queryError } = await supabase
        .from("live_chart_presets")
        .insert({
          represented_account_id: representedAccountId,
          name,
        })
        .select("id")
        .single();

      if (queryError) {
        if (options?.ignoreDuplicate && queryError.code === "23505") {
          // Dublette: Der Name ist im Konto schon vergeben. Die bestehende
          // Zusammenstellung über das Konto suchen (eindeutig über Konto und Name).
          const { data: existingPresetData, error: existingPresetError } = await supabase
            .from("live_chart_presets")
            .select(LIVE_CHART_PRESET_SELECT)
            .eq("represented_account_id", representedAccountId)
            .eq("name", name)
            .maybeSingle();

          if (existingPresetError) {
            setError(existingPresetError.message);
            return null;
          }

          const existingPreset = sanitiseLiveChartPresetRecord(existingPresetData, representedAccounts);

          if (existingPreset) {
            setLiveChartPresets((currentPresets) => {
              const hasPreset = currentPresets.some((preset) => preset.id === existingPreset.id);
              return hasPreset ? currentPresets : sortPresetsByCreation([...currentPresets, existingPreset]);
            });
            return existingPreset;
          }
        }

        setError(
          queryError.code === "23505"
            ? "A preset with that name already exists for this represented account."
            : queryError.message,
        );
        return null;
      }

      const presetId: string | undefined = data?.id;

      if (!presetId) {
        setError("Supabase returned an invalid live chart preset payload.");
        return null;
      }

      const { error: assetsError } = await supabase
        .from("live_chart_preset_assets")
        .insert(buildPresetAssetRows(presetId, assets));

      if (assetsError) {
        await supabase.from("live_chart_presets").delete().eq("id", presetId);
        setError(assetsError.message);
        return null;
      }

      const nextPreset = await reloadPreset(presetId);

      if (!nextPreset) {
        return null;
      }

      setLiveChartPresets((currentPresets) => sortPresetsByCreation([...currentPresets, nextPreset]));
      return nextPreset;
    },
    [reloadPreset, representedAccounts, selectedRepresentedAccountId, user],
  );

  /**
   * Ändert Name und Handelspaare einer Zusammenstellung. Die Paare werden
   * vollständig ersetzt (alte Zeilen löschen, neue schreiben), weil ein
   * Umsortieren per Update wegen der Schlüssel (preset_id, position) und
   * (preset_id, instrument) zu Zwischenkonflikten führen würde.
   * Hinweis: Die Schritte laufen ohne gemeinsame Transaktion. Scheitert das
   * Schreiben der neuen Paare, ist die Zusammenstellung leer, wird beim
   * nächsten Laden ausgeblendet und der Fehler wird angezeigt.
   */
  const updateLiveChartPreset = useCallback(
    async (presetId: string, input: UpdateLiveChartPresetInput): Promise<LiveChartPresetView | null> => {
      if (!supabase || !user) {
        return null;
      }

      const assets = sanitizePresetAssets(input.assets);
      const name = input.name.trim();

      if (!name || assets.length === 0) {
        setError("Preset name and assets are required.");
        return null;
      }

      const { error: renameError } = await supabase
        .from("live_chart_presets")
        .update({ name })
        .eq("id", presetId);

      if (renameError) {
        setError(
          renameError.code === "23505"
            ? "A preset with that name already exists for this represented account."
            : renameError.message,
        );
        return null;
      }

      const { error: deleteAssetsError } = await supabase
        .from("live_chart_preset_assets")
        .delete()
        .eq("preset_id", presetId);

      if (deleteAssetsError) {
        setError(deleteAssetsError.message);
        return null;
      }

      const { error: insertAssetsError } = await supabase
        .from("live_chart_preset_assets")
        .insert(buildPresetAssetRows(presetId, assets));

      if (insertAssetsError) {
        setError(insertAssetsError.message);
        return null;
      }

      const nextPreset = await reloadPreset(presetId);

      if (!nextPreset) {
        return null;
      }

      setLiveChartPresets((currentPresets) =>
        currentPresets.map((preset) => (preset.id === presetId ? nextPreset : preset)),
      );
      return nextPreset;
    },
    [reloadPreset, user],
  );

  const deleteLiveChartPreset = useCallback(
    async (presetId: string) => {
      if (!supabase || !user) {
        return false;
      }

      // Die Handelspaare in live_chart_preset_assets entfernt die Datenbank
      // über "on delete cascade" mit.
      const { error: queryError } = await supabase.from("live_chart_presets").delete().eq("id", presetId);

      if (queryError) {
        setError(queryError.message);
        return false;
      }

      setError(null);
      setLiveChartPresets((currentPresets) =>
        currentPresets.filter((preset) => preset.id !== presetId),
      );

      if (selectedPresetId === presetId) {
        await savePreferences({
          selectedPresetId: null,
          selectedRepresentedAccountId,
          selectedTimeframe,
        });
      }

      return true;
    },
    [savePreferences, selectedPresetId, selectedRepresentedAccountId, selectedTimeframe, user],
  );

  const setSelectedRepresentedAccountId = useCallback(
    async (accountId: string | null) => {
      await savePreferences({
        selectedPresetId: null,
        selectedRepresentedAccountId: accountId,
        selectedTimeframe,
      });
    },
    [savePreferences, selectedTimeframe],
  );

  const setSelectedPresetId = useCallback(
    async (presetId: string | null) => {
      await savePreferences({
        selectedPresetId: presetId,
        selectedRepresentedAccountId,
        selectedTimeframe,
      });
    },
    [savePreferences, selectedRepresentedAccountId, selectedTimeframe],
  );

  const setSelectedTimeframe = useCallback(
    async (timeframe: ChartTimeframe) => {
      await savePreferences({
        selectedPresetId,
        selectedRepresentedAccountId,
        selectedTimeframe: timeframe,
      });
    },
    [savePreferences, selectedPresetId, selectedRepresentedAccountId],
  );

  const selectedRepresentedAccount = useMemo(
    () =>
      representedAccounts.find((account) => account.id === selectedRepresentedAccountId) ?? null,
    [representedAccounts, selectedRepresentedAccountId],
  );

  const role: UserRole = profile?.role ?? "user";

  const value = useMemo<UserDataContextValue>(
    () => ({
      loading,
      error,
      profile,
      role,
      isAdmin: role === "admin",
      representedAccounts,
      selectedRepresentedAccountId,
      selectedRepresentedAccount,
      liveChartPresets,
      selectedPresetId,
      selectedTimeframe,
      refreshUserData,
      setSelectedRepresentedAccountId,
      setSelectedPresetId,
      setSelectedTimeframe,
      createLiveChartPreset,
      updateLiveChartPreset,
      deleteLiveChartPreset,
    }),
    [
      loading,
      error,
      profile,
      role,
      representedAccounts,
      selectedRepresentedAccountId,
      selectedRepresentedAccount,
      liveChartPresets,
      selectedPresetId,
      selectedTimeframe,
      refreshUserData,
      setSelectedRepresentedAccountId,
      setSelectedPresetId,
      setSelectedTimeframe,
      createLiveChartPreset,
      updateLiveChartPreset,
      deleteLiveChartPreset,
    ],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
};
