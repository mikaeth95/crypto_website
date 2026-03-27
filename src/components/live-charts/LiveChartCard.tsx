import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchHistoricalCandles,
  fetchHistoricalCandlesWindow,
  fetchLiveChartRangeSummary,
  fetchLiveMarketSummary,
  MARKET_HISTORY_START_MS,
  mergeCandleHistory,
  mergeCandleSeries,
} from "../../lib/cryptoApi";
import { cn } from "../../lib/utils";
import {
  formatMarketSymbol,
  getLiveChartSummaryWindowConfig,
  getTimeframeConfig,
  LIVE_CHART_SUMMARY_WINDOW_OPTIONS,
  type LiveChartBuyDay,
  type LiveChartIndicatorId,
  type LiveChartPriceMarker,
  type LiveChartRangeSummary,
  type LiveMarketSummary,
  type MarketSummarySubscriber,
  type Candle,
  type ChartTimeframe,
  type LiveChartSummaryWindowId,
  type MarketSymbol,
  type SymbolSubscriber,
} from "../../types/market";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { CandlestickChart } from "./CandlestickChart";
import { formatNumber, formatPercent, signedClass } from "../../lib/formatters";

interface LiveChartCardProps {
  symbol: MarketSymbol;
  buyDays: LiveChartBuyDay[];
  indicators: LiveChartIndicatorId[];
  summaryWindow: LiveChartSummaryWindowId;
  onSummaryWindowChange: (window: LiveChartSummaryWindowId) => void;
  timeframe: ChartTimeframe;
  isConnected: boolean;
  reconnectVersion: number;
  subscribeToSymbol: SymbolSubscriber;
  subscribeToMarketSummary: MarketSummarySubscriber;
  compact?: boolean;
}

