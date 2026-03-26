import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  TickMarkType,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesMarkersPluginApi,
  type ISeriesApi,
  type LineData,
  type LogicalRange,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { buildIndicatorLines } from "../../lib/chartIndicators";
import { cn } from "../../lib/utils";
import {
  getVisibleTimeWindow,
  type Candle,
  type ChartTimeframe,
  type LiveChartIndicatorId,
  type LiveChartPriceMarker,
} from "../../types/market";

interface CandlestickChartProps {
  candles: Candle[];
  indicators?: LiveChartIndicatorId[];
  markers?: LiveChartPriceMarker[];
  timeframe: ChartTimeframe;
  historyVersion: number;
  loading: boolean;
  errorMessage: string | null;
  compact?: boolean;
}

const toChartCandle = (candle: Candle): CandlestickData<UTCTimestamp> => ({
  time: candle.time as UTCTimestamp,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
});

const toVolumePoint = (candle: Candle): HistogramData<UTCTimestamp> => ({
  time: candle.time as UTCTimestamp,
  value: candle.volume ?? 0,
  color: candle.close >= candle.open ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)",
});

const resolveMarkerTime = (markerTime: number, candles: Candle[]): number | null => {
  if (candles.length === 0) {
    return null;
  }

  const firstCandleOnOrAfterMarker = candles.find((candle) => candle.time >= markerTime);

  if (firstCandleOnOrAfterMarker) {
    return firstCandleOnOrAfterMarker.time;
  }

  return candles[candles.length - 1]?.time ?? null;
};

const toDateFromTime = (time: Time): Date | null => {
  if (typeof time === "number") {
    return new Date(time * 1000);
  }

  if (typeof time === "string") {
    const parsed = new Date(time);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof time === "object" && time !== null && "year" in time && "month" in time && "day" in time) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }

  return null;
};

const formatUtc = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    ...options,
  }).format(date);

