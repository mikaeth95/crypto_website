import { useEffect, useMemo, useState } from "react";
import {
  fetchHistoricalCandlesWindow,
  fetchInstrumentAth,
  fetchLiveMarketSummary,
} from "../lib/cryptoApi";
import { resolveCoinMarketCapUrlForInstrument } from "../lib/coinmarketcap";
import { useCryptoWebSocket } from "./useCryptoWebSocket";
import {
  DEFAULT_TIMEFRAME,
  normalizeMarketSymbol,
  type Candle,
  type LiveInstrumentAth,
  type LiveMarketSummary,
  type MarketSymbol,
} from "../types/market";
import type { CoinPerformanceRow, PortfolioAssetRow } from "../types/portfolio";

export type PerformanceDisplayRow = CoinPerformanceRow & {
  quote: string;
  symbol: MarketSymbol | null;
  currentPriceResolved: number | null;
  athResolved: number | null;
  athDateResolved: string | null;
  athDrawdownResolved: number | null;
};

type PerformanceRangeSnapshot = {
  change7D: number | null;
  change30D: number | null;
  change90D: number | null;
  change1Y: number | null;
  high30D: number | null;
  low30D: number | null;
  range30DPct: number | null;
  high1Y: number | null;
  drawdown1YPct: number | null;
  vol30D: number | null;
  vol90D: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 250;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const fetchWithRetry = async <T>(loader: () => Promise<T>, retries: number = 1): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await loader();
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError;
};

const selectCandlesWithinDays = (candles: Candle[], lookbackDays: number) => {
  if (!candles.length) {
    return [];
  }

  const latestTime = candles[candles.length - 1]?.time ?? 0;
  const earliestAllowedTime = latestTime - lookbackDays * 24 * 60 * 60;

  return candles.filter((candle) => candle.time >= earliestAllowedTime);
};

const buildWindowStats = (candles: Candle[]) => {
  if (!candles.length) {
    return {
      changePct: null,
      high: null,
      low: null,
      volumeQuote: null,
    };
  }

  const firstCandle = candles[0];
  const lastCandle = candles[candles.length - 1];
  const high = candles.reduce((currentHigh, candle) => Math.max(currentHigh, candle.high), candles[0].high);
  const low = candles.reduce((currentLow, candle) => Math.min(currentLow, candle.low), candles[0].low);
  const volumeQuote = candles.reduce(
    (total, candle) => total + (candle.volume ?? 0) * candle.close,
    0,
  );

  return {
    changePct: firstCandle.open > 0 ? ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100 : null,
    high,
    low,
    volumeQuote,
  };
};

const createEmptyRangeSnapshot = (): PerformanceRangeSnapshot => ({
  change7D: null,
  change30D: null,
  change90D: null,
  change1Y: null,
  high30D: null,
  low30D: null,
  range30DPct: null,
  high1Y: null,
  drawdown1YPct: null,
  vol30D: null,
  vol90D: null,
});

