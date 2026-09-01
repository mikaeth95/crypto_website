import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MarketFiltersModal, type MarketFilterPreset } from "../components/markets/MarketFiltersModal";
import { MarketSparkline } from "../components/markets/MarketSparkline";
import { Badge } from "../components/ui/badge";
import { ChartPanel } from "../components/ui/chart-panel";
import { Input } from "../components/ui/input";
import { PageHeader } from "../components/ui/page-header";
import { useMarketInstruments } from "../hooks/useMarketInstruments";
import { useMarketSparklineData } from "../hooks/useMarketSparklineData";
import { resolveCoinMarketCapUrlForInstrument } from "../lib/coinmarketcap";
import { formatCompact, formatNumber, formatPercent, signedClass } from "../lib/formatters";
import { cn } from "../lib/utils";
import {
  MARKET_INSTRUMENT_QUOTE_FILTERS,
  formatMarketSymbol,
  type LiveMarketSummary,
  type MarketInstrument,
  type MarketInstrumentQuoteFilter,
} from "../types/market";

type SupportedQuote = Exclude<MarketInstrumentQuoteFilter, "ALL">;
type MarketsSortKey = "instrument" | "lastPrice" | "change24hPct" | "high24h" | "low24h" | "volume24hQuote";
type SortDirection = "asc" | "desc";
type SupportedMarketInstrument = Omit<MarketInstrument, "quoteCurrency"> & {
  quoteCurrency: SupportedQuote;
};
type MarketsDisplayRow = MarketInstrument & {
  summary: LiveMarketSummary | null;
};

const SUPPORTED_QUOTES: SupportedQuote[] = ["EUR", "USD", "USDT"];
const SPOT_INSTRUMENT_TYPE = "CCY_PAIR";
const MARKETS_TABLE_COLUMN_COUNT = 7;
const MARKETS_ROW_HEIGHT_PX = 76;
const MARKETS_ROW_OVERSCAN = 8;
const FILTER_PRESET_VALUES: Record<
  MarketFilterPreset,
  {
    minLastPriceValue: string;
    maxLastPriceValue: string;
    minChange24hValue: string;
    maxChange24hValue: string;
    minVolume24hValue: string;
    maxVolume24hValue: string;
  }
> = {
  BIG_COINS_ONLY: {
    minLastPriceValue: "1",
    maxLastPriceValue: "",
    minChange24hValue: "",
    maxChange24hValue: "",
    minVolume24hValue: "100000",
    maxVolume24hValue: "",
  },
  BIG_AND_MEDIUM_COINS: {
    minLastPriceValue: "0.10",
    maxLastPriceValue: "",
    minChange24hValue: "",
    maxChange24hValue: "",
    minVolume24hValue: "25000",
    maxVolume24hValue: "",
  },
  BIG_AND_MEDIUM_NO_BIG_MEMECOINS: {
    minLastPriceValue: "0.01",
    maxLastPriceValue: "",
    minChange24hValue: "",
    maxChange24hValue: "",
    minVolume24hValue: "10000",
    maxVolume24hValue: "",
  },
};

const tabButtonClassName = (active: boolean) =>
  cn(
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition",
    active
      ? "border-accent/35 bg-accent/10 text-[#c2d1ff]"
      : "border-border/80 bg-panelSoft/70 text-slate-300 hover:border-slate-500/70 hover:bg-[#151c25] hover:text-white",
  );

const isSupportedQuote = (quoteCurrency: string): quoteCurrency is SupportedQuote =>
  SUPPORTED_QUOTES.includes(quoteCurrency as SupportedQuote);

const isSpotMarketInstrument = (instrument: Pick<MarketInstrument, "symbol" | "instrumentType">) => {
  if (instrument.instrumentType) {
    return instrument.instrumentType === SPOT_INSTRUMENT_TYPE;
  }

  return !instrument.symbol.endsWith("_PERP");
};

const resolvePriceFractionDigits = (value: number) => {
  if (value >= 1_000) {
    return 2;
  }

  if (value >= 1) {
    return 4;
  }

  return 6;
};

const formatQuoteValue = (value: number | null | undefined, quoteCurrency: string) => {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return `${formatNumber(value, resolvePriceFractionDigits(value))} ${quoteCurrency}`;
};

