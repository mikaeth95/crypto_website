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
} from "../types/market";
import type {
  LiveChartPresetRecord,
  ProfileRecord,
  RepresentedAccountRecord,
  UserPreferencesRecord,
} from "../types/supabase";

type CreateLiveChartPresetInput = {
  name: string;
  assets: string[];
  provider?: string;
  representedAccountId?: string | null;
};

type CreateLiveChartPresetOptions = {
  ignoreDuplicate?: boolean;
};

export interface UserDataContextValue {
  loading: boolean;
  error: string | null;
  profile: ProfileRecord | null;
  representedAccounts: RepresentedAccountRecord[];
  selectedRepresentedAccountId: string | null;
  selectedRepresentedAccount: RepresentedAccountRecord | null;
  liveChartPresets: LiveChartPresetRecord[];
  selectedPresetId: string | null;
  selectedTimeframe: ChartTimeframe;
  refreshUserData: () => Promise<void>;
  setSelectedRepresentedAccountId: (accountId: string | null) => Promise<void>;
  setSelectedPresetId: (presetId: string | null) => Promise<void>;
  setSelectedTimeframe: (timeframe: ChartTimeframe) => Promise<void>;
  createLiveChartPreset: (
    input: CreateLiveChartPresetInput,
    options?: CreateLiveChartPresetOptions,
  ) => Promise<LiveChartPresetRecord | null>;
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

const sanitiseLiveChartPresetRecord = (value: unknown): LiveChartPresetRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<LiveChartPresetRecord> & { assets?: unknown };
  const assets = Array.isArray(candidate.assets) ? sanitizePresetAssets(candidate.assets as string[]) : [];

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.owner_user_id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.provider !== "string" ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string" ||
    assets.length === 0
  ) {
    return null;
  }

  return {
    id: candidate.id,
    owner_user_id: candidate.owner_user_id,
    represented_account_id:
      typeof candidate.represented_account_id === "string" ? candidate.represented_account_id : null,
    provider: candidate.provider,
    name: candidate.name,
    assets,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
};

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
  const [liveChartPresets, setLiveChartPresets] = useState<LiveChartPresetRecord[]>([]);
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
      supabase.from("live_chart_presets").select("*").order("created_at", { ascending: true }),
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
          .map((preset) => sanitiseLiveChartPresetRecord(preset))
          .filter((preset): preset is LiveChartPresetRecord => preset !== null)
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
    setLiveChartPresets(
      [...nextPresets].sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      ),
    );
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

  const createLiveChartPreset = useCallback(
    async (
      input: CreateLiveChartPresetInput,
      options?: CreateLiveChartPresetOptions,
    ): Promise<LiveChartPresetRecord | null> => {
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

      const { data, error: queryError } = await supabase
        .from("live_chart_presets")
        .insert({
          owner_user_id: user.id,
          represented_account_id: representedAccountId,
          provider: input.provider ?? LIVE_CHART_PROVIDER,
          name,
          assets,
        })
        .select("*")
        .single();

      if (queryError) {
        if (options?.ignoreDuplicate && queryError.code === "23505") {
          const { data: existingPresetData, error: existingPresetError } = await supabase
            .from("live_chart_presets")
            .select("*")
            .eq("owner_user_id", user.id)
            .eq("represented_account_id", representedAccountId)
            .eq("name", name)
            .maybeSingle();

          if (existingPresetError) {
            setError(existingPresetError.message);
            return null;
          }

          const existingPreset = sanitiseLiveChartPresetRecord(existingPresetData);

          if (existingPreset) {
            setLiveChartPresets((currentPresets) => {
              const hasPreset = currentPresets.some((preset) => preset.id === existingPreset.id);
              return hasPreset ? currentPresets : [...currentPresets, existingPreset].sort(
                (left, right) =>
                  new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
              );
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

      const nextPreset = sanitiseLiveChartPresetRecord(data);

      if (!nextPreset) {
        setError("Supabase returned an invalid live chart preset payload.");
        return null;
      }

      setError(null);
      setLiveChartPresets((currentPresets) =>
        [...currentPresets, nextPreset].sort(
          (left, right) =>
            new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
        ),
      );
      return nextPreset;
    },
    [selectedRepresentedAccountId, user],
  );

  const deleteLiveChartPreset = useCallback(
    async (presetId: string) => {
      if (!supabase || !user) {
        return false;
      }

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

  const value = useMemo<UserDataContextValue>(
    () => ({
      loading,
      error,
      profile,
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
      deleteLiveChartPreset,
    }),
    [
      loading,
      error,
      profile,
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
      deleteLiveChartPreset,
    ],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
};