const formatTickMark = (timeframe: ChartTimeframe, time: Time, tickMarkType: TickMarkType): string | null => {
  const date = toDateFromTime(time);

  if (!date) {
    return null;
  }

  if (timeframe === "1M") {
    return formatUtc(date, { month: "short", year: "numeric" });
  }

  if (timeframe === "1w") {
    return formatUtc(date, { day: "2-digit", month: "short", year: "2-digit" });
  }

  if (timeframe === "1d") {
    return formatUtc(date, { day: "2-digit", month: "short", year: "numeric" });
  }

  if (timeframe === "4h") {
    if (tickMarkType === TickMarkType.Time || tickMarkType === TickMarkType.TimeWithSeconds) {
      return formatUtc(date, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    }

    return formatUtc(date, { day: "2-digit", month: "short" });
  }

  if (tickMarkType === TickMarkType.Time || tickMarkType === TickMarkType.TimeWithSeconds) {
    return formatUtc(date, { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  return formatUtc(date, { day: "2-digit", month: "short" });
};

const formatCrosshairTime = (timeframe: ChartTimeframe, time: Time): string => {
  const date = toDateFromTime(time);

  if (!date) {
    return "";
  }

  switch (timeframe) {
    case "15m":
    case "1h":
      return formatUtc(date, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    case "4h":
      return formatUtc(date, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    case "1d":
    case "1w":
      return formatUtc(date, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    case "1M":
      return formatUtc(date, {
        month: "short",
        year: "numeric",
      });
  }
};

const buildTimeScaleOptions = (timeframe: ChartTimeframe) => ({
  visible: true,
  borderColor: "#1E2630",
  timeVisible: timeframe === "15m" || timeframe === "1h" || timeframe === "4h",
  secondsVisible: false,
  tickMarkFormatter: (time: Time, tickMarkType: TickMarkType, _locale: string) =>
    formatTickMark(timeframe, time, tickMarkType),
});

export const CandlestickChart = ({
  candles,
  indicators = [],
  markers = [],
  timeframe,
  historyVersion,
  loading,
  errorMessage,
  compact = false,
}: CandlestickChartProps) => {
  const mainContainerRef = useRef<HTMLDivElement | null>(null);
  const volumeContainerRef = useRef<HTMLDivElement | null>(null);
  const mainChartRef = useRef<IChartApi | null>(null);
  const volumeChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indicatorSeriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const markerPrimitiveRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const resolvedMarkersRef = useRef<
    Array<LiveChartPriceMarker & { resolvedTime: number | null }>
  >([]);
  const cleanupRefs = useRef<Array<() => void>>([]);
  const previousCandlesRef = useRef<Candle[]>([]);
  const lastRenderedHistoryVersionRef = useRef<number | null>(null);
  const lastZoomHistoryVersionRef = useRef<number | null>(null);
  const isMountedRef = useRef(false);
  const isSyncingTimelineRef = useRef(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [rangeNotice, setRangeNotice] = useState<string | null>(null);
  const [markerGuideLines, setMarkerGuideLines] = useState<Array<{ key: string; left: number; color: string }>>([]);
  const [chartInstanceVersion, setChartInstanceVersion] = useState(0);

  const chartCandles = useMemo(() => candles.map(toChartCandle), [candles]);
  const volumePoints = useMemo(() => candles.map(toVolumePoint), [candles]);
  const indicatorLines = useMemo(() => buildIndicatorLines(candles, indicators), [candles, indicators]);
  const resolvedMarkers = useMemo(
    () =>
      markers.map((marker) => ({
        ...marker,
        resolvedTime: resolveMarkerTime(marker.time, candles),
      })),
    [candles, markers],
  );
  const seriesMarkers = useMemo<SeriesMarker<Time>[]>(
    () =>
      resolvedMarkers
        .filter((marker) => marker.resolvedTime !== null)
        .map((marker) => ({
          time: marker.resolvedTime as UTCTimestamp,
          position: "belowBar",
          shape: "arrowUp",
          color: marker.color ?? "#f59e0b",
          text: marker.text,
        })),
    [resolvedMarkers],
  );

  useEffect(() => {
    resolvedMarkersRef.current = resolvedMarkers;
  }, [resolvedMarkers]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setErrorSafely = useCallback((message: string | null) => {
    if (!isMountedRef.current) {
      return;
    }

    setChartError(message);
  }, []);

  const setRangeNoticeSafely = useCallback((message: string | null) => {
    if (!isMountedRef.current) {
      return;
    }

    setRangeNotice(message);
  }, []);

  const syncMarkerGuideLines = useCallback(() => {
    const mainChart = mainChartRef.current;
    const mainContainer = mainContainerRef.current;
    const currentResolvedMarkers = resolvedMarkersRef.current;

    if (!isMountedRef.current) {
      return;
    }

    if (!mainChart || !mainContainer || currentResolvedMarkers.length === 0) {
      setMarkerGuideLines([]);
      return;
    }

    const nextGuideLines = currentResolvedMarkers
      .map((marker, index) => {
        if (marker.resolvedTime === null) {
          return null;
        }

        const coordinate = mainChart.timeScale().timeToCoordinate(marker.resolvedTime as UTCTimestamp);
        const left = coordinate === null ? null : Number(coordinate);

        if (left === null || !Number.isFinite(left)) {
          return null;
        }

        if (left < 0 || left > mainContainer.clientWidth) {
          return null;
        }

        return {
          key: `${marker.resolvedTime}-${marker.price}-${index}`,
          left,
          color: marker.color ?? "#f59e0b",
        };
      })
      .filter((guideLine): guideLine is { key: string; left: number; color: string } => guideLine !== null);

    setMarkerGuideLines(nextGuideLines);
  }, []);

  const applyVisibleWindowSafely = useCallback(() => {
    const mainChart = mainChartRef.current;
    const volumeChart = volumeChartRef.current;

    if (!mainChart || !volumeChart || !candles.length || !isMountedRef.current) {
      return;
    }

    const visibleWindow = getVisibleTimeWindow(candles, timeframe);

    if (!visibleWindow) {
      return;
    }

    try {
      isSyncingTimelineRef.current = true;

      if (visibleWindow === "all") {
        mainChart.timeScale().fitContent();
        volumeChart.timeScale().fitContent();
        setRangeNoticeSafely(null);
        return;
      }

      const from = Number(visibleWindow.from);
      const to = Number(visibleWindow.to);

      if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
        setRangeNoticeSafely("Failed to apply visible range.");
        return;
      }

      const range = {
        from: from as UTCTimestamp,
        to: to as UTCTimestamp,
      };

      mainChart.timeScale().setVisibleRange(range);
      volumeChart.timeScale().setVisibleRange(range);
      syncMarkerGuideLines();
      setRangeNoticeSafely(null);
    } catch (error) {
      console.error("Failed to apply visible range.", error);
      setRangeNoticeSafely("Failed to apply visible range.");
    } finally {
      isSyncingTimelineRef.current = false;
    }
  }, [candles, syncMarkerGuideLines, timeframe, setRangeNoticeSafely]);

  useEffect(() => {
    const mainContainer = mainContainerRef.current;
    const volumeContainer = volumeContainerRef.current;

    if (!mainContainer || !volumeContainer) {
      setErrorSafely("Failed to initialize chart.");
      return;
    }

    try {
      const mainChart = createChart(mainContainer, {
        width: Math.max(mainContainer.clientWidth, 280),
        height: Math.max(mainContainer.clientHeight, 280),
        localization: {
          locale: "en-GB",
          dateFormat: "dd MMM yyyy",
          timeFormatter: (time: Time) => formatCrosshairTime(timeframe, time),
        },
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#8A97A8",
          fontSize: 12,
        },
        grid: {
          vertLines: { color: "rgba(30, 38, 48, 0.7)" },
          horzLines: { color: "rgba(30, 38, 48, 0.7)" },
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: {
            color: "rgba(148, 163, 184, 0.35)",
            labelBackgroundColor: "#121821",
          },
          horzLine: {
            color: "rgba(148, 163, 184, 0.35)",
            labelBackgroundColor: "#121821",
          },
        },
        rightPriceScale: {
          borderColor: "#1E2630",
        },
        timeScale: buildTimeScaleOptions(timeframe),
      });

      const volumeChart = createChart(volumeContainer, {
        width: Math.max(volumeContainer.clientWidth, 280),
        height: Math.max(volumeContainer.clientHeight, 96),
        localization: {
          locale: "en-GB",
          dateFormat: "dd MMM yyyy",
          timeFormatter: (time: Time) => formatCrosshairTime(timeframe, time),
        },
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#8A97A8",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(30, 38, 48, 0.45)" },
          horzLines: { color: "rgba(30, 38, 48, 0.45)" },
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: {
            color: "rgba(148, 163, 184, 0.25)",
            labelBackgroundColor: "#121821",
          },
          horzLine: {
            color: "rgba(148, 163, 184, 0.25)",
            labelBackgroundColor: "#121821",
          },
        },
        rightPriceScale: {
          borderColor: "#1E2630",
          scaleMargins: {
            top: 0.15,
            bottom: 0,
          },
        },
        timeScale: buildTimeScaleOptions(timeframe),
      });

      const candleSeries = mainChart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        priceLineColor: "#4F7CFF",
      });

      const volumeSeries = volumeChart.addSeries(HistogramSeries, {
        priceFormat: {
          type: "volume",
        },
        priceLineVisible: false,
        lastValueVisible: false,
        base: 0,
      });
      const markerPrimitive = createSeriesMarkers(candleSeries, [], {
        zOrder: "aboveSeries",
      });

      const syncLogicalRange = (logicalRange: LogicalRange | null) => {
        if (isSyncingTimelineRef.current || !logicalRange) {
          return;
        }

        const targetChart = volumeChartRef.current;

        if (!targetChart) {
          return;
        }

        const { from, to } = logicalRange;

        if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
          return;
        }

        try {
          isSyncingTimelineRef.current = true;
          targetChart.timeScale().setVisibleLogicalRange({ from, to });
          syncMarkerGuideLines();
        } catch (error) {
          console.error("Failed to sync chart timelines.", error);
          setRangeNoticeSafely("Failed to keep chart timelines aligned.");
        } finally {
          isSyncingTimelineRef.current = false;
        }
      };

      const handleMainLogicalRangeChange = (logicalRange: LogicalRange | null) => {
        syncLogicalRange(logicalRange);
      };

      mainChart.timeScale().subscribeVisibleLogicalRangeChange(handleMainLogicalRangeChange);
      cleanupRefs.current.push(() =>
        mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(handleMainLogicalRangeChange),
      );

      const observeChartSize = (container: HTMLDivElement, chart: IChartApi) => {
        const resizeChart = () => {
          if (!isMountedRef.current) {
            return;
          }

          const width = container.clientWidth;
          const height = container.clientHeight;

          if (width > 0 && height > 0) {
            chart.resize(width, height);
            syncMarkerGuideLines();
          }
        };

        resizeChart();

        if (typeof ResizeObserver !== "undefined") {
          const observer = new ResizeObserver(() => {
            resizeChart();
          });

          observer.observe(container);
          cleanupRefs.current.push(() => observer.disconnect());
        } else {
          window.addEventListener("resize", resizeChart);
          cleanupRefs.current.push(() => window.removeEventListener("resize", resizeChart));
        }
      };

      observeChartSize(mainContainer, mainChart);
      observeChartSize(volumeContainer, volumeChart);

      mainChartRef.current = mainChart;
      volumeChartRef.current = volumeChart;
      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volumeSeries;
      markerPrimitiveRef.current = markerPrimitive;
      setErrorSafely(null);
      setRangeNoticeSafely(null);
      setChartInstanceVersion((current) => current + 1);
    } catch (error) {
      console.error("Failed to initialize candlestick charts.", error);
      setErrorSafely("Failed to initialize chart.");
    }

    return () => {
      cleanupRefs.current.forEach((cleanup) => cleanup());
      cleanupRefs.current = [];
      previousCandlesRef.current = [];
      lastRenderedHistoryVersionRef.current = null;
      lastZoomHistoryVersionRef.current = null;
      indicatorSeriesRefs.current.forEach((series) => {
        if (mainChartRef.current) {
          mainChartRef.current.removeSeries(series);
        }
      });
      indicatorSeriesRefs.current.clear();
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markerPrimitiveRef.current?.detach();
      markerPrimitiveRef.current = null;

      if (mainChartRef.current) {
        mainChartRef.current.remove();
        mainChartRef.current = null;
      }

      if (volumeChartRef.current) {
        volumeChartRef.current.remove();
        volumeChartRef.current = null;
      }
    };
  }, [setErrorSafely, setRangeNoticeSafely, syncMarkerGuideLines, timeframe]);

  useEffect(() => {
    const mainChart = mainChartRef.current;

    if (!mainChart) {
      return;
    }

    const activeIds = new Set(indicatorLines.map((line) => line.id));

    indicatorSeriesRefs.current.forEach((series, id) => {
      if (!activeIds.has(id)) {
        mainChart.removeSeries(series);
        indicatorSeriesRefs.current.delete(id);
      }
    });

    indicatorLines.forEach((line) => {
      let series = indicatorSeriesRefs.current.get(line.id);

      if (!series) {
        series = mainChart.addSeries(LineSeries, {
          color: line.color,
          lineWidth: line.lineWidth,
          lineStyle: line.lineStyle,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        indicatorSeriesRefs.current.set(line.id, series);
      } else {
        series.applyOptions({
          color: line.color,
          lineWidth: line.lineWidth,
          lineStyle: line.lineStyle,
        });
      }

      series.setData(
        line.data.map(
          (point): LineData<UTCTimestamp> => ({
            time: point.time as UTCTimestamp,
            value: point.value,
          }),
        ),
      );
    });
  }, [chartInstanceVersion, indicatorLines]);

  useEffect(() => {
    const mainChart = mainChartRef.current;
    const volumeChart = volumeChartRef.current;

    if (!mainChart || !volumeChart) {
      return;
    }

    mainChart.applyOptions({
      localization: {
        locale: "en-GB",
        dateFormat: "dd MMM yyyy",
        timeFormatter: (time: Time) => formatCrosshairTime(timeframe, time),
      },
      timeScale: buildTimeScaleOptions(timeframe),
    });

    volumeChart.applyOptions({
      localization: {
        locale: "en-GB",
        dateFormat: "dd MMM yyyy",
        timeFormatter: (time: Time) => formatCrosshairTime(timeframe, time),
      },
      timeScale: buildTimeScaleOptions(timeframe),
    });
  }, [timeframe]);

  useEffect(() => {
    const markerPrimitive = markerPrimitiveRef.current;

    if (!markerPrimitive) {
      return;
    }

    try {
      markerPrimitive.setMarkers(seriesMarkers);
      syncMarkerGuideLines();
    } catch (error) {
      console.error("Failed to render buy markers.", error);
    }
  }, [chartInstanceVersion, seriesMarkers, syncMarkerGuideLines]);

  useEffect(() => {
    if (!isMountedRef.current) {
      return;
    }

    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;

    if (!candleSeries || !volumeSeries) {
      return;
    }

    try {
      if (chartCandles.length === 0) {
        candleSeries.setData([]);
        volumeSeries.setData([]);
        previousCandlesRef.current = [];
        return;
      }

      const previousCandles = previousCandlesRef.current;
      const firstPreviousTime = previousCandles[0]?.time;
      const firstCurrentTime = candles[0]?.time;
      const lastPreviousTime = previousCandles[previousCandles.length - 1]?.time;
      const lastCurrentTime = candles[candles.length - 1]?.time;

      const shouldResetSeries =
        historyVersion !== lastRenderedHistoryVersionRef.current ||
        previousCandles.length === 0 ||
        candles.length < previousCandles.length ||
        firstPreviousTime !== firstCurrentTime ||
        (lastPreviousTime !== undefined && lastCurrentTime !== undefined && lastCurrentTime < lastPreviousTime);

      if (shouldResetSeries) {
        candleSeries.setData(chartCandles);
        volumeSeries.setData(volumePoints);
        lastRenderedHistoryVersionRef.current = historyVersion;
      } else {
        const lastCandle = chartCandles[chartCandles.length - 1];
        const lastVolumePoint = volumePoints[volumePoints.length - 1];

        if (lastCandle) {
          candleSeries.update(lastCandle);
        }

        if (lastVolumePoint) {
          volumeSeries.update(lastVolumePoint);
        }
      }

      previousCandlesRef.current = candles;
      setErrorSafely(null);
    } catch (error) {
      console.error("Failed to render candlestick data.", error);
      setErrorSafely("Chart unavailable");
    }
  }, [candles, chartCandles, historyVersion, chartInstanceVersion, setErrorSafely, volumePoints]);

  useEffect(() => {
    if (!isMountedRef.current || !candles.length) {
      return;
    }

    if (!mainChartRef.current || !volumeChartRef.current) {
      return;
    }

    if (lastZoomHistoryVersionRef.current === historyVersion) {
      return;
    }

    applyVisibleWindowSafely();
    lastZoomHistoryVersionRef.current = historyVersion;
  }, [applyVisibleWindowSafely, candles.length, chartInstanceVersion, historyVersion]);

  useEffect(() => {
    syncMarkerGuideLines();
  }, [candles.length, chartInstanceVersion, syncMarkerGuideLines]);

  const overlayMessage =
    chartError ??
    (!candles.length ? errorMessage ?? (loading ? "Loading chart..." : "Waiting for market data...") : null);

  return (
    <div className={cn("relative", compact ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-3")}>
      <div
        className={cn(
          "rounded-[16px] border border-border/80 bg-[#0d131a]",
          compact && "flex min-h-0 flex-[3]",
        )}
      >
        <div className="border-b border-border/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Price
        </div>
        <div className={cn("relative w-full", compact ? "h-full min-h-0" : "h-[280px]")}>
          <div ref={mainContainerRef} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {markerGuideLines.map((guideLine) => (
              <div
                key={guideLine.key}
                className="absolute bottom-0 top-0 w-px opacity-80"
                style={{
                  left: `${guideLine.left}px`,
                  backgroundColor: guideLine.color,
                  boxShadow: "none",
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "rounded-[16px] border border-border/80 bg-[#0d131a]",
          compact && "flex min-h-0 flex-[1.15]",
        )}
      >
        <div className="border-b border-border/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Volume
        </div>
        <div ref={volumeContainerRef} className={cn("w-full", compact ? "h-full min-h-0" : "h-[110px]")} />
      </div>
      {rangeNotice ? <p className="text-xs text-orange-300">{rangeNotice}</p> : null}
      {overlayMessage ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-[16px] bg-[#0b0f14]/88 px-4 text-center text-sm text-slate-300">
          {overlayMessage}
        </div>
      ) : null}
    </div>
  );
};