const formatVolumeValue = (value: number | null | undefined, quoteCurrency: string) => {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return `${formatCompact(value)} ${quoteCurrency}`;
};

const compareNullableNumbers = (left: number | null | undefined, right: number | null | undefined) => {
  if (left === null || left === undefined) {
    return right === null || right === undefined ? 0 : 1;
  }

  if (right === null || right === undefined) {
    return -1;
  }

  return left - right;
};

const SortIcon = ({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) =>
  active ? (
    direction === "asc" ? (
      <ArrowUp size={14} className="text-sky-300" />
    ) : (
      <ArrowDown size={14} className="text-sky-300" />
    )
  ) : (
    <ArrowUpDown size={14} className="text-slate-500" />
  );

const MarketMoverTile = ({
  row,
  sparklinePoints,
  sparklineLoading,
}: {
  row: MarketsDisplayRow;
  sparklinePoints: Array<{ time: number; value: number }>;
  sparklineLoading: boolean;
}) => (
  <article className="rounded-[16px] border border-border/80 bg-panelSoft/75 p-3">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-100">{formatMarketSymbol(row.symbol)}</p>
        <p className="mt-1 text-[11px] text-slate-500">{row.symbol}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("text-sm font-semibold", signedClass(row.summary?.change24hPct))}>
          {formatPercent(row.summary?.change24hPct)}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {formatQuoteValue(row.summary?.lastPrice, row.quoteCurrency)}
        </p>
      </div>
    </div>

    <MarketSparkline
      points={sparklinePoints}
      positive={
        typeof row.summary?.change24hPct === "number" ? row.summary.change24hPct >= 0 : null
      }
      loading={sparklineLoading}
    />
  </article>
);

