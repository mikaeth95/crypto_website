export const DEFAULT_LIVE_CHART_SYMBOLS = ["BTC_EUR", "ETH_EUR", "SOL_EUR", "TAO_USD"] as const;

export const CHART_TIMEFRAMES = ["15m", "1h", "4h", "1d", "1w", "1M"] as const;
export const LIVE_CHART_INDICATORS = [
  "sma_20",
  "sma_50",
  "ema_20",
  "ema_50",
  "ema_200",
  "bollinger_20",
] as const;
export const LIVE_CHART_SUMMARY_WINDOWS = ["24h", "1w", "1m", "6m", "1y", "2y"] as const;
export const MARKET_INSTRUMENT_QUOTE_FILTERS = ["ALL", "EUR", "USD", "USDT"] as const;

export const DEFAULT_TIMEFRAME = "1h";

export const LIVE_CHART_PROVIDER = "crypto_com_exchange" as const;

export const LIVE_CHART_PROVIDER_LABELS = {
  [LIVE_CHART_PROVIDER]: "Crypto.com Exchange",
} as const;

export type MarketSymbol = string;

export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number];
export type LiveChartIndicatorId = (typeof LIVE_CHART_INDICATORS)[number];
export type LiveChartSummaryWindowId = (typeof LIVE_CHART_SUMMARY_WINDOWS)[number];
export type MarketInstrumentQuoteFilter = (typeof MARKET_INSTRUMENT_QUOTE_FILTERS)[number];

export type CryptoComTimeframe = "15m" | "1h" | "4h" | "1D" | "7D" | "1M";

export type ConnectionLabel = "Connecting" | "Connected" | "Reconnecting" | "Disconnected";

export type VisibleDays = number | "all";

export type LiveChartProvider = typeof LIVE_CHART_PROVIDER;

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type TimeframeConfig = {
  label: ChartTimeframe;
  apiTimeframe: CryptoComTimeframe;
  fetchCount: number;
  candleSeconds: number;
  visibleDays: VisibleDays;
};

export type LiveChartPreset = {
  id: string;
  provider: LiveChartProvider | string;
  name: string;
  assets: MarketSymbol[];
};

export type LiveChartAssetOption = {
  symbol: MarketSymbol;
  label: string;
  source: "portfolio" | "manual";
};

export type LiveMarketSummary = {
  symbol: MarketSymbol;
  lastPrice: number | null;
  change24hPct: number | null;
  markPrice: number | null;
  indexPrice: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24hBase: number | null;
  volume24hQuote: number | null;
};

export type LiveInstrumentAth = {
  symbol: MarketSymbol;
  price: number | null;
  date: string | null;
};

export type MarketInstrument = {
  symbol: MarketSymbol;
  baseCurrency: string;
  quoteCurrency: string;
  instrumentType: string | null;
};

export type LiveChartBuyDay = {
  symbol: MarketSymbol;
  date: string;
  time: number;
  totalQuantity: number;
  totalCost: number;
  averagePrice: number;
  tradeCount: number;
};

export type LiveChartPriceMarker = {
  time: number;
  price: number;
  text: string;
  color?: string;
};

export type LiveChartIndicatorOption = {
  id: LiveChartIndicatorId;
  label: string;
};

export type LiveChartSummaryWindowOption = {
  id: LiveChartSummaryWindowId;
  label: string;
  statsLabel: string;
  lookbackDays: number;
  apiTimeframe: "1h" | "1d";
  fetchCount: number;
};

export type LiveChartRangeSummary = {
  window: LiveChartSummaryWindowId;
  changePct: number | null;
  high: number | null;
  low: number | null;
  volumeBase: number | null;
  volumeQuote: number | null;
};

export interface CryptoComCandlePayload {
  t: number | string;
  o: number | string;
  h: number | string;
  l: number | string;
  c: number | string;
  v?: number | string;
}

export interface CryptoComTickerPayload {
  h?: number | string | null;
  l?: number | string | null;
  a?: number | string | null;
  i?: string;
  v?: number | string | null;
  vv?: number | string | null;
  c?: number | string | null;
  b?: number | string | null;
  k?: number | string | null;
  t?: number | string | null;
}

export interface CryptoComInstrumentPayload {
  symbol?: string | null;
  instrument_name?: string | null;
  base_ccy?: string | null;
  base_currency?: string | null;
  quote_ccy?: string | null;
  quote_currency?: string | null;
  inst_type?: string | null;
  type?: string | null;
}

export interface CryptoComRestResponse {
  code?: number;
  message?: string;
  result?: {
    instrument_name?: string;
    data?: CryptoComCandlePayload[] | CryptoComTickerPayload[];
  };
}

export interface CryptoComInstrumentsRestResponse {
  code?: number;
  message?: string;
  result?: {
    data?: CryptoComInstrumentPayload[];
    instrument_list?: CryptoComInstrumentPayload[];
  };
}

