import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, LayoutGrid, Maximize2, Minimize2, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { LiveChartCard } from "../components/live-charts/LiveChartCard";
import { LiveChartPresetModal } from "../components/live-charts/LiveChartPresetModal";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { PageHeader } from "../components/ui/page-header";
import { useAuth } from "../hooks/useAuth";
import { useCryptoWebSocket } from "../hooks/useCryptoWebSocket";
import { useUserData } from "../hooks/useUserData";
import { buildLiveChartBuyDaysBySymbol } from "../lib/liveChartBuys";
import {
  buildAutomaticLiveChartPresets,
  clearLegacyLiveChartPresetState,
  extractPortfolioAssetOptions,
  findMatchingLiveChartPreset,
  getLiveChartPresetAssetKey,
  getLiveChartPresetSlug,
  hasFiatBasePresetAsset,
  hasCompletedLiveChartPresetMigration,
  loadLegacyLiveChartPresetState,
  markLiveChartPresetMigrationComplete,
  orderLiveChartPresets,
} from "../lib/liveChartPresets";
import {
  CHART_TIMEFRAMES,
  type ChartTimeframe,
  type LiveChartIndicatorId,
  type LiveChartPreset,
  type LiveChartSummaryWindowId,
  LIVE_CHART_INDICATOR_OPTIONS,
  formatMarketSymbol,
  normalizeMarketSymbol,
  type MarketSymbol,
} from "../types/market";
import type { WorkbookData } from "../types/portfolio";
import { cn } from "../lib/utils";

const connectionToneMap = {
  Connecting: "blue",
  Connected: "green",
  Reconnecting: "red",
  Disconnected: "red",
} as const;

const controlClassName =
  "h-10 rounded-lg border border-border bg-panelSoft px-3 text-sm text-slate-100 outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/15";

const headerButtonClassName =
  "button-surface";

const presetTabButtonClassName =
  "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition";

type PresetMenuTabId = "my-assets" | "custom";
type LiveChartGridLayout = "single" | "1x1" | "2x2";
type PresetModalDraft = {
  title: string;
  submitLabel: string;
  initialName: string;
  initialAssets: string[];
};

const createEmptyPresetDraft = (): PresetModalDraft => ({
  title: "Add Preset",
  submitLabel: "Create Preset",
  initialName: "",
  initialAssets: [],
});

const canDeletePreset = (
  preset: Pick<LiveChartPreset, "assets">,
  automaticPresetAssetKeys: Set<string>,
) => !automaticPresetAssetKeys.has(getLiveChartPresetAssetKey(preset));

const PlaceholderChartCard = ({ compact = false }: { compact?: boolean }) => (
  <Card className={cn("flex flex-col overflow-hidden p-0", compact ? "h-full min-h-0" : "min-h-[460px]")}>
    <div className={cn("flex items-start justify-between gap-3 border-b border-border/80 px-4 py-3", compact ? "mb-0" : "mb-0")}>
      <h2 className="text-base font-semibold text-slate-100">Placeholder</h2>
      <Badge tone="default">Empty</Badge>
    </div>
    <div className="flex flex-1 items-center justify-center border border-dashed border-border/70 bg-panelSoft/55 px-4 text-center">
      <div>
        <p className="text-sm font-medium text-slate-200">Placeholder chart</p>
        <p className="mt-2 text-xs text-slate-500">Add another asset to fill this preset slot.</p>
      </div>
    </div>
  </Card>
);

