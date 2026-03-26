import type { PortfolioAssetRow } from "../types/portfolio";
import {
  LIVE_CHART_PROVIDER,
  formatMarketSymbol,
  normalizeMarketSymbol,
  type LiveChartAssetOption,
  type LiveChartPreset,
  type LiveChartProvider,
  type MarketSymbol,
} from "../types/market";

const LIVE_CHART_PRESETS_STORAGE_KEY = "live_chart_presets";
const LIVE_CHART_SELECTED_PRESET_STORAGE_KEY = "live_chart_selected_preset_id";
const LIVE_CHART_MIGRATION_KEY_PREFIX = "live_chart_supabase_migrated_user_";
const LIVE_CHART_PRESET_SIZE = 4;
const AUTO_PRESET_ID_PREFIX = "auto-live-chart-preset";
const AUTO_PORTFOLIO_PRESET_ID_PREFIX = `${AUTO_PRESET_ID_PREFIX}-portfolio`;
const FIAT_ASSET_CODES = new Set([
  "AUD",
  "CAD",
  "CHF",
  "EUR",
  "GBP",
  "JPY",
  "NZD",
  "USD",
]);

export type LegacyLiveChartPresetState = {
  presets: LiveChartPreset[];
  selectedPresetId: string | null;
};

const createPresetId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const sanitizePresetAssets = (assets: string[]): MarketSymbol[] => {
  const normalizedAssets = assets
    .map((asset) => normalizeMarketSymbol(asset))
    .filter((asset): asset is MarketSymbol => asset !== null);

  return Array.from(new Set(normalizedAssets)).slice(0, LIVE_CHART_PRESET_SIZE);
};

const sanitizePreset = (value: unknown): LiveChartPreset | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<LiveChartPreset>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const assets = Array.isArray(candidate.assets) ? sanitizePresetAssets(candidate.assets) : [];

  if (
    typeof candidate.id !== "string" ||
    candidate.provider !== LIVE_CHART_PROVIDER ||
    !name ||
    assets.length === 0
  ) {
    return null;
  }

  return {
    id: candidate.id,
    provider: candidate.provider,
    name,
    assets,
  };
};

const chunkSymbols = (symbols: MarketSymbol[], size: number): MarketSymbol[][] => {
  const chunks: MarketSymbol[][] = [];

  for (let index = 0; index < symbols.length; index += size) {
    chunks.push(symbols.slice(index, index + size));
  }

  return chunks;
};

const getBaseAsset = (symbol: MarketSymbol): string => symbol.split("_")[0];

export const getLiveChartPresetBaseAssets = (preset: Pick<LiveChartPreset, "assets">): string[] =>
  sanitizePresetAssets(preset.assets).map(getBaseAsset);

export const isFiatBaseMarketSymbol = (symbol: MarketSymbol): boolean => FIAT_ASSET_CODES.has(getBaseAsset(symbol));

export const hasFiatBasePresetAsset = (preset: Pick<LiveChartPreset, "assets">): boolean =>
  getLiveChartPresetBaseAssets(preset).some((assetCode) => FIAT_ASSET_CODES.has(assetCode));

export const getLiveChartPresetAssetKey = (preset: Pick<LiveChartPreset, "assets">): string =>
  sanitizePresetAssets(preset.assets).join("|");

export const normalizeLiveChartPresetName = (name: string): string => name.trim().toLowerCase();

export const isAssetListNamedLiveChartPreset = (preset: Pick<LiveChartPreset, "name" | "assets">): boolean =>
  normalizeLiveChartPresetName(preset.name) ===
  getLiveChartPresetBaseAssets(preset)
    .join(" | ")
    .toLowerCase();

const getLiveChartPresetFingerprint = (preset: Pick<LiveChartPreset, "name" | "assets">): string =>
  `${normalizeLiveChartPresetName(preset.name)}::${getLiveChartPresetAssetKey(preset)}`;

export const findMatchingLiveChartPreset = <T extends Pick<LiveChartPreset, "name" | "assets">>(
  presets: T[],
  candidate: Pick<LiveChartPreset, "name" | "assets">,
): T | null =>
  presets.find((preset) => getLiveChartPresetFingerprint(preset) === getLiveChartPresetFingerprint(candidate)) ??
  presets.find((preset) => getLiveChartPresetAssetKey(preset) === getLiveChartPresetAssetKey(candidate)) ??
  presets.find(
    (preset) => normalizeLiveChartPresetName(preset.name) === normalizeLiveChartPresetName(candidate.name),
  ) ??
  null;