export const usePerformanceMarketData = (
  performanceRows: CoinPerformanceRow[],
  assets: PortfolioAssetRow[],
) => {
  const [liveSummaries, setLiveSummaries] = useState<Record<string, LiveMarketSummary>>({});
  const [athSnapshots, setAthSnapshots] = useState<Record<string, LiveInstrumentAth>>({});
  const [rangeSnapshots, setRangeSnapshots] = useState<Record<string, PerformanceRangeSnapshot>>({});

  const assetLookup = useMemo(
    () =>
      new Map(
        assets.map((asset) => [asset.asset.toUpperCase(), asset]),
      ),
    [assets],
  );

  const baseRows = useMemo<PerformanceDisplayRow[]>(
    () =>
      performanceRows.map((row) => {
        const asset = assetLookup.get(row.asset.toUpperCase());
        const quote = asset?.quote ?? "USD";
        const symbol =
          row.asset.toUpperCase() === quote.toUpperCase()
            ? null
            : normalizeMarketSymbol(`${row.asset}_${quote}`);

        return {
          ...row,
          quote,
          symbol,
          currentPriceResolved: row.currentPrice,
          athResolved: row.ath,
          athDateResolved: row.athDate,
          athDrawdownResolved: row.athDrawdownPct,
        };
      }),
    [assetLookup, performanceRows],
  );

  const symbols = useMemo(
    () =>
      Array.from(
        new Set(
          baseRows
            .map((row) => row.symbol)
            .filter((symbol): symbol is MarketSymbol => symbol !== null),
        ),
      ),
    [baseRows],
  );

  const { subscribeToMarketSummary } = useCryptoWebSocket({
    symbols,
    timeframe: DEFAULT_TIMEFRAME,
    subscribeCandlesticks: false,
    subscribeTickers: true,
  });

  useEffect(() => {
    const unsubscribers = symbols.map((symbol) =>
      subscribeToMarketSummary(symbol, (summary) => {
        setLiveSummaries((currentSummaries) => ({
          ...currentSummaries,
          [symbol]: summary,
        }));
      }),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [subscribeToMarketSummary, symbols]);

  useEffect(() => {
    let cancelled = false;

    symbols.forEach((symbol) => {
      void fetchLiveMarketSummary(symbol)
        .then((summary) => {
          if (cancelled) {
            return;
          }

          setLiveSummaries((currentSummaries) => ({
            ...currentSummaries,
            [symbol]: summary,
          }));
        })
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [symbols]);

  useEffect(() => {
    let cancelled = false;

    symbols.forEach((symbol) => {
      void fetchWithRetry(() => fetchInstrumentAth(symbol))
        .then((athSnapshot) => {
          if (cancelled) {
            return;
          }

          setAthSnapshots((currentAthSnapshots) => ({
            ...currentAthSnapshots,
            [symbol]: athSnapshot,
          }));
        })
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [symbols]);

  useEffect(() => {
    let cancelled = false;

    symbols.forEach((symbol) => {
      const now = Date.now();

      void fetchWithRetry(() =>
        fetchHistoricalCandlesWindow(symbol, "1d", {
          count: 400,
          startTsMs: now - 365 * DAY_MS,
          endTsMs: now,
        }),
      )
        .then((candles1Y) => {
          if (cancelled) {
            return;
          }

          const stats7D = buildWindowStats(selectCandlesWithinDays(candles1Y, 7));
          const stats30D = buildWindowStats(selectCandlesWithinDays(candles1Y, 30));
          const stats90D = buildWindowStats(selectCandlesWithinDays(candles1Y, 90));
          const stats1Y = buildWindowStats(selectCandlesWithinDays(candles1Y, 365));
          const lastClose1Y = candles1Y[candles1Y.length - 1]?.close ?? null;

          setRangeSnapshots((currentRangeSnapshots) => ({
            ...currentRangeSnapshots,
            [symbol]: {
              change7D: stats7D.changePct,
              change30D: stats30D.changePct,
              change90D: stats90D.changePct,
              change1Y: stats1Y.changePct,
              high30D: stats30D.high,
              low30D: stats30D.low,
              range30DPct:
                stats30D.high !== null && stats30D.low !== null && stats30D.low > 0
                  ? ((stats30D.high - stats30D.low) / stats30D.low) * 100
                  : null,
              high1Y: stats1Y.high,
              drawdown1YPct:
                lastClose1Y !== null && stats1Y.high !== null && stats1Y.high > 0
                  ? ((lastClose1Y - stats1Y.high) / stats1Y.high) * 100
                  : null,
              vol30D: stats30D.volumeQuote,
              vol90D: stats90D.volumeQuote,
            },
          }));
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setRangeSnapshots((currentRangeSnapshots) => ({
            ...currentRangeSnapshots,
            [symbol]: createEmptyRangeSnapshot(),
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [symbols]);

  const rows = useMemo(
    () =>
      baseRows.map((row) => {
        const liveSummary = row.symbol ? liveSummaries[row.symbol] : undefined;
        const athSnapshot = row.symbol ? athSnapshots[row.symbol] : undefined;
        const rangeSnapshot = row.symbol ? rangeSnapshots[row.symbol] : undefined;
        const currentPriceResolved = liveSummary?.lastPrice ?? row.currentPrice;
        const change1D = liveSummary?.change24hPct ?? row.change1D;
        const athResolved = athSnapshot?.price ?? row.ath;
        const athDateResolved = athSnapshot?.date ?? row.athDate;
        const athDrawdownResolved =
          currentPriceResolved !== null && athResolved !== null && athResolved > 0
            ? ((currentPriceResolved - athResolved) / athResolved) * 100
            : row.athDrawdownPct;
        const distanceAvgPct =
          currentPriceResolved !== null && row.avgBuy !== null && row.avgBuy > 0
            ? ((currentPriceResolved - row.avgBuy) / row.avgBuy) * 100
            : row.distanceAvgPct;
        const cmcUrl =
          row.symbol ? resolveCoinMarketCapUrlForInstrument(row.symbol) ?? row.cmcUrl ?? null : row.cmcUrl ?? null;
        const cmcLinkLabel = cmcUrl ? "Open" : row.cmcLinkLabel;

        return {
          ...row,
          currentPriceResolved,
          change1D,
          change7D: rangeSnapshot?.change7D ?? row.change7D,
          change30D: rangeSnapshot?.change30D ?? row.change30D,
          change90D: rangeSnapshot?.change90D ?? row.change90D,
          change1Y: rangeSnapshot?.change1Y ?? row.change1Y,
          athResolved,
          athDateResolved,
          athDrawdownResolved,
          high30D: rangeSnapshot?.high30D ?? row.high30D,
          low30D: rangeSnapshot?.low30D ?? row.low30D,
          range30DPct: rangeSnapshot?.range30DPct ?? row.range30DPct,
          high1Y: rangeSnapshot?.high1Y ?? row.high1Y,
          drawdown1YPct: rangeSnapshot?.drawdown1YPct ?? row.drawdown1YPct,
          vol30D: rangeSnapshot?.vol30D ?? row.vol30D,
          vol90D: rangeSnapshot?.vol90D ?? row.vol90D,
          distanceAvgPct,
          cmcUrl,
          cmcLinkLabel,
        };
      }),
    [athSnapshots, baseRows, liveSummaries, rangeSnapshots],
  );

  return { rows };
};