export const MarketsPage = ({ updatedAt }: { updatedAt?: string | null }) => {
  const navigate = useNavigate();
  const { instruments, tickerSummaries, loading, summariesLoading, error, summariesError } = useMarketInstruments();
  const [quoteFilter, setQuoteFilter] = useState<MarketInstrumentQuoteFilter>("ALL");
  const [searchValue, setSearchValue] = useState("");
  const [minLastPriceValue, setMinLastPriceValue] = useState("");
  const [maxLastPriceValue, setMaxLastPriceValue] = useState("");
  const [minChange24hValue, setMinChange24hValue] = useState("");
  const [maxChange24hValue, setMaxChange24hValue] = useState("");
  const [minVolume24hValue, setMinVolume24hValue] = useState("");
  const [maxVolume24hValue, setMaxVolume24hValue] = useState("");
  const [marketFilterPreset, setMarketFilterPreset] = useState<MarketFilterPreset | null>(null);
  const [sortKey, setSortKey] = useState<MarketsSortKey>("instrument");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [tableViewportHeight, setTableViewportHeight] = useState(0);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const deferredSearchValue = useDeferredValue(searchValue.trim().toLowerCase());
  const deferredMinLastPriceValue = useDeferredValue(minLastPriceValue.trim());
  const deferredMaxLastPriceValue = useDeferredValue(maxLastPriceValue.trim());
  const deferredMinChange24hValue = useDeferredValue(minChange24hValue.trim());
  const deferredMaxChange24hValue = useDeferredValue(maxChange24hValue.trim());
  const deferredMinVolume24hValue = useDeferredValue(minVolume24hValue.trim());
  const deferredMaxVolume24hValue = useDeferredValue(maxVolume24hValue.trim());

  const applyPreset = (preset: MarketFilterPreset | null) => {
    setMarketFilterPreset(preset);

    if (!preset) {
      setMinLastPriceValue("");
      setMaxLastPriceValue("");
      setMinChange24hValue("");
      setMaxChange24hValue("");
      setMinVolume24hValue("");
      setMaxVolume24hValue("");
      return;
    }

    const values = FILTER_PRESET_VALUES[preset];

    setMinLastPriceValue(values.minLastPriceValue);
    setMaxLastPriceValue(values.maxLastPriceValue);
    setMinChange24hValue(values.minChange24hValue);
    setMaxChange24hValue(values.maxChange24hValue);
    setMinVolume24hValue(values.minVolume24hValue);
    setMaxVolume24hValue(values.maxVolume24hValue);
  };

  const minLastPriceFilter = useMemo(() => {
    if (!deferredMinLastPriceValue) {
      return null;
    }

    const parsedValue = Number(deferredMinLastPriceValue);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }, [deferredMinLastPriceValue]);

  const maxLastPriceFilter = useMemo(() => {
    if (!deferredMaxLastPriceValue) {
      return null;
    }

    const parsedValue = Number(deferredMaxLastPriceValue);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }, [deferredMaxLastPriceValue]);

  const minChange24hFilter = useMemo(() => {
    if (!deferredMinChange24hValue) {
      return null;
    }

    const parsedValue = Number(deferredMinChange24hValue);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }, [deferredMinChange24hValue]);

  const maxChange24hFilter = useMemo(() => {
    if (!deferredMaxChange24hValue) {
      return null;
    }

    const parsedValue = Number(deferredMaxChange24hValue);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }, [deferredMaxChange24hValue]);

  const minVolume24hFilter = useMemo(() => {
    if (!deferredMinVolume24hValue) {
      return null;
    }

    const parsedValue = Number(deferredMinVolume24hValue);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }, [deferredMinVolume24hValue]);

  const maxVolume24hFilter = useMemo(() => {
    if (!deferredMaxVolume24hValue) {
      return null;
    }

    const parsedValue = Number(deferredMaxVolume24hValue);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }, [deferredMaxVolume24hValue]);

  const supportedInstruments = useMemo<SupportedMarketInstrument[]>(
    () =>
      instruments.filter(
        (instrument): instrument is SupportedMarketInstrument =>
          isSupportedQuote(instrument.quoteCurrency) && isSpotMarketInstrument(instrument),
      ),
    [instruments],
  );

  const quoteCounts = useMemo(
    () =>
      supportedInstruments.reduce<Record<MarketInstrumentQuoteFilter, number>>(
        (counts, instrument) => {
          counts.ALL += 1;
          counts[instrument.quoteCurrency] += 1;

          return counts;
        },
        {
          ALL: 0,
          EUR: 0,
          USD: 0,
          USDT: 0,
        },
      ),
    [supportedInstruments],
  );

  const filteredRows = useMemo<MarketsDisplayRow[]>(
    () =>
      supportedInstruments
        .map((instrument) => ({
          ...instrument,
          summary: tickerSummaries[instrument.symbol] ?? null,
        }))
        .filter((instrument) => {
          if (quoteFilter !== "ALL" && instrument.quoteCurrency !== quoteFilter) {
            return false;
          }

          if (deferredSearchValue) {
            const searchHaystack = [
              instrument.symbol,
              formatMarketSymbol(instrument.symbol),
              instrument.baseCurrency,
              instrument.quoteCurrency,
            ]
              .join(" ")
              .toLowerCase();

            if (!searchHaystack.includes(deferredSearchValue)) {
              return false;
            }
          }

          const lastPrice = instrument.summary?.lastPrice;

          if (minLastPriceFilter !== null && (lastPrice === null || lastPrice === undefined || lastPrice < minLastPriceFilter)) {
            return false;
          }

          if (maxLastPriceFilter !== null && (lastPrice === null || lastPrice === undefined || lastPrice > maxLastPriceFilter)) {
            return false;
          }

          const change24hPct = instrument.summary?.change24hPct;

          if (
            minChange24hFilter !== null &&
            (change24hPct === null || change24hPct === undefined || change24hPct < minChange24hFilter)
          ) {
            return false;
          }

          if (
            maxChange24hFilter !== null &&
            (change24hPct === null || change24hPct === undefined || change24hPct > maxChange24hFilter)
          ) {
            return false;
          }

          const volume24hQuote = instrument.summary?.volume24hQuote;

          if (
            minVolume24hFilter !== null &&
            (volume24hQuote === null || volume24hQuote === undefined || volume24hQuote < minVolume24hFilter)
          ) {
            return false;
          }

          if (
            maxVolume24hFilter !== null &&
            (volume24hQuote === null || volume24hQuote === undefined || volume24hQuote > maxVolume24hFilter)
          ) {
            return false;
          }

          return true;
        }),
    [
      deferredSearchValue,
      maxChange24hFilter,
      maxLastPriceFilter,
      maxVolume24hFilter,
      minChange24hFilter,
      minLastPriceFilter,
      minVolume24hFilter,
      quoteFilter,
      supportedInstruments,
      tickerSummaries,
    ],
  );

  const usdMoverRows = useMemo<MarketsDisplayRow[]>(
    () =>
      supportedInstruments
        .filter(
          (instrument) => instrument.quoteCurrency === "USD" && isSpotMarketInstrument(instrument),
        )
        .map((instrument) => ({
          ...instrument,
          summary: tickerSummaries[instrument.symbol] ?? null,
        })),
    [supportedInstruments, tickerSummaries],
  );

  const topGainers = useMemo(
    () =>
      [...usdMoverRows]
        .filter(
          (row) =>
            typeof row.summary?.change24hPct === "number" &&
            row.summary.change24hPct > 0,
        )
        .sort(
          (left, right) =>
            (right.summary?.change24hPct ?? Number.NEGATIVE_INFINITY) -
            (left.summary?.change24hPct ?? Number.NEGATIVE_INFINITY),
        )
        .slice(0, 4),
    [usdMoverRows],
  );

  const topLosers = useMemo(
    () =>
      [...usdMoverRows]
        .filter(
          (row) =>
            typeof row.summary?.change24hPct === "number" &&
            row.summary.change24hPct < 0,
        )
        .sort(
          (left, right) =>
            (left.summary?.change24hPct ?? Number.POSITIVE_INFINITY) -
            (right.summary?.change24hPct ?? Number.POSITIVE_INFINITY),
        )
        .slice(0, 4),
    [usdMoverRows],
  );

  const moverSymbols = useMemo(
    () => Array.from(new Set([...topGainers, ...topLosers].map((row) => row.symbol))),
    [topGainers, topLosers],
  );
  const { sparklineData, loadingBySymbol: sparklineLoadingBySymbol } = useMarketSparklineData(moverSymbols);

  const sortedRows = useMemo(
    () =>
      [...filteredRows].sort((left, right) => {
        let comparison = 0;

        switch (sortKey) {
          case "instrument":
            comparison = formatMarketSymbol(left.symbol).localeCompare(formatMarketSymbol(right.symbol));
            break;
          case "lastPrice":
            comparison = compareNullableNumbers(left.summary?.lastPrice, right.summary?.lastPrice);
            break;
          case "change24hPct":
            comparison = compareNullableNumbers(left.summary?.change24hPct, right.summary?.change24hPct);
            break;
          case "high24h":
            comparison = compareNullableNumbers(left.summary?.high24h, right.summary?.high24h);
            break;
          case "low24h":
            comparison = compareNullableNumbers(left.summary?.low24h, right.summary?.low24h);
            break;
          case "volume24hQuote":
            comparison = compareNullableNumbers(left.summary?.volume24hQuote, right.summary?.volume24hQuote);
            break;
        }

        return sortDirection === "asc" ? comparison : comparison * -1;
      }),
    [filteredRows, sortDirection, sortKey],
  );

  const visibleRowMetrics = useMemo(() => {
    if (loading) {
      return {
        startIndex: 0,
        endIndex: 0,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      };
    }

    const viewportHeight =
      tableViewportHeight > 0 ? tableViewportHeight : MARKETS_ROW_HEIGHT_PX * 10;
    const visibleRowCount = Math.ceil(viewportHeight / MARKETS_ROW_HEIGHT_PX);
    const startIndex = Math.max(
      0,
      Math.floor(tableScrollTop / MARKETS_ROW_HEIGHT_PX) - MARKETS_ROW_OVERSCAN,
    );
    const endIndex = Math.min(
      sortedRows.length,
      startIndex + visibleRowCount + MARKETS_ROW_OVERSCAN * 2,
    );

    return {
      startIndex,
      endIndex,
      topSpacerHeight: startIndex * MARKETS_ROW_HEIGHT_PX,
      bottomSpacerHeight: Math.max(0, (sortedRows.length - endIndex) * MARKETS_ROW_HEIGHT_PX),
    };
  }, [loading, sortedRows.length, tableScrollTop, tableViewportHeight]);

  const visibleRows = useMemo(
    () => sortedRows.slice(visibleRowMetrics.startIndex, visibleRowMetrics.endIndex),
    [sortedRows, visibleRowMetrics.endIndex, visibleRowMetrics.startIndex],
  );

  useEffect(() => {
    const container = tableScrollRef.current;

    if (!container) {
      return;
    }

    const updateMetrics = () => {
      setTableViewportHeight(container.clientHeight);
      setTableScrollTop(container.scrollTop);
    };

    updateMetrics();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            updateMetrics();
          })
        : null;

    resizeObserver?.observe(container);
    window.addEventListener("resize", updateMetrics);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, []);

  useEffect(() => {
    const container = tableScrollRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = 0;
    setTableScrollTop(0);
  }, [
    deferredSearchValue,
    maxChange24hFilter,
    maxLastPriceFilter,
    maxVolume24hFilter,
    minChange24hFilter,
    minLastPriceFilter,
    minVolume24hFilter,
    quoteFilter,
  ]);

  const toggleSort = (nextSortKey: MarketsSortKey) => {
    if (nextSortKey === sortKey) {
      setSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "instrument" ? "asc" : "desc");
  };

  const openInstrumentChart = (symbol: string) => {
    navigate(`/live-charts/markets/${encodeURIComponent(symbol)}`);
  };

  const activeFilterCount =
    (minLastPriceValue.trim() ? 1 : 0) +
    (maxLastPriceValue.trim() ? 1 : 0) +
    (minChange24hValue.trim() ? 1 : 0) +
    (maxChange24hValue.trim() ? 1 : 0) +
    (minVolume24hValue.trim() ? 1 : 0) +
    (maxVolume24hValue.trim() ? 1 : 0);

  const renderSummaryCell = (
    value: string,
    secondaryValue?: string,
    valueClassName?: string,
  ) => {
    if (summariesLoading) {
      return <div className="ml-auto h-4 w-20 animate-pulse rounded bg-[#1a2230]" />;
    }

    return (
      <div className="text-right">
        <p className={cn("font-medium tabular text-slate-100", valueClassName)}>{value}</p>
        {secondaryValue ? <p className="mt-0.5 text-[11px] text-slate-500">{secondaryValue}</p> : null}
      </div>
    );
  };

  const headerButtonClassName = "inline-flex items-center gap-1.5 font-semibold transition hover:text-slate-100";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Markets"
        description="Browse Crypto.com Exchange spot markets and scan price action across EUR, USD, and USDT pairs."
        updatedAt={updatedAt}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{supportedInstruments.length} Markets</Badge>
            <Badge tone="default">{quoteFilter === "ALL" ? "All Quotes" : quoteFilter}</Badge>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel
          title="Top 24H Gainers"
          subtitle="Best USD-quoted spot performers across the exchange"
          action={
            topGainers[0] ? (
              <Badge tone="green">
                {formatMarketSymbol(topGainers[0].symbol)} {formatPercent(topGainers[0].summary?.change24hPct)}
              </Badge>
            ) : null
          }
          bodyClassName="p-5"
        >
          {topGainers.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {topGainers.map((row) => (
                <MarketMoverTile
                  key={row.symbol}
                  row={row}
                  sparklinePoints={sparklineData[row.symbol] ?? []}
                  sparklineLoading={Boolean(sparklineLoadingBySymbol[row.symbol])}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-border/80 bg-panelSoft/65 px-4 py-6 text-sm text-slate-400">
              No positive 24H movers matched the current filters.
            </div>
          )}
        </ChartPanel>

        <ChartPanel
          title="Top 24H Losers"
          subtitle="Weakest USD-quoted spot performers across the exchange"
          action={
            topLosers[0] ? (
              <Badge tone="red">
                {formatMarketSymbol(topLosers[0].symbol)} {formatPercent(topLosers[0].summary?.change24hPct)}
              </Badge>
            ) : null
          }
          bodyClassName="p-5"
        >
          {topLosers.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {topLosers.map((row) => (
                <MarketMoverTile
                  key={row.symbol}
                  row={row}
                  sparklinePoints={sparklineData[row.symbol] ?? []}
                  sparklineLoading={Boolean(sparklineLoadingBySymbol[row.symbol])}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-border/80 bg-panelSoft/65 px-4 py-6 text-sm text-slate-400">
              No negative 24H movers matched the current filters.
            </div>
          )}
        </ChartPanel>
      </div>

      <section className="space-y-4 rounded-[18px] border border-border/90 bg-panel px-4 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.28)] md:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <p className="terminal-label text-[#9ab1ff]">Exchange Markets</p>
            <div className="flex flex-wrap gap-2">
              {MARKET_INSTRUMENT_QUOTE_FILTERS.map((filterId) => (
                <button
                  key={filterId}
                  type="button"
                  className={tabButtonClassName(quoteFilter === filterId)}
                  onClick={() => setQuoteFilter(filterId)}
                >
                  <span>{filterId === "ALL" ? "All" : filterId}</span>
                  <span className="text-xs text-inherit/75">{quoteCounts[filterId]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid w-full gap-3 md:grid-cols-[minmax(0,1fr)_auto] xl:max-w-2xl">
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search instrument, base, or quote..."
            />

            <button
              type="button"
              className="button-surface h-10 justify-center px-3"
              onClick={() => setIsFilterModalOpen(true)}
              aria-label="Open market filters"
              aria-haspopup="dialog"
              aria-expanded={isFilterModalOpen}
            >
              <Filter size={14} />
              {activeFilterCount > 0 ? <span className="tabular text-xs text-slate-300">{activeFilterCount}</span> : null}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-rose-400/20 bg-rose-950/40 p-4">
          <p className="text-sm font-medium text-rose-200">Markets load error</p>
          <p className="mt-1 text-sm text-rose-100">{error}</p>
        </section>
      ) : null}

      {summariesError ? (
        <section className="rounded-2xl border border-orange-400/20 bg-orange-950/40 p-4">
          <p className="text-sm font-medium text-orange-200">Market stats unavailable</p>
          <p className="mt-1 text-sm text-orange-100">{summariesError}</p>
        </section>
      ) : null}

      <div
        ref={tableScrollRef}
        className="max-h-[70vh] overflow-auto rounded-[18px] border border-border/90 bg-panel shadow-[0_14px_34px_rgba(0,0,0,0.28)]"
        onScroll={(event) => setTableScrollTop(event.currentTarget.scrollTop)}
      >
        <table className="min-w-[1120px] w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border/80 bg-[#121821] text-left text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">
                <button type="button" className={headerButtonClassName} onClick={() => toggleSort("instrument")}>
                  Instrument
                  <SortIcon active={sortKey === "instrument"} direction={sortDirection} />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button type="button" className={cn(headerButtonClassName, "ml-auto")} onClick={() => toggleSort("lastPrice")}>
                  Last Price
                  <SortIcon active={sortKey === "lastPrice"} direction={sortDirection} />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button type="button" className={cn(headerButtonClassName, "ml-auto")} onClick={() => toggleSort("change24hPct")}>
                  24H Change
                  <SortIcon active={sortKey === "change24hPct"} direction={sortDirection} />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button type="button" className={cn(headerButtonClassName, "ml-auto")} onClick={() => toggleSort("high24h")}>
                  24H High
                  <SortIcon active={sortKey === "high24h"} direction={sortDirection} />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button type="button" className={cn(headerButtonClassName, "ml-auto")} onClick={() => toggleSort("low24h")}>
                  24H Low
                  <SortIcon active={sortKey === "low24h"} direction={sortDirection} />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button type="button" className={cn(headerButtonClassName, "ml-auto")} onClick={() => toggleSort("volume24hQuote")}>
                  24H Volume
                  <SortIcon active={sortKey === "volume24hQuote"} direction={sortDirection} />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">CMC Link</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 12 }, (_, index) => (
                  <tr key={`loading-${index}`} className="border-b border-slate-800/60">
                    <td className="px-4 py-4">
                      <div className="h-4 w-32 animate-pulse rounded bg-[#1a2230]" />
                      <div className="mt-2 h-3 w-24 animate-pulse rounded bg-[#131922]" />
                    </td>
                    {Array.from({ length: 6 }, (__unused, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-4">
                        <div className="ml-auto h-4 w-20 animate-pulse rounded bg-[#1a2230]" />
                      </td>
                    ))}
                  </tr>
                ))
              : (
                  <>
                    {visibleRowMetrics.topSpacerHeight > 0 ? (
                      <tr aria-hidden="true">
                        <td
                          colSpan={MARKETS_TABLE_COLUMN_COUNT}
                          className="border-b border-slate-800/60 p-0"
                          style={{ height: `${visibleRowMetrics.topSpacerHeight}px` }}
                        />
                      </tr>
                    ) : null}

                    {visibleRows.map((instrument, visibleIndex) => {
                      const rowIndex = visibleRowMetrics.startIndex + visibleIndex;
                      const cmcUrl = resolveCoinMarketCapUrlForInstrument(instrument.symbol);

                      return (
                        <tr
                          key={instrument.symbol}
                          className={cn(
                            "cursor-pointer border-b border-border/70 transition hover:bg-[#151c25]",
                            rowIndex % 2 === 0 ? "bg-panelSoft/35" : "bg-transparent",
                          )}
                          onClick={() => openInstrumentChart(instrument.symbol)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openInstrumentChart(instrument.symbol);
                            }
                          }}
                          role="link"
                          tabIndex={0}
                          aria-label={`Open live chart for ${formatMarketSymbol(instrument.symbol)}`}
                        >
                          <td className="px-4 py-4">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-100">{formatMarketSymbol(instrument.symbol)}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                <span>{instrument.symbol}</span>
                                <span className="h-1 w-1 rounded-full bg-slate-700" />
                                <span>Base {instrument.baseCurrency}</span>
                                <span className="h-1 w-1 rounded-full bg-slate-700" />
                                <span>Quote {instrument.quoteCurrency}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {renderSummaryCell(
                              formatQuoteValue(instrument.summary?.lastPrice, instrument.quoteCurrency),
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {renderSummaryCell(
                              formatPercent(instrument.summary?.change24hPct),
                              undefined,
                              signedClass(instrument.summary?.change24hPct),
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {renderSummaryCell(
                              formatQuoteValue(instrument.summary?.high24h, instrument.quoteCurrency),
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {renderSummaryCell(
                              formatQuoteValue(instrument.summary?.low24h, instrument.quoteCurrency),
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {renderSummaryCell(
                              formatVolumeValue(instrument.summary?.volume24hQuote, instrument.quoteCurrency),
                              instrument.summary?.volume24hBase !== null &&
                                instrument.summary?.volume24hBase !== undefined
                                ? `${formatCompact(instrument.summary.volume24hBase)} ${instrument.baseCurrency}`
                                : undefined,
                            )}
                          </td>
                          <td className="px-4 py-4 text-right">
                            {cmcUrl ? (
                              <a
                                href={cmcUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-md border border-border/80 bg-panelSoft/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-200 transition hover:border-slate-500/70 hover:bg-[#151c25] hover:text-white"
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                                aria-label={`Open ${instrument.baseCurrency} on CoinMarketCap`}
                              >
                                CMC
                              </a>
                            ) : (
                              <span className="text-xs text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {visibleRowMetrics.bottomSpacerHeight > 0 ? (
                      <tr aria-hidden="true">
                        <td
                          colSpan={MARKETS_TABLE_COLUMN_COUNT}
                          className="p-0"
                          style={{ height: `${visibleRowMetrics.bottomSpacerHeight}px` }}
                        />
                      </tr>
                    ) : null}
                  </>
                )}
          </tbody>
        </table>

        {!loading && !sortedRows.length ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            No markets matched the current filters.
          </div>
        ) : null}
      </div>

      <MarketFiltersModal
        open={isFilterModalOpen}
        activeFilterCount={activeFilterCount}
        selectedPreset={marketFilterPreset}
        minLastPriceValue={minLastPriceValue}
        maxLastPriceValue={maxLastPriceValue}
        minChange24hValue={minChange24hValue}
        maxChange24hValue={maxChange24hValue}
        minVolume24hValue={minVolume24hValue}
        maxVolume24hValue={maxVolume24hValue}
        onPresetChange={applyPreset}
        onClose={() => setIsFilterModalOpen(false)}
        onMinLastPriceChange={setMinLastPriceValue}
        onMaxLastPriceChange={setMaxLastPriceValue}
        onMinChange24hChange={setMinChange24hValue}
        onMaxChange24hChange={setMaxChange24hValue}
        onMinVolume24hChange={setMinVolume24hValue}
        onMaxVolume24hChange={setMaxVolume24hValue}
      />
    </div>
  );
};
