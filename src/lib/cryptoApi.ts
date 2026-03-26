import type {
  Candle,
  ChartTimeframe,
  CryptoComCandlePayload,
  CryptoComInstrumentPayload,
  CryptoComInstrumentsRestResponse,
  CryptoComTickerPayload,
  LiveChartRangeSummary,
  LiveChartSummaryWindowId,
  LiveInstrumentAth,
  LiveMarketSummary,
  MarketInstrument,
  CryptoComRestResponse,
  MarketSymbol,
} from "../types/market";
import {
  getLiveChartSummaryWindowConfig,
  getTimeframeConfig,
  normalizeMarketSymbol,
} from "../types/market";

const REST_ENDPOINT = "https://api.crypto.com/exchange/v1/public/get-candlestick";
const TICKER_ENDPOINT = "https://api.crypto.com/exchange/v1/public/get-tickers";
const INSTRUMENTS_ENDPOINT = "https://api.crypto.com/exchange/v1/public/get-instruments";
export const MARKET_HISTORY_START_MS = Date.UTC(2014, 0, 1);

type RequestCacheEntry<T> = {
  value?: T;
  expiresAt: number;
  staleUntil: number;
  lastAccessedAt: number;
  promise?: Promise<T>;
};

const requestCache = new Map<string, RequestCacheEntry<unknown>>();
const MAX_REQUEST_CACHE_ENTRIES = 120;

const LIVE_SUMMARY_TTL_MS = 15_000;
const LIVE_SUMMARY_STALE_MS = 60_000;
const CANDLE_TTL_MS = 10 * 60_000;
const CANDLE_STALE_MS = 60 * 60_000;
const ATH_TTL_MS = 12 * 60 * 60_000;
const ATH_STALE_MS = 7 * 24 * 60 * 60_000;
const INSTRUMENTS_TTL_MS = 12 * 60 * 60_000;
const INSTRUMENTS_STALE_MS = 7 * 24 * 60 * 60_000;

const setCachedEntry = <T>(key: string, entry: Omit<RequestCacheEntry<T>, "lastAccessedAt">) => {
  requestCache.delete(key);
  requestCache.set(key, {
    ...entry,
    lastAccessedAt: Date.now(),
  });
};

const pruneRequestCache = () => {
  const now = Date.now();

  for (const [key, entry] of requestCache.entries()) {
    if (!entry.promise && entry.staleUntil <= now) {
      requestCache.delete(key);
    }
  }

  if (requestCache.size <= MAX_REQUEST_CACHE_ENTRIES) {
    return;
  }

  const removableEntries = Array.from(requestCache.entries())
    .filter(([, entry]) => !entry.promise)
    .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt);

  while (requestCache.size > MAX_REQUEST_CACHE_ENTRIES && removableEntries.length > 0) {
    const nextEntry = removableEntries.shift();

    if (!nextEntry) {
      break;
    }

    requestCache.delete(nextEntry[0]);
  }
};

const normalizeCandleBoundaryMs = (value: number, timeframe: ChartTimeframe) => {
  const candleMs = getTimeframeConfig(timeframe).candleSeconds * 1000;

  return Math.floor(value / candleMs) * candleMs;
};

const buildCandlestickCacheKey = (
  symbol: MarketSymbol,
  timeframe: ChartTimeframe,
  options?: {
    count?: number;
    startTsMs?: number;
    endTsMs?: number;
  },
) => {
  const normalizedStart =
    options?.startTsMs !== undefined ? normalizeCandleBoundaryMs(options.startTsMs, timeframe) : "na";
  const normalizedEnd =
    options?.endTsMs !== undefined ? normalizeCandleBoundaryMs(options.endTsMs, timeframe) : "na";
  const normalizedCount = options?.count ?? "na";

  return `candles:${symbol}:${timeframe}:${normalizedCount}:${normalizedStart}:${normalizedEnd}`;
};