export interface CryptoComSocketMessage {
  id?: number;
  method?: string;
  result?: {
    instrument_name?: string;
    channel?: string;
    subscription?: string;
    data?: CryptoComCandlePayload[] | CryptoComCandlePayload | CryptoComTickerPayload[] | CryptoComTickerPayload;
  };
}

export type SymbolListener = (candle: Candle) => void;
export type MarketSummaryListener = (summary: LiveMarketSummary) => void;

export type SymbolSubscriber = (symbol: MarketSymbol, listener: SymbolListener) => () => void;
export type MarketSummarySubscriber = (symbol: MarketSymbol, listener: MarketSummaryListener) => () => void;

export const TIMEFRAME_CONFIG: Record<ChartTimeframe, TimeframeConfig> = {
  "15m": {
    label: "15m",
    apiTimeframe: "15m",
    fetchCount: 1344,
    candleSeconds: 15 * 60,
    visibleDays: 2,
  },
  "1h": {
    label: "1h",
    apiTimeframe: "1h",
    fetchCount: 2160,
    candleSeconds: 60 * 60,
    visibleDays: 3,
  },
  "4h": {
    label: "4h",
    apiTimeframe: "4h",
    fetchCount: 2190,
    candleSeconds: 4 * 60 * 60,
    visibleDays: 100,
  },
  "1d": {
    label: "1d",
    apiTimeframe: "1D",
    fetchCount: 730,
    candleSeconds: 24 * 60 * 60,
    visibleDays: 200,
  },
  "1w": {
    label: "1w",
    apiTimeframe: "7D",
    fetchCount: 260,
    candleSeconds: 7 * 24 * 60 * 60,
    visibleDays: 1000,
  },
  "1M": {
    label: "1M",
    apiTimeframe: "1M",
    fetchCount: 240,
    candleSeconds: 30 * 24 * 60 * 60,
    visibleDays: "all",
  },
} as const;

export const LIVE_CHART_INDICATOR_OPTIONS: LiveChartIndicatorOption[] = [
  { id: "sma_20", label: "SMA 20" },
  { id: "sma_50", label: "SMA 50" },
  { id: "ema_20", label: "EMA 20" },
  { id: "ema_50", label: "EMA 50" },
  { id: "ema_200", label: "EMA 200" },
  { id: "bollinger_20", label: "Bollinger 20" },
];

export const LIVE_CHART_SUMMARY_WINDOW_OPTIONS: LiveChartSummaryWindowOption[] = [
  { id: "24h", label: "24H", statsLabel: "24H", lookbackDays: 1, apiTimeframe: "1h", fetchCount: 48 },
  { id: "1w", label: "1W", statsLabel: "1W", lookbackDays: 7, apiTimeframe: "1d", fetchCount: 14 },
  { id: "1m", label: "1M", statsLabel: "1M", lookbackDays: 30, apiTimeframe: "1d", fetchCount: 45 },
  { id: "6m", label: "6M", statsLabel: "6M", lookbackDays: 183, apiTimeframe: "1d", fetchCount: 220 },
  { id: "1y", label: "1Y", statsLabel: "1Y", lookbackDays: 365, apiTimeframe: "1d", fetchCount: 400 },
  { id: "2y", label: "2Y", statsLabel: "2Y", lookbackDays: 730, apiTimeframe: "1d", fetchCount: 800 },
];

export const isMarketSymbol = (value: string): value is MarketSymbol =>
  /^[A-Z0-9]+_[A-Z0-9]+$/.test(value.trim().toUpperCase());

export const normalizeMarketSymbol = (value: string): MarketSymbol | null => {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/\s*\/\s*/g, "_")
    .replace(/\s*-\s*/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");

  if (!isMarketSymbol(normalized)) {
    return null;
  }

  return normalized;
};

export const formatMarketSymbol = (symbol: MarketSymbol): string => symbol.replace("_", " / ");

export const getTimeframeConfig = (timeframe: ChartTimeframe): TimeframeConfig => TIMEFRAME_CONFIG[timeframe];
export const getLiveChartSummaryWindowConfig = (window: LiveChartSummaryWindowId): LiveChartSummaryWindowOption =>
  LIVE_CHART_SUMMARY_WINDOW_OPTIONS.find((option) => option.id === window) ?? LIVE_CHART_SUMMARY_WINDOW_OPTIONS[0];

export const getVisibleTimeWindow = (
  candles: Candle[],
  timeframe: ChartTimeframe,
): { from: number; to: number } | "all" | null => {
  if (!candles.length) {
    return null;
  }

  const { visibleDays } = getTimeframeConfig(timeframe);

  if (visibleDays === "all") {
    return "all";
  }

  const latestTime = candles[candles.length - 1].time;
  const earliestAllowedTime = latestTime - visibleDays * 24 * 60 * 60;
  const visibleStart = candles.find((candle) => candle.time >= earliestAllowedTime)?.time ?? candles[0].time;

  return {
    from: visibleStart,
    to: latestTime,
  };
};