export const LiveChartsPage = ({ data }: { data: WorkbookData | null }) => {
  const { marketSymbol, presetSlug, presetTabName } = useParams<{
    marketSymbol?: string;
    presetSlug?: string;
    presetTabName?: PresetMenuTabId;
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    createLiveChartPreset,
    deleteLiveChartPreset,
    error: userDataError,
    liveChartPresets,
    loading: userDataLoading,
    selectedPresetId,
    selectedRepresentedAccount,
    selectedRepresentedAccountId,
    selectedTimeframe: timeframe,
    setSelectedPresetId,
    setSelectedTimeframe,
  } = useUserData();
  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const gridMenuRef = useRef<HTMLDivElement | null>(null);
  const indicatorMenuRef = useRef<HTMLDivElement | null>(null);
  const [summaryWindow, setSummaryWindow] = useState<LiveChartSummaryWindowId>("24h");
  const [selectedIndicators, setSelectedIndicators] = useState<LiveChartIndicatorId[]>([]);
  const [selectedGridLayout, setSelectedGridLayout] = useState<LiveChartGridLayout>(
    marketSymbol ? "single" : "2x2",
  );
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [presetModalDraft, setPresetModalDraft] = useState<PresetModalDraft>(createEmptyPresetDraft);
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [isGridMenuOpen, setIsGridMenuOpen] = useState(false);
  const [activePresetMenuTab, setActivePresetMenuTab] = useState<PresetMenuTabId>("my-assets");
  const [isIndicatorMenuOpen, setIsIndicatorMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [isDeletingPreset, setIsDeletingPreset] = useState(false);
  const [isSyncingPresets, setIsSyncingPresets] = useState(false);
  const [presetMutationError, setPresetMutationError] = useState<string | null>(null);

  const portfolioAssetOptions = useMemo(() => extractPortfolioAssetOptions(data?.assets ?? []), [data]);
  const automaticPresets = useMemo(
    () => buildAutomaticLiveChartPresets(portfolioAssetOptions),
    [portfolioAssetOptions],
  );
  const buyDaysBySymbol = useMemo(
    () => buildLiveChartBuyDaysBySymbol(data?.transactions ?? []),
    [data],
  );
  const accountPresets = useMemo(
    () =>
      liveChartPresets.filter((preset) => preset.represented_account_id === selectedRepresentedAccountId),
    [liveChartPresets, selectedRepresentedAccountId],
  );
  const presets = useMemo(
    () => orderLiveChartPresets(accountPresets),
    [accountPresets],
  );
  const automaticPresetAssetKeys = useMemo(
    () => new Set(automaticPresets.map((preset) => getLiveChartPresetAssetKey(preset))),
    [automaticPresets],
  );
  const automaticMenuPresets = useMemo(
    () =>
      presets.filter((preset) => {
        if (hasFiatBasePresetAsset(preset)) {
          return false;
        }

        return automaticPresetAssetKeys.has(getLiveChartPresetAssetKey(preset));
      }),
    [automaticPresetAssetKeys, presets],
  );
  const customMenuPresets = useMemo(
    () =>
      presets.filter((preset) => {
        if (automaticMenuPresets.some((candidate) => candidate.id === preset.id)) {
          return false;
        }

        return true;
      }),
    [automaticMenuPresets, presets],
  );
  const selectedMarketSymbol = useMemo(
    () => (marketSymbol ? normalizeMarketSymbol(marketSymbol) : null),
    [marketSymbol],
  );
  const isDirectMarketView = Boolean(selectedMarketSymbol);
  const getPresetMenuTab = (preset: LiveChartPreset): PresetMenuTabId =>
    automaticMenuPresets.some((candidate) => candidate.id === preset.id) ? "my-assets" : "custom";
  const getMarketRoute = (symbol: MarketSymbol): string =>
    `/live-charts/markets/${encodeURIComponent(symbol)}`;
  const selectedPreset = useMemo(
    () => {
      const routePreset = presetSlug
        ? presets.find((preset) => getLiveChartPresetSlug(preset) === presetSlug) ?? null
        : null;

      return routePreset ?? presets.find((preset) => preset.id === selectedPresetId) ?? presets[0] ?? null;
    },
    [presetSlug, presets, selectedPresetId],
  );
  const selectedPresetMenuTab = useMemo<PresetMenuTabId>(() => {
    if (selectedMarketSymbol) {
      return "custom";
    }

    if (!selectedPreset) {
      return "custom";
    }

    return getPresetMenuTab(selectedPreset);
  }, [automaticMenuPresets, selectedMarketSymbol, selectedPreset]);
  const visiblePresets = useMemo(
    () => (activePresetMenuTab === "my-assets" ? automaticMenuPresets : customMenuPresets),
    [activePresetMenuTab, automaticMenuPresets, customMenuPresets],
  );
  const selectedPresetSlug = useMemo(
    () => (selectedPreset ? getLiveChartPresetSlug(selectedPreset) : null),
    [selectedPreset],
  );
  const getPresetRoute = (preset: LiveChartPreset): string =>
    `/live-charts/preset/${getPresetMenuTab(preset)}/${getLiveChartPresetSlug(preset)}`;
  const activeSymbols = useMemo(
    () =>
      selectedMarketSymbol
        ? [selectedMarketSymbol]
        : selectedPreset?.assets ?? automaticPresets[0]?.assets ?? [],
    [automaticPresets, selectedMarketSymbol, selectedPreset],
  );
  const canChangeGridLayout = !isDirectMarketView && selectedPresetMenuTab !== "my-assets";
  const canSavePreset =
    (isDirectMarketView || selectedPresetMenuTab !== "my-assets") &&
    Boolean(selectedRepresentedAccountId) &&
    activeSymbols.length > 0;
  const chartSlots = useMemo(
    () => [
      ...activeSymbols.map((symbol) => ({ type: "symbol" as const, symbol })),
      ...Array.from({ length: Math.max(0, 4 - activeSymbols.length) }, (_, index) => ({
        type: "placeholder" as const,
        id: `placeholder-${index}`,
      })),
    ],
    [activeSymbols],
  );
  const visibleChartSlots = useMemo(
    () =>
      selectedGridLayout === "2x2"
        ? chartSlots
        : selectedGridLayout === "1x1"
          ? chartSlots.slice(0, 2)
          : chartSlots.slice(0, 1),
    [chartSlots, selectedGridLayout],
  );
  const savePresetDraft = useMemo<PresetModalDraft>(
    () => ({
      title: "Save Preset",
      submitLabel: "Save Preset",
      initialName: selectedMarketSymbol
        ? formatMarketSymbol(selectedMarketSymbol)
        : selectedPreset
          ? `${selectedPreset.name} Copy`
          : activeSymbols.map((symbol) => symbol.split("_")[0]).join(" | "),
      initialAssets: activeSymbols,
    }),
    [activeSymbols, selectedMarketSymbol, selectedPreset],
  );

  const { isConnected, connectionLabel, reconnectVersion, subscribeToSymbol, subscribeToMarketSummary } = useCryptoWebSocket({
    symbols: activeSymbols,
    timeframe,
  });

  useEffect(() => {
    if (!selectedMarketSymbol) {
      return;
    }

    if (marketSymbol !== selectedMarketSymbol) {
      navigate(getMarketRoute(selectedMarketSymbol), { replace: true });
    }
  }, [marketSymbol, navigate, selectedMarketSymbol]);

  useEffect(() => {
    if (!isDirectMarketView) {
      return;
    }

    if (selectedGridLayout !== "single") {
      setSelectedGridLayout("single");
    }
  }, [isDirectMarketView, selectedGridLayout]);

  useEffect(() => {
    if (selectedMarketSymbol) {
      return;
    }

    if (!selectedPresetSlug) {
      return;
    }

    if (presetSlug !== selectedPresetSlug || presetTabName !== selectedPresetMenuTab) {
      navigate(getPresetRoute(selectedPreset), { replace: true });
    }
  }, [
    navigate,
    presetSlug,
    presetTabName,
    selectedMarketSymbol,
    selectedPreset,
    selectedPresetMenuTab,
    selectedPresetSlug,
  ]);

  useEffect(() => {
    if (!isPresetMenuOpen) {
      return;
    }

    setActivePresetMenuTab(selectedPresetMenuTab);
  }, [isPresetMenuOpen, selectedPresetMenuTab]);

  useEffect(() => {
    if (activePresetMenuTab === "custom" && customMenuPresets.length === 0) {
      setActivePresetMenuTab("my-assets");
    }
  }, [activePresetMenuTab, customMenuPresets.length]);

  useEffect(() => {
    if (canChangeGridLayout) {
      return;
    }

    setIsGridMenuOpen(false);
  }, [canChangeGridLayout]);

  useEffect(() => {
    if (!selectedPresetId || presets.some((preset) => preset.id === selectedPresetId)) {
      return;
    }

    const fallbackPresetId = automaticMenuPresets[0]?.id ?? customMenuPresets[0]?.id ?? null;

    if (fallbackPresetId !== selectedPresetId) {
      void setSelectedPresetId(fallbackPresetId);
    }
  }, [automaticMenuPresets, customMenuPresets, presets, selectedPresetId, setSelectedPresetId]);

  useEffect(() => {
    if (!isPresetMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!presetMenuRef.current?.contains(event.target as Node)) {
        setIsPresetMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isPresetMenuOpen]);

  useEffect(() => {
    if (!isIndicatorMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!indicatorMenuRef.current?.contains(event.target as Node)) {
        setIsIndicatorMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isIndicatorMenuOpen]);

  useEffect(() => {
    if (!isGridMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!gridMenuRef.current?.contains(event.target as Node)) {
        setIsGridMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isGridMenuOpen]);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!user || userDataLoading || !selectedRepresentedAccountId) {
      return;
    }

    let cancelled = false;

    const hydratePresets = async () => {
      setIsSyncingPresets(true);

      const nextPresets = [...accountPresets];
      let migrationFailed = false;
      const shouldMigrateLegacy = !hasCompletedLiveChartPresetMigration(user.id);
      const legacyState = shouldMigrateLegacy
        ? loadLegacyLiveChartPresetState()
        : { presets: [], selectedPresetId: null };

      for (const automaticPreset of automaticPresets) {
        if (findMatchingLiveChartPreset(nextPresets, automaticPreset)) {
          continue;
        }

        const createdPreset = await createLiveChartPreset(
          {
            name: automaticPreset.name,
            assets: automaticPreset.assets,
            provider: automaticPreset.provider,
            representedAccountId: selectedRepresentedAccountId,
          },
          { ignoreDuplicate: true },
        );

        if (cancelled) {
          return;
        }

        if (createdPreset) {
          nextPresets.push(createdPreset);
        } else {
          migrationFailed = true;
        }
      }

      if (shouldMigrateLegacy) {
        for (const legacyPreset of legacyState.presets) {
          if (findMatchingLiveChartPreset(nextPresets, legacyPreset)) {
            continue;
          }

          const createdPreset = await createLiveChartPreset(
            {
              name: legacyPreset.name,
              assets: legacyPreset.assets,
              provider: legacyPreset.provider,
              representedAccountId: selectedRepresentedAccountId,
            },
            { ignoreDuplicate: true },
          );

          if (cancelled) {
            return;
          }

          if (createdPreset) {
            nextPresets.push(createdPreset);
          } else {
            migrationFailed = true;
          }
        }

        if (!migrationFailed) {
          markLiveChartPresetMigrationComplete(user.id);
          clearLegacyLiveChartPresetState();
        }
      }

      const hasSelectedPreset = nextPresets.some((preset) => preset.id === selectedPresetId);

      if (!hasSelectedPreset) {
        const legacySelectedPreset = legacyState.selectedPresetId
          ? legacyState.presets.find((preset) => preset.id === legacyState.selectedPresetId) ?? null
          : null;
        const preferredPreset = legacySelectedPreset
          ? findMatchingLiveChartPreset(nextPresets, legacySelectedPreset)
          : null;
        const fallbackPreset = preferredPreset ?? nextPresets[0] ?? null;

        if (fallbackPreset?.id !== selectedPresetId) {
          await setSelectedPresetId(fallbackPreset?.id ?? null);
        }
      }

      if (!cancelled) {
        setIsSyncingPresets(false);
      }
    };

    void hydratePresets().catch((error: unknown) => {
      if (cancelled) {
        return;
      }

      setPresetMutationError(
        error instanceof Error ? error.message : "Failed to sync live chart presets.",
      );
      setIsSyncingPresets(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    accountPresets,
    automaticPresets,
    createLiveChartPreset,
    portfolioAssetOptions,
    selectedPresetId,
    selectedRepresentedAccountId,
    setSelectedPresetId,
    user,
    userDataLoading,
  ]);

  const handleCreatePreset = async (preset: LiveChartPreset) => {
    if (!selectedRepresentedAccountId) {
      setPresetMutationError("Select a represented account before creating presets.");
      return false;
    }

    setPresetMutationError(null);
    setIsCreatingPreset(true);

    const createdPreset = await createLiveChartPreset({
      name: preset.name,
      assets: preset.assets,
      provider: preset.provider,
      representedAccountId: selectedRepresentedAccountId,
    });

    setIsCreatingPreset(false);

    if (!createdPreset) {
      setPresetMutationError("Could not save the preset. If the name already exists, use a different one.");
      return false;
    }

    await setSelectedPresetId(createdPreset.id);
    navigate(getPresetRoute(createdPreset), { replace: true });
    setIsPresetMenuOpen(false);
    return true;
  };

  const handleDeletePreset = async (presetToDelete: LiveChartPreset | null = selectedPreset) => {
    if (!presetToDelete || !canDeletePreset(presetToDelete, automaticPresetAssetKeys)) {
      return;
    }

    if (typeof window !== "undefined" && !window.confirm(`Delete preset "${presetToDelete.name}"?`)) {
      return;
    }

    setPresetMutationError(null);
    setIsDeletingPreset(true);

    const isDeletingSelectedPreset = selectedPreset?.id === presetToDelete.id;
    const remainingPresets = presets.filter((preset) => preset.id !== presetToDelete.id);
    const fallbackPresetId =
      remainingPresets[0]?.id ??
      automaticMenuPresets[0]?.id ??
      customMenuPresets.find((preset) => preset.id !== presetToDelete.id)?.id ??
      null;
    const deleted = await deleteLiveChartPreset(presetToDelete.id);

    if (!deleted) {
      setPresetMutationError("Could not delete the preset.");
      setIsDeletingPreset(false);
      return;
    }

    if (isDeletingSelectedPreset) {
      await setSelectedPresetId(fallbackPresetId);
      const fallbackPreset =
        remainingPresets.find((preset) => preset.id === fallbackPresetId) ??
        automaticMenuPresets.find((preset) => preset.id === fallbackPresetId) ??
        customMenuPresets.find((preset) => preset.id === fallbackPresetId) ??
        null;

      navigate(
        fallbackPreset ? getPresetRoute(fallbackPreset) : "/live-charts",
        { replace: true },
      );
      setIsPresetMenuOpen(false);
    }

    setIsDeletingPreset(false);
  };

  const handleOpenPresetInNewTab = (preset: LiveChartPreset) => {
    if (typeof window === "undefined") {
      return;
    }

    window.open(getPresetRoute(preset), "_blank", "noopener,noreferrer");
  };

  const handleSelectPreset = (preset: LiveChartPreset) => {
    void setSelectedPresetId(preset.id);
    navigate(getPresetRoute(preset), { replace: true });
    setIsPresetMenuOpen(false);
  };

  const openAddPresetModal = () => {
    setPresetMutationError(null);
    setPresetModalDraft(createEmptyPresetDraft());
    setIsPresetMenuOpen(false);
    setIsPresetModalOpen(true);
  };

  const openSavePresetModal = () => {
    if (!canSavePreset) {
      return;
    }

    setPresetMutationError(null);
    setPresetModalDraft(savePresetDraft);
    setIsPresetMenuOpen(false);
    setIsPresetModalOpen(true);
  };

  const toggleIndicator = (indicatorId: LiveChartIndicatorId) => {
    setSelectedIndicators((currentIndicators) =>
      currentIndicators.includes(indicatorId)
        ? currentIndicators.filter((currentIndicator) => currentIndicator !== indicatorId)
        : [...currentIndicators, indicatorId],
    );
  };

  const toggleFullscreen = () => {
    setIsPresetMenuOpen(false);
    setIsGridMenuOpen(false);
    setIsIndicatorMenuOpen(false);
    setIsFullscreen((current) => !current);
  };

  const liveChartsContent = (
    <div
      className={
        isFullscreen
          ? "flex h-screen flex-col overflow-hidden bg-bg px-4 py-4 md:px-5 md:py-5"
          : "space-y-5"
      }
    >
      {userDataError || presetMutationError ? (
        <Card className="border-rose-500/20 bg-rose-500/10 text-rose-100">
          <p className="text-sm font-medium">Supabase Sync Error</p>
          <p className="mt-1 text-sm text-rose-200">{presetMutationError ?? userDataError}</p>
        </Card>
      ) : null}

      <PageHeader
        title="Live Charts"
        description={
          selectedMarketSymbol
            ? `Direct live chart for ${formatMarketSymbol(selectedMarketSymbol)}.`
            : selectedRepresentedAccount
            ? `Live multi-asset monitoring for ${selectedRepresentedAccount.name}.`
            : "Live multi-asset monitoring for the current represented account."
        }
        className={isFullscreen ? "mb-3 shrink-0" : undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={timeframe}
              onChange={(event) => void setSelectedTimeframe(event.target.value as ChartTimeframe)}
              className={controlClassName}
              aria-label="Select chart timeframe"
              disabled={userDataLoading}
            >
              {CHART_TIMEFRAMES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <div ref={presetMenuRef} className="relative">
              <button
                type="button"
                className={`${headerButtonClassName} min-w-[220px] justify-between`}
                onClick={() => setIsPresetMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={isPresetMenuOpen}
                disabled={userDataLoading}
              >
                <span className="truncate">
                  {selectedMarketSymbol
                    ? formatMarketSymbol(selectedMarketSymbol)
                    : selectedPreset?.name ?? "Select preset"}
                </span>
                <ChevronDown size={14} className={isPresetMenuOpen ? "rotate-180 transition" : "transition"} />
              </button>

              {isPresetMenuOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-[360px] rounded-[18px] border border-border/90 bg-panel p-2 shadow-[0_18px_40px_rgba(0,0,0,0.38)]">
                  <div className="mb-3 flex items-center justify-between gap-2 px-2 pt-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Presets
                    </div>
                    <button
                      type="button"
                      className="button-surface px-2 py-1 text-xs"
                      onClick={openAddPresetModal}
                    >
                      <Plus size={12} />
                      New Preset
                    </button>
                  </div>

                  <div className="mb-3 flex items-center gap-2 px-1">
                    <button
                      type="button"
                      className={cn(
                        presetTabButtonClassName,
                        activePresetMenuTab === "my-assets"
                          ? "border-accent/35 bg-accent/10 text-[#c2d1ff]"
                          : "border-transparent text-slate-300 hover:border-border/70 hover:bg-[#151c25] hover:text-white",
                      )}
                      onClick={() => setActivePresetMenuTab("my-assets")}
                    >
                      <span>My Assets</span>
                      <span className="rounded-md bg-[#0c1117] px-1.5 py-0.5 text-[10px] text-slate-400">
                        {automaticMenuPresets.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        presetTabButtonClassName,
                        activePresetMenuTab === "custom"
                          ? "border-accent/35 bg-accent/10 text-[#c2d1ff]"
                          : "border-transparent text-slate-300 hover:border-border/70 hover:bg-[#151c25] hover:text-white",
                      )}
                      onClick={() => setActivePresetMenuTab("custom")}
                    >
                      <span>Custom</span>
                      <span className="rounded-md bg-[#0c1117] px-1.5 py-0.5 text-[10px] text-slate-400">
                        {customMenuPresets.length}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-1">
                    {visiblePresets.length ? (
                      visiblePresets.map((preset) => {
                      const isSelected = preset.id === selectedPreset?.id;
                      const isDeletable = canDeletePreset(preset, automaticPresetAssetKeys);

                      return (
                        <div
                          key={preset.id}
                          className="flex items-center gap-2 rounded-lg border border-border/70 bg-panelSoft/65 p-1"
                        >
                          <button
                            type="button"
                            className={`flex-1 rounded-lg px-3 py-2 text-left text-sm transition ${
                              isSelected
                                ? "bg-accent/10 text-[#c2d1ff]"
                                : "text-slate-200 hover:bg-[#151c25] hover:text-white"
                            }`}
                            onClick={() => handleSelectPreset(preset)}
                          >
                            {preset.name}
                          </button>
                          {isDeletable ? (
                            <button
                              type="button"
                              className="button-surface p-2 hover:border-rose-500/60 hover:bg-rose-500/10 hover:text-rose-200"
                              onClick={() => void handleDeletePreset(preset)}
                              aria-label={`Delete preset ${preset.name}`}
                              title="Delete preset"
                              disabled={isDeletingPreset}
                            >
                              <Trash2 size={12} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="button-surface px-2.5 py-2 text-xs"
                            onClick={() => handleOpenPresetInNewTab(preset)}
                          >
                            <ExternalLink size={12} />
                            New Tab
                          </button>
                        </div>
                      );
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/70 bg-panelSoft/55 px-3 py-4 text-sm text-slate-400">
                        {activePresetMenuTab === "my-assets"
                          ? "No generated asset presets are available for this represented account yet."
                          : "No custom preset tabs yet. Use + to create your first one."}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className={headerButtonClassName}
              onClick={openAddPresetModal}
              disabled={!selectedRepresentedAccountId}
            >
              <Plus size={14} />
              Add Preset
            </button>

            <button
              type="button"
              className={headerButtonClassName}
              onClick={openSavePresetModal}
              disabled={!canSavePreset}
            >
              <Save size={14} />
              Save Preset
            </button>

            <div ref={gridMenuRef} className="relative">
              <button
                type="button"
                className={headerButtonClassName}
                onClick={() => setIsGridMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={isGridMenuOpen}
                title="Grid layout"
                disabled={!canChangeGridLayout}
              >
                <LayoutGrid size={14} />
              </button>

              {isGridMenuOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-[180px] rounded-[18px] border border-border/90 bg-panel p-2 shadow-[0_18px_40px_rgba(0,0,0,0.38)]">
                  <div className="mb-2 px-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Grid Layout
                  </div>
                  <div className="space-y-1">
                    {([
                      { id: "single", label: "Single" },
                      { id: "1x1", label: "1x1" },
                      { id: "2x2", label: "2x2" },
                    ] as const).map((layoutOption) => {
                      const layout = layoutOption.id;
                      const isSelected = selectedGridLayout === layout;

                      return (
                        <button
                          key={layout}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                            isSelected
                              ? "bg-accent/10 text-[#c2d1ff]"
                              : "text-slate-200 hover:bg-[#151c25] hover:text-white",
                          )}
                          onClick={() => {
                            setSelectedGridLayout(layout);
                            setIsGridMenuOpen(false);
                          }}
                        >
                          <span>{layoutOption.label}</span>
                          {isSelected ? <Check size={14} /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div ref={indicatorMenuRef} className="relative">
              <button
                type="button"
                className={headerButtonClassName}
                onClick={() => setIsIndicatorMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={isIndicatorMenuOpen}
                title="Indicators"
              >
                <SlidersHorizontal size={14} />
                {selectedIndicators.length > 0 ? selectedIndicators.length : null}
              </button>

              {isIndicatorMenuOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-[280px] rounded-[18px] border border-border/90 bg-panel p-2 shadow-[0_18px_40px_rgba(0,0,0,0.38)]">
                  <div className="mb-2 px-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Indicators
                  </div>
                  <div className="space-y-1">
                    {LIVE_CHART_INDICATOR_OPTIONS.map((indicator) => {
                      const isSelected = selectedIndicators.includes(indicator.id);

                      return (
                        <button
                          key={indicator.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                            isSelected
                              ? "bg-accent/10 text-[#c2d1ff]"
                              : "text-slate-200 hover:bg-[#151c25] hover:text-white",
                          )}
                          onClick={() => toggleIndicator(indicator.id)}
                        >
                          <span>{indicator.label}</span>
                          {isSelected ? <Check size={14} /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className={headerButtonClassName}
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
              title={isFullscreen ? "Exit full screen" : "Enter full screen"}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            {isSyncingPresets ? <Badge tone="default">Syncing Presets</Badge> : null}
            <Badge tone={connectionToneMap[connectionLabel]}>{connectionLabel}</Badge>
          </div>
        }
      />

      <div
        className={
          isFullscreen
            ? cn(
                "grid min-h-0 flex-1 auto-rows-fr gap-3 overflow-hidden",
                selectedGridLayout === "single"
                  ? "grid-cols-1 overflow-y-auto"
                  : "grid-cols-2",
              )
            : cn(
                "grid gap-4",
                selectedGridLayout === "single"
                  ? "grid-cols-1"
                  : selectedGridLayout === "1x1"
                    ? "grid-cols-2"
                    : "md:grid-cols-2",
              )
        }
      >
        {visibleChartSlots.map((slot) =>
          slot.type === "symbol" ? (
            <LiveChartCard
              key={slot.symbol}
              symbol={slot.symbol}
              buyDays={buyDaysBySymbol.get(slot.symbol) ?? []}
              indicators={selectedIndicators}
              summaryWindow={summaryWindow}
              onSummaryWindowChange={setSummaryWindow}
              timeframe={timeframe}
              isConnected={isConnected}
              reconnectVersion={reconnectVersion}
              subscribeToSymbol={subscribeToSymbol}
              subscribeToMarketSummary={subscribeToMarketSummary}
              compact={isFullscreen}
            />
          ) : (
            <PlaceholderChartCard key={slot.id} compact={isFullscreen} />
          ),
        )}
      </div>
    </div>
  );

  return (
    <>
      {isFullscreen ? (
        <div className="fixed inset-0 z-40 overflow-hidden bg-bg">
          {liveChartsContent}
        </div>
      ) : (
        liveChartsContent
      )}

      <LiveChartPresetModal
        open={isPresetModalOpen}
        portfolioAssets={portfolioAssetOptions}
        onClose={() => setIsPresetModalOpen(false)}
        onCreate={handleCreatePreset}
        title={presetModalDraft.title}
        submitLabel={presetModalDraft.submitLabel}
        initialName={presetModalDraft.initialName}
        initialAssets={presetModalDraft.initialAssets}
        submitErrorMessage={presetMutationError}
        submitting={isCreatingPreset}
      />
    </>
  );
};