export const isSeededLiveChartPreset = (
  preset: Pick<LiveChartPreset, "name" | "assets">,
  seedPresets: Pick<LiveChartPreset, "name" | "assets">[],
): boolean => Boolean(findMatchingLiveChartPreset(seedPresets, preset));

export const createLiveChartPreset = ({
  id,
  provider,
  name,
  assets,
}: {
  id?: string;
  provider: LiveChartProvider;
  name: string;
  assets: string[];
}): LiveChartPreset => ({
  id: id ?? createPresetId(),
  provider,
  name: name.trim(),
  assets: sanitizePresetAssets(assets),
});

export const getLiveChartPresetSlug = (preset: LiveChartPreset): string => {
  const baseSlug =
    preset.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "preset";

  return `${baseSlug}-${preset.id.slice(-8)}`;
};

export const buildAutomaticLiveChartPresets = (
  portfolioAssets: LiveChartAssetOption[],
): LiveChartPreset[] =>
  chunkSymbols(
    portfolioAssets
      .map((asset) => asset.symbol)
      .filter((symbol) => !isFiatBaseMarketSymbol(symbol)),
    LIVE_CHART_PRESET_SIZE,
  ).map((group, index) =>
    createLiveChartPreset({
      id: `${AUTO_PORTFOLIO_PRESET_ID_PREFIX}-${index + 1}`,
      provider: LIVE_CHART_PROVIDER,
      name: group.map(getBaseAsset).join(" | "),
      assets: group,
    }),
  );

export const orderLiveChartPresets = (presets: LiveChartPreset[]): LiveChartPreset[] => {
  if (presets.length <= 1) {
    return presets;
  }

  const defaultPresets = presets.filter((preset) => normalizeLiveChartPresetName(preset.name) === "default");
  const nonDefaultPresets = presets.filter((preset) => normalizeLiveChartPresetName(preset.name) !== "default");

  return [...nonDefaultPresets, ...defaultPresets];
};

export const loadLegacyLiveChartPresetState = (): LegacyLiveChartPresetState => {
  if (typeof window === "undefined") {
    return {
      presets: [],
      selectedPresetId: null,
    };
  }

  try {
    const storedPresets = window.localStorage.getItem(LIVE_CHART_PRESETS_STORAGE_KEY);
    const parsedPresets = storedPresets ? JSON.parse(storedPresets) : [];
    const presets = Array.isArray(parsedPresets)
      ? parsedPresets
          .map((preset) => sanitizePreset(preset))
          .filter((preset): preset is LiveChartPreset => preset !== null)
      : [];
    const storedSelectedPresetId = window.localStorage.getItem(LIVE_CHART_SELECTED_PRESET_STORAGE_KEY);

    return {
      presets,
      selectedPresetId: typeof storedSelectedPresetId === "string" ? storedSelectedPresetId : null,
    };
  } catch {
    return {
      presets: [],
      selectedPresetId: null,
    };
  }
};

export const clearLegacyLiveChartPresetState = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(LIVE_CHART_PRESETS_STORAGE_KEY);
  window.localStorage.removeItem(LIVE_CHART_SELECTED_PRESET_STORAGE_KEY);
};

export const hasCompletedLiveChartPresetMigration = (userId: string): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(`${LIVE_CHART_MIGRATION_KEY_PREFIX}${userId}`) === "true";
};

export const markLiveChartPresetMigrationComplete = (userId: string): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${LIVE_CHART_MIGRATION_KEY_PREFIX}${userId}`, "true");
};

export const extractPortfolioAssetOptions = (assets: PortfolioAssetRow[]): LiveChartAssetOption[] => {
  const optionMap = new Map<MarketSymbol, LiveChartAssetOption>();

  assets.forEach((asset) => {
    if (!Number.isFinite(asset.bestand) || asset.bestand <= 0) {
      return;
    }

    const symbol = normalizeMarketSymbol(`${asset.asset}_${asset.quote}`);

    if (!symbol || optionMap.has(symbol)) {
      return;
    }

    optionMap.set(symbol, {
      symbol,
      label: formatMarketSymbol(symbol),
      source: "portfolio",
    });
  });

  return Array.from(optionMap.values()).sort((left, right) => left.label.localeCompare(right.label));
};