export const LiveChartCard = ({
  symbol,
  buyDays,
  indicators,
  summaryWindow,
  onSummaryWindowChange,
  timeframe,
  isConnected,
  reconnectVersion,
  subscribeToSymbol,
  subscribeToMarketSummary,
  compact = false,
}: LiveChartCardProps) => {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [marketSummary, setMarketSummary] = useState<LiveMarketSummary | null>(null);
  const [rangeSummary, setRangeSummary] = useState<LiveChartRangeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const isMountedRef = useRef(false);

  const symbolLabel = useMemo(() => formatMarketSymbol(symbol), [symbol]);
  const [baseAsset, quoteAsset] = useMemo(() => symbol.split("_"), [symbol]);
  const { candleSeconds, fetchCount, visibleDays } = getTimeframeConfig(timeframe);
  const summaryWindowConfig = useMemo(
    () => getLiveChartSummaryWindowConfig(summaryWindow),
    [summaryWindow],
  );
  const latestPrice = marketSummary?.lastPrice ?? candles[candles.length - 1]?.close ?? null;
  const resolvedChangeValue =
    summaryWindow === "24h" ? marketSummary?.change24hPct ?? null : rangeSummary?.changePct ?? null;
  const resolvedHighValue =
    summaryWindow === "24h" ? marketSummary?.high24h ?? null : rangeSummary?.high ?? null;
  const resolvedLowValue =
    summaryWindow === "24h" ? marketSummary?.low24h ?? null : rangeSummary?.low ?? null;
  const resolvedBaseVolume =
    summaryWindow === "24h" ? marketSummary?.volume24hBase ?? null : rangeSummary?.volumeBase ?? null;
  const resolvedQuoteVolume =
    summaryWindow === "24h" ? marketSummary?.volume24hQuote ?? null : rangeSummary?.volumeQuote ?? null;

  const formatQuoteValue = (
    value: number | null | undefined,
    maxFractionDigits: number = 2,
  ) => {
    if (value === null || value === undefined) {
      return "n/a";
    }

    if (quoteAsset === "USD") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: maxFractionDigits,
      }).format(value);
    }

    if (quoteAsset === "EUR") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: maxFractionDigits,
      }).format(value);
    }

    return `${formatNumber(value, maxFractionDigits)} ${quoteAsset}`;
  };

  const summaryItems = [
    {
      label: `${summaryWindowConfig.statsLabel} Change`,
      value: formatPercent(resolvedChangeValue),
      valueClassName: signedClass(resolvedChangeValue),
    },
    {
      label: "Mark Price",
      value: formatQuoteValue(marketSummary?.markPrice, 4),
      valueClassName: "text-slate-100",
    },
    {
      label: "Index Price",
      value: formatQuoteValue(marketSummary?.indexPrice, 4),
      valueClassName: "text-slate-100",
    },
    {
      label: `${summaryWindowConfig.statsLabel} High`,
      value: formatQuoteValue(resolvedHighValue, 4),
      valueClassName: "text-slate-100",
    },
    {
      label: `${summaryWindowConfig.statsLabel} Low`,
      value: formatQuoteValue(resolvedLowValue, 4),
      valueClassName: "text-slate-100",
    },
    {
      label: `${summaryWindowConfig.statsLabel} Vol (${baseAsset})`,
      value: formatNumber(resolvedBaseVolume, 2),
      valueClassName: "text-slate-100",
    },
    {
      label: `${summaryWindowConfig.statsLabel} Vol (${quoteAsset})`,
      value: formatQuoteValue(resolvedQuoteVolume, 2),
      valueClassName: "text-slate-100",
    },
  ];

  const buyMarkers = useMemo<LiveChartPriceMarker[]>(
    () =>
      buyDays.map((buyDay) => ({
        time: buyDay.time,
        price: buyDay.averagePrice,
        text: `${formatNumber(buyDay.totalQuantity, buyDay.totalQuantity < 1 ? 4 : 2)} (${formatQuoteValue(
          buyDay.totalCost,
          2,
        )}) | ${formatQuoteValue(buyDay.averagePrice, buyDay.averagePrice < 1 ? 6 : 4)}`,
        color: "#f59e0b",
      })),
    [buyDays],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isMountedRef.current) {
      return;
    }

    setCandles([]);
    setMarketSummary(null);
    setLoading(true);
    setErrorMessage(null);
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!isMountedRef.current) {
      return;
    }

    setRangeSummary(null);
  }, [summaryWindow, symbol]);

  useEffect(() => {
    return subscribeToSymbol(symbol, (incomingCandle) => {
      if (!isMountedRef.current) {
        return;
      }

      setErrorMessage(null);
      setCandles((currentCandles) => mergeCandleSeries(currentCandles, incomingCandle, fetchCount));
    });
  }, [fetchCount, symbol, subscribeToSymbol]);

  useEffect(() => {
    return subscribeToMarketSummary(symbol, (incomingSummary) => {
      if (!isMountedRef.current) {
        return;
      }

      setMarketSummary(incomingSummary);
    });
  }, [symbol, subscribeToMarketSummary]);

  useEffect(() => {
    let cancelled = false;
    const loadFullMonthlyHistory = timeframe === "1M";

    if (isMountedRef.current) {
      setLoading(true);
    }

    const initialHistoryPromise = loadFullMonthlyHistory
      ? fetchHistoricalCandlesWindow(symbol, timeframe, {
          count: fetchCount,
          startTsMs: MARKET_HISTORY_START_MS,
          endTsMs: Date.now(),
        })
      : fetchHistoricalCandles(symbol, timeframe, fetchCount);

    void initialHistoryPromise
      .then((historyCandles) => {
        if (cancelled || !isMountedRef.current) {
          return;
        }

        setCandles((currentCandles) =>
          mergeCandleHistory(historyCandles, currentCandles),
        );
        setHistoryVersion((current) => current + 1);
        setErrorMessage(null);

        if (loadFullMonthlyHistory) {
          return;
        }

        const earliestHistoryTime = historyCandles[0]?.time;
        const latestHistoryTime = historyCandles[historyCandles.length - 1]?.time;

        if (!earliestHistoryTime || !latestHistoryTime) {
          return;
        }

        const desiredVisibleStartTime =
          visibleDays === "all"
            ? MARKET_HISTORY_START_MS / 1000
            : latestHistoryTime - visibleDays * 24 * 60 * 60;
        let hasCoveredDesiredVisibleWindow =
          visibleDays === "all" || earliestHistoryTime <= desiredVisibleStartTime;

        // The initial batch is usually already larger than the default viewport.
        // Avoid walking backwards through the full exchange history unless the
        // visible window is still under-filled after the first fetch.
        if (hasCoveredDesiredVisibleWindow) {
          return;
        }

        void (async () => {
          let earliestLoadedTime = earliestHistoryTime;
          let nextWindowEndMs = earliestLoadedTime * 1000;

          while (!cancelled && !hasCoveredDesiredVisibleWindow && nextWindowEndMs > MARKET_HISTORY_START_MS) {
            const nextWindowStartMs = Math.max(
              MARKET_HISTORY_START_MS,
              nextWindowEndMs - fetchCount * candleSeconds * 1000,
            );

            let olderCandles: Candle[];

            try {
              olderCandles = await fetchHistoricalCandlesWindow(symbol, timeframe, {
                count: fetchCount,
                startTsMs: nextWindowStartMs,
                endTsMs: nextWindowEndMs,
              });
            } catch {
              return;
            }

            if (cancelled || !isMountedRef.current) {
              return;
            }

            const strictlyOlderCandles = olderCandles.filter((candle) => candle.time < earliestLoadedTime);

            if (strictlyOlderCandles.length === 0) {
              return;
            }

            const nextEarliestLoadedTime = strictlyOlderCandles[0].time;

            setCandles((currentCandles) => mergeCandleHistory(currentCandles, strictlyOlderCandles));

            // When the initial batch is sparse, older backfill can arrive later.
            // Bump the history version once the loaded range covers the intended viewport
            // so the chart reapplies its visible window instead of staying zoomed to a few bars.
            if (!hasCoveredDesiredVisibleWindow && nextEarliestLoadedTime <= desiredVisibleStartTime) {
              hasCoveredDesiredVisibleWindow = true;
              setHistoryVersion((current) => current + 1);
            }

            if (nextEarliestLoadedTime >= earliestLoadedTime) {
              return;
            }

            earliestLoadedTime = nextEarliestLoadedTime;
            nextWindowEndMs = earliestLoadedTime * 1000;
          }
        })();
      })
      .catch((error: unknown) => {
        if (cancelled || !isMountedRef.current) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Unable to load chart history.");
      })
      .finally(() => {
        if (!cancelled && isMountedRef.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [candleSeconds, fetchCount, reconnectVersion, symbol, timeframe, visibleDays]);

  useEffect(() => {
    let cancelled = false;

    void fetchLiveMarketSummary(symbol)
      .then((summary) => {
        if (cancelled || !isMountedRef.current) {
          return;
        }

        setMarketSummary(summary);
      })
      .catch(() => {
        if (cancelled || !isMountedRef.current) {
          return;
        }

        setMarketSummary(null);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, reconnectVersion]);

  useEffect(() => {
    let cancelled = false;

    void fetchLiveChartRangeSummary(symbol, summaryWindow)
      .then((summary) => {
        if (cancelled || !isMountedRef.current) {
          return;
        }

        setRangeSummary(summary);
      })
      .catch(() => {
        if (cancelled || !isMountedRef.current) {
          return;
        }

        setRangeSummary(null);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, summaryWindow, reconnectVersion]);

  return (
    <Card className={cn("flex flex-col overflow-hidden p-0", compact ? "h-full min-h-0" : "min-h-[460px]")}>
      <div className={cn("space-y-3 border-b border-border/80 bg-panelSoft/65 px-4 py-3", compact ? "" : "")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-start gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-base font-semibold text-slate-100">{symbolLabel}</h2>
                <p className="tabular text-base font-medium text-slate-200">{formatQuoteValue(latestPrice, 4)}</p>
              </div>
            </div>
            <div className="flex min-w-[148px] items-center gap-2">
              <p className="terminal-label whitespace-nowrap">
                Stats Range
              </p>
              <select
                value={summaryWindow}
                onChange={(event) => onSummaryWindowChange(event.target.value as LiveChartSummaryWindowId)}
                className="min-w-[80px] rounded-lg border border-border bg-panel px-2 py-1 text-xs text-slate-100 outline-none transition focus:border-accent/70"
                aria-label={`Select stats range for ${symbolLabel}`}
              >
                {LIVE_CHART_SUMMARY_WINDOW_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone="blue">{timeframe}</Badge>
            <Badge tone={isConnected ? "green" : "red"}>{isConnected ? "Live" : "Offline"}</Badge>
          </div>
        </div>

        <div
          className={cn(
            "grid gap-x-2 gap-y-2 border-t border-border/70 pt-3",
            compact ? "grid-cols-2 md:grid-cols-4 xl:grid-cols-7" : "grid-cols-2 md:grid-cols-4 xl:grid-cols-7",
          )}
        >
          {summaryItems.map((item) => (
            <div key={item.label} className="min-w-0 rounded-md border border-border/60 bg-[#0d131a] px-2.5 py-2">
              <p className="truncate whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {item.label}
              </p>
              <p className={cn("tabular truncate text-xs font-medium leading-tight", item.valueClassName)}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4">
        <CandlestickChart
          candles={candles}
          indicators={indicators}
          markers={buyMarkers}
          timeframe={timeframe}
          historyVersion={historyVersion}
          loading={loading}
          errorMessage={candles.length === 0 ? errorMessage : null}
          compact={compact}
        />
      </div>

      {errorMessage && candles.length > 0 ? (
        <p className="px-4 pb-4 text-xs text-rose-300">{errorMessage}</p>
      ) : !isConnected ? (
        <p className="px-4 pb-4 text-xs text-slate-500">Waiting for the shared market socket to reconnect.</p>
      ) : null}
    </Card>
  );
};