const getCachedRequest = async <T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number,
  staleMs: number,
): Promise<T> => {
  pruneRequestCache();

  const now = Date.now();
  const currentEntry = requestCache.get(key) as RequestCacheEntry<T> | undefined;

  if (currentEntry?.value !== undefined && currentEntry.expiresAt > now) {
    setCachedEntry(key, currentEntry);
    return currentEntry.value;
  }

  if (currentEntry?.promise) {
    return currentEntry.promise;
  }

  if (currentEntry?.value !== undefined && currentEntry.staleUntil > now) {
    const refreshPromise = loader()
      .then((value) => {
        setCachedEntry(key, {
          value,
          expiresAt: Date.now() + ttlMs,
          staleUntil: Date.now() + staleMs,
        });
        pruneRequestCache();

        return value;
      })
      .catch(() => currentEntry.value as T)
      .finally(() => {
        const latestEntry = requestCache.get(key) as RequestCacheEntry<T> | undefined;

        if (latestEntry?.promise === refreshPromise) {
          setCachedEntry(key, {
            value: latestEntry.value,
            expiresAt: latestEntry.expiresAt,
            staleUntil: latestEntry.staleUntil,
          });
          pruneRequestCache();
        }
      });

    setCachedEntry(key, {
      value: currentEntry.value,
      expiresAt: currentEntry.expiresAt,
      staleUntil: currentEntry.staleUntil,
      promise: refreshPromise,
    });

    return currentEntry.value;
  }

  const promise = loader()
    .then((value) => {
      setCachedEntry(key, {
        value,
        expiresAt: Date.now() + ttlMs,
        staleUntil: Date.now() + staleMs,
      });
      pruneRequestCache();

      return value;
    })
    .catch((error) => {
      requestCache.delete(key);
      throw error;
    });

  setCachedEntry(key, {
    value: currentEntry?.value,
    expiresAt: currentEntry?.expiresAt ?? 0,
    staleUntil: currentEntry?.staleUntil ?? 0,
    promise,
  });

  return promise;
};

const toFiniteNumber = (value: number | string | undefined, field: string): number => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid candle ${field} value.`);
  }

  return parsed;
};

const toOptionalFiniteNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeCandleTime = (value: number | string): number => {
  const parsed = toFiniteNumber(value, "time");

  return parsed > 10_000_000_000 ? Math.floor(parsed / 1000) : Math.floor(parsed);
};

export const normalizeCryptoComCandle = (payload: CryptoComCandlePayload): Candle => ({
  time: normalizeCandleTime(payload.t),
  open: toFiniteNumber(payload.o, "open"),
  high: toFiniteNumber(payload.h, "high"),
  low: toFiniteNumber(payload.l, "low"),
  close: toFiniteNumber(payload.c, "close"),
  volume: payload.v === undefined ? undefined : toFiniteNumber(payload.v, "volume"),
});

export const normalizeCryptoComCandles = (payloads: CryptoComCandlePayload[]): Candle[] =>
  payloads.map(normalizeCryptoComCandle).sort((left, right) => left.time - right.time);

export const buildTickerChannel = (symbol: MarketSymbol) => `ticker.${symbol}`;

const toTrimmedUpperString = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toUpperCase();

  return trimmed ? trimmed : null;
};

export const normalizeCryptoComInstrument = (payload: CryptoComInstrumentPayload): MarketInstrument | null => {
  const rawSymbol = payload.symbol ?? payload.instrument_name ?? null;
  const symbol = rawSymbol ? normalizeMarketSymbol(rawSymbol) : null;

  if (!symbol) {
    return null;
  }

  const [symbolBaseCurrency, symbolQuoteCurrency] = symbol.split("_");
  const baseCurrency = toTrimmedUpperString(payload.base_ccy ?? payload.base_currency) ?? symbolBaseCurrency ?? null;
  const quoteCurrency = toTrimmedUpperString(payload.quote_ccy ?? payload.quote_currency) ?? symbolQuoteCurrency ?? null;

  if (!baseCurrency || !quoteCurrency) {
    return null;
  }

  return {
    symbol,
    baseCurrency,
    quoteCurrency,
    instrumentType: toTrimmedUpperString(payload.inst_type ?? payload.type),
  };
};

export const normalizeCryptoComTicker = (
  symbol: MarketSymbol,
  payload: CryptoComTickerPayload,
): LiveMarketSummary => {
  const lastPrice = toOptionalFiniteNumber(payload.a);
  const bestBid = toOptionalFiniteNumber(payload.b);
  const bestAsk = toOptionalFiniteNumber(payload.k);
  const midPrice =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : lastPrice;

  return {
    symbol,
    lastPrice,
    change24hPct: (() => {
      const changeRatio = toOptionalFiniteNumber(payload.c);
      return changeRatio === null ? null : changeRatio * 100;
    })(),
    // Spot instruments do not always expose dedicated mark/index values. Use the
    // best bid/ask midpoint first, then the latest traded price as a stable fallback.
    markPrice: midPrice,
    indexPrice: lastPrice ?? midPrice,
    high24h: toOptionalFiniteNumber(payload.h),
    low24h: toOptionalFiniteNumber(payload.l),
    volume24hBase: toOptionalFiniteNumber(payload.v),
    volume24hQuote: toOptionalFiniteNumber(payload.vv),
  };
};

export const buildCandlestickChannel = (timeframe: ChartTimeframe, symbol: MarketSymbol) => {
  const { apiTimeframe } = getTimeframeConfig(timeframe);

  return `candlestick.${apiTimeframe}.${symbol}`;
};

export const parseCandlestickChannelSymbol = (channel: string): MarketSymbol | null => {
  const parts = channel.split(".");
  const symbol = parts[2];

  return symbol ? normalizeMarketSymbol(symbol) : null;
};

export const parseTickerChannelSymbol = (channel: string): MarketSymbol | null => {
  const parts = channel.split(".");
  const symbol = parts[1];

  return symbol ? normalizeMarketSymbol(symbol) : null;
};

export const mergeCandleSeries = (
  candles: Candle[],
  incoming: Candle,
  maxPoints?: number,
): Candle[] => {
  if (!candles.length) {
    return [incoming];
  }

  const nextCandles = candles.slice();
  const existingIndex = nextCandles.findIndex((candle) => candle.time === incoming.time);

  if (existingIndex >= 0) {
    nextCandles[existingIndex] = incoming;
  } else if (incoming.time > nextCandles[nextCandles.length - 1].time) {
    nextCandles.push(incoming);
  } else {
    nextCandles.push(incoming);
    nextCandles.sort((left, right) => left.time - right.time);
  }

  return typeof maxPoints === "number" ? nextCandles.slice(-maxPoints) : nextCandles;
};

export const mergeCandleHistory = (
  candles: Candle[],
  incomingCandles: Candle[],
): Candle[] => {
  if (incomingCandles.length === 0) {
    return candles;
  }

  const candleMap = new Map<number, Candle>();

  candles.forEach((candle) => {
    candleMap.set(candle.time, candle);
  });

  incomingCandles.forEach((candle) => {
    candleMap.set(candle.time, candle);
  });

  return Array.from(candleMap.values()).sort((left, right) => left.time - right.time);
};

const fetchCandlestickBatch = async (
  symbol: MarketSymbol,
  timeframe: ChartTimeframe,
  options?: {
    count?: number;
    startTsMs?: number;
    endTsMs?: number;
  },
): Promise<Candle[]> => {
  const url = new URL(REST_ENDPOINT);
  const { apiTimeframe } = getTimeframeConfig(timeframe);

  url.searchParams.set("instrument_name", symbol);
  url.searchParams.set("timeframe", apiTimeframe);

  if (options?.count !== undefined) {
    url.searchParams.set("count", String(options.count));
  }

  if (options?.startTsMs !== undefined) {
    url.searchParams.set("start_ts", String(options.startTsMs));
  }

  if (options?.endTsMs !== undefined) {
    url.searchParams.set("end_ts", String(options.endTsMs));
  }

  return getCachedRequest(
    buildCandlestickCacheKey(symbol, timeframe, options),
    async () => {
      let response: Response;

      try {
        response = await fetch(url.toString());
      } catch {
        throw new Error("Unable to reach the Crypto.com candlestick REST API.");
      }

      if (!response.ok) {
        throw new Error(`Crypto.com candlestick REST API returned ${response.status}.`);
      }

      let payload: CryptoComRestResponse;

      try {
        payload = (await response.json()) as CryptoComRestResponse;
      } catch {
        throw new Error("Crypto.com candlestick REST API returned invalid JSON.");
      }

      if (payload.code !== 0 || !payload.result?.data) {
        throw new Error(payload.message ?? "Crypto.com candlestick REST API returned an invalid payload.");
      }

      return normalizeCryptoComCandles(payload.result.data as CryptoComCandlePayload[]);
    },
    CANDLE_TTL_MS,
    CANDLE_STALE_MS,
  );
};

export const fetchHistoricalCandlesWindow = async (
  symbol: MarketSymbol,
  timeframe: ChartTimeframe,
  options?: {
    count?: number;
    startTsMs?: number;
    endTsMs?: number;
  },
): Promise<Candle[]> => fetchCandlestickBatch(symbol, timeframe, options);

export const fetchHistoricalCandles = async (
  symbol: MarketSymbol,
  timeframe: ChartTimeframe,
  count: number = getTimeframeConfig(timeframe).fetchCount,
): Promise<Candle[]> => {
  const candles = await fetchCandlestickBatch(symbol, timeframe, { count });

  return candles.slice(-count);
};

export const fetchLiveChartRangeSummary = async (
  symbol: MarketSymbol,
  window: LiveChartSummaryWindowId,
): Promise<LiveChartRangeSummary> => {
  const config = getLiveChartSummaryWindowConfig(window);
  const endTsMs = Date.now();
  const startTsMs = endTsMs - config.lookbackDays * 24 * 60 * 60 * 1000;
  const candles = await fetchHistoricalCandlesWindow(symbol, config.apiTimeframe, {
    count: config.fetchCount,
    startTsMs,
    endTsMs,
  });

  if (candles.length === 0) {
    return {
      window,
      changePct: null,
      high: null,
      low: null,
      volumeBase: null,
      volumeQuote: null,
    };
  }

  const firstCandle = candles[0];
  const lastCandle = candles[candles.length - 1];
  const high = candles.reduce((currentHigh, candle) => Math.max(currentHigh, candle.high), candles[0].high);
  const low = candles.reduce((currentLow, candle) => Math.min(currentLow, candle.low), candles[0].low);
  const volumeBase = candles.reduce((total, candle) => total + (candle.volume ?? 0), 0);
  const volumeQuote = candles.reduce(
    (total, candle) => total + (candle.volume ?? 0) * candle.close,
    0,
  );

  return {
    window,
    changePct:
      firstCandle.open > 0 ? ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100 : null,
    high,
    low,
    volumeBase,
    volumeQuote,
  };
};

export const fetchLiveMarketSummary = async (
  symbol: MarketSymbol,
): Promise<LiveMarketSummary> => {
  const url = new URL(TICKER_ENDPOINT);

  url.searchParams.set("instrument_name", symbol);

  return getCachedRequest(
    `ticker:${symbol}`,
    async () => {
      let response: Response;

      try {
        response = await fetch(url.toString());
      } catch {
        throw new Error("Unable to reach the Crypto.com ticker REST API.");
      }

      if (!response.ok) {
        throw new Error(`Crypto.com ticker REST API returned ${response.status}.`);
      }

      let payload: CryptoComRestResponse;

      try {
        payload = (await response.json()) as CryptoComRestResponse;
      } catch {
        throw new Error("Crypto.com ticker REST API returned invalid JSON.");
      }

      if (payload.code !== 0 || !payload.result?.data || !Array.isArray(payload.result.data)) {
        throw new Error(payload.message ?? "Crypto.com ticker REST API returned an invalid payload.");
      }

      const tickerPayload = (payload.result.data as CryptoComTickerPayload[])[0];

      if (!tickerPayload) {
        throw new Error("Crypto.com ticker REST API returned no ticker data.");
      }

      return normalizeCryptoComTicker(symbol, tickerPayload);
    },
    LIVE_SUMMARY_TTL_MS,
    LIVE_SUMMARY_STALE_MS,
  );
};

export const fetchLiveMarketSummaries = async (): Promise<Record<string, LiveMarketSummary>> => {
  let response: Response;

  try {
    response = await fetch(TICKER_ENDPOINT);
  } catch {
    throw new Error("Unable to reach the Crypto.com ticker REST API.");
  }

  if (!response.ok) {
    throw new Error(`Crypto.com ticker REST API returned ${response.status}.`);
  }

  let payload: CryptoComRestResponse;

  try {
    payload = (await response.json()) as CryptoComRestResponse;
  } catch {
    throw new Error("Crypto.com ticker REST API returned invalid JSON.");
  }

  if (payload.code !== 0 || !payload.result?.data || !Array.isArray(payload.result.data)) {
    throw new Error(payload.message ?? "Crypto.com ticker REST API returned an invalid payload.");
  }

  return (payload.result.data as CryptoComTickerPayload[]).reduce<Record<string, LiveMarketSummary>>(
    (summaries, tickerPayload) => {
      const symbol = typeof tickerPayload.i === "string" ? normalizeMarketSymbol(tickerPayload.i) : null;

      if (!symbol) {
        return summaries;
      }

      summaries[symbol] = normalizeCryptoComTicker(symbol, tickerPayload);

      return summaries;
    },
    {},
  );
};

export const fetchInstrumentAth = async (
  symbol: MarketSymbol,
): Promise<LiveInstrumentAth> => {
  return getCachedRequest(
    `ath:${symbol}`,
    async () => {
      const monthlyCandles = await fetchCandlestickBatch(symbol, "1M", {
        count: 150,
        startTsMs: MARKET_HISTORY_START_MS,
        endTsMs: Date.now(),
      });

      if (monthlyCandles.length === 0) {
        return {
          symbol,
          price: null,
          date: null,
        };
      }

      const athMonth = monthlyCandles.reduce((highestCandle, candle) =>
        candle.high > highestCandle.high ? candle : highestCandle,
      );

      const athMonthDate = new Date(athMonth.time * 1000);
      const athMonthStartMs = Date.UTC(athMonthDate.getUTCFullYear(), athMonthDate.getUTCMonth(), 1);
      const nextMonthStartMs = Date.UTC(athMonthDate.getUTCFullYear(), athMonthDate.getUTCMonth() + 1, 1);

      const dailyCandles = await fetchCandlestickBatch(symbol, "1d", {
        count: 40,
        startTsMs: athMonthStartMs,
        endTsMs: nextMonthStartMs,
      });

      const athDay = (dailyCandles.length > 0 ? dailyCandles : [athMonth]).reduce((highestCandle, candle) =>
        candle.high > highestCandle.high ? candle : highestCandle,
      );

      return {
        symbol,
        price: athDay.high,
        date: new Date(athDay.time * 1000).toISOString().slice(0, 10),
      };
    },
    ATH_TTL_MS,
    ATH_STALE_MS,
  );
};

export const fetchMarketInstruments = async (): Promise<MarketInstrument[]> => {
  return getCachedRequest(
    "instruments",
    async () => {
      let response: Response;

      try {
        response = await fetch(INSTRUMENTS_ENDPOINT);
      } catch {
        throw new Error("Unable to reach the Crypto.com instruments REST API.");
      }

      if (!response.ok) {
        throw new Error(`Crypto.com instruments REST API returned ${response.status}.`);
      }

      let payload: CryptoComInstrumentsRestResponse;

      try {
        payload = (await response.json()) as CryptoComInstrumentsRestResponse;
      } catch {
        throw new Error("Crypto.com instruments REST API returned invalid JSON.");
      }

      if (payload.code !== 0 || !payload.result) {
        throw new Error(payload.message ?? "Crypto.com instruments REST API returned an invalid payload.");
      }

      const rawInstruments = Array.isArray(payload.result.data)
        ? payload.result.data
        : Array.isArray(payload.result.instrument_list)
          ? payload.result.instrument_list
          : [];

      const dedupedInstruments = new Map<MarketSymbol, MarketInstrument>();

      rawInstruments.forEach((rawInstrument) => {
        const normalizedInstrument = normalizeCryptoComInstrument(rawInstrument);

        if (!normalizedInstrument) {
          return;
        }

        dedupedInstruments.set(normalizedInstrument.symbol, normalizedInstrument);
      });

      return Array.from(dedupedInstruments.values()).sort((left, right) => {
        const baseCompare = left.baseCurrency.localeCompare(right.baseCurrency);

        if (baseCompare !== 0) {
          return baseCompare;
        }

        return left.quoteCurrency.localeCompare(right.quoteCurrency);
      });
    },
    INSTRUMENTS_TTL_MS,
    INSTRUMENTS_STALE_MS,
  );
};
