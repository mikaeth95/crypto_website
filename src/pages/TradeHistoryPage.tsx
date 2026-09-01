import { useMemo, useState } from "react";
import { CircleDollarSign, ListChecks, Percent, TrendingUp } from "lucide-react";
import { ClosedTradesTable, OpenLotsTable } from "../components/trade-history/TradeHistoryTables";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { KpiCard } from "../components/ui/kpi-card";
import { PageHeader } from "../components/ui/page-header";
import { usePortfolioLiveData } from "../hooks/usePortfolioLiveData";
import { calculateTradeHistory } from "../lib/tradeHistory";
import type { WorkbookData } from "../types/portfolio";

type ActiveTab = "closed" | "open";
type ResultFilter = "all" | "profit" | "loss" | "break-even";

const controlClassName = "control-surface min-w-36";

const formatMoneyTotals = (values: Array<{ quote: string; value: number }>) => {
  const totals = values.reduce<Record<string, number>>((result, item) => {
    result[item.quote] = (result[item.quote] ?? 0) + item.value;
    return result;
  }, {});
  const orderedQuotes = ["EUR", "USD", ...Object.keys(totals).filter((quote) => quote !== "EUR" && quote !== "USD")];
  const formatted = orderedQuotes
    .filter((quote, index, quotes) => quotes.indexOf(quote) === index && totals[quote] !== undefined)
    .map(
      (quote) =>
        `${totals[quote].toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ${quote}`,
    );

  return formatted.length ? formatted.join(" / ") : "n/a";
};

const matchesPeriod = (date: string, period: string) => {
  if (period === "all") {
    return true;
  }

  const timestamp = new Date(`${date}T00:00:00`).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const now = new Date();

  if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    return timestamp >= now.getTime() - days * 86_400_000;
  }

  if (period === "year") {
    return new Date(timestamp).getFullYear() === now.getFullYear();
  }

  return new Date(timestamp).getFullYear().toString() === period;
};

export const TradeHistoryPage = ({ data }: { data: WorkbookData }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("closed");
  const [assetFilter, setAssetFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const { rows: livePortfolioAssets } = usePortfolioLiveData(data.assets);
  const history = useMemo(
    () => calculateTradeHistory(data.transactions, livePortfolioAssets),
    [data.transactions, livePortfolioAssets],
  );
  const assets = useMemo(
    () =>
      Array.from(new Set([...history.closedTrades, ...history.openLots].map((row) => row.asset))).sort(),
    [history],
  );
  const years = useMemo(
    () =>
      Array.from(
        new Set(
          [...history.closedTrades.map((row) => row.sellDate), ...history.openLots.map((row) => row.buyDate)]
            .map((date) => date.slice(0, 4))
            .filter(Boolean),
        ),
      ).sort((left, right) => right.localeCompare(left)),
    [history],
  );
  const filteredClosedTrades = useMemo(
    () =>
      history.closedTrades.filter((trade) => {
        const matchesAsset = assetFilter === "all" || trade.asset === assetFilter;
        const matchesResult =
          resultFilter === "all" ||
          (resultFilter === "profit" && trade.realizedPnl > 0) ||
          (resultFilter === "loss" && trade.realizedPnl < 0) ||
          (resultFilter === "break-even" && trade.realizedPnl === 0);
        return matchesAsset && matchesResult && matchesPeriod(trade.sellDate, periodFilter);
      }),
    [assetFilter, history.closedTrades, periodFilter, resultFilter],
  );
  const filteredOpenLots = useMemo(
    () =>
      history.openLots.filter((lot) => {
        const matchesAsset = assetFilter === "all" || lot.asset === assetFilter;
        const matchesResult =
          resultFilter === "all" ||
          (resultFilter === "profit" && (lot.unrealizedPnl ?? 0) > 0) ||
          (resultFilter === "loss" && (lot.unrealizedPnl ?? 0) < 0) ||
          (resultFilter === "break-even" && lot.unrealizedPnl === 0);
        return matchesAsset && matchesResult && matchesPeriod(lot.buyDate, periodFilter);
      }),
    [assetFilter, history.openLots, periodFilter, resultFilter],
  );
  const allMatches = history.closedTrades.flatMap((trade) => trade.matches);
  const winningMatches = allMatches.filter((match) => match.realizedPnl > 0).length;
  const losingMatches = allMatches.filter((match) => match.realizedPnl < 0).length;
  const winRate = allMatches.length ? (winningMatches / allMatches.length) * 100 : null;
  const realizedPnl = formatMoneyTotals(
    history.closedTrades.map((trade) => ({ quote: trade.quote, value: trade.realizedPnl })),
  );
  const totalProceeds = formatMoneyTotals(
    history.closedTrades.map((trade) => ({ quote: trade.quote, value: trade.netProceeds })),
  );
  const hasRealizedProfit = history.closedTrades.some((trade) => trade.realizedPnl > 0);
  const hasRealizedLoss = history.closedTrades.some((trade) => trade.realizedPnl < 0);
  const realizedValueClassName =
    hasRealizedProfit && !hasRealizedLoss ? "text-pos" : hasRealizedLoss && !hasRealizedProfit ? "text-neg" : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trade History"
        description="Realized performance and completed trades calculated using FIFO. Fees are included in cost basis and net proceeds."
        action={<Badge tone="blue">{history.closedTrades.length} Closed Trades</Badge>}
        updatedAt={data.loadedAt}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label="Realized P&L"
          value={realizedPnl}
          valueClassName={realizedValueClassName}
          subValue="All completed sales"
          trendLabel="FIFO realized"
          trendTone="blue"
          icon={<TrendingUp size={16} className="text-emerald-300" />}
          variant="primary"
        />
        <KpiCard
          index={1}
          label="Total Proceeds"
          value={totalProceeds}
          subValue="Net of sell fees"
          trendLabel="All time"
          icon={<CircleDollarSign size={16} className="text-sky-300" />}
        />
        <KpiCard
          index={2}
          label="Closed Trades"
          value={history.closedTrades.length.toLocaleString("en-US")}
          subValue={`${allMatches.length} FIFO matches`}
          trendLabel={`${winningMatches} profitable / ${losingMatches} loss`}
          trendTone="orange"
          icon={<ListChecks size={16} className="text-orange-300" />}
        />
        <KpiCard
          index={3}
          label="Win Rate"
          value={winRate === null ? "n/a" : `${winRate.toFixed(1)}%`}
          subValue={`${winningMatches}W / ${losingMatches}L`}
          trendLabel="FIFO matches"
          trendTone={winRate === null ? "default" : winRate >= 50 ? "green" : "red"}
          icon={<Percent size={16} className="text-violet-300" />}
        />
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("closed")}
              className={activeTab === "closed" ? "button-primary" : "button-surface"}
            >
              Closed Trades
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("open")}
              className={activeTab === "open" ? "button-primary" : "button-surface"}
            >
              Open Lots
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {activeTab === "closed"
              ? `${filteredClosedTrades.length} sales after filters`
              : `${filteredOpenLots.length} remaining FIFO lots`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)} className={controlClassName}>
            <option value="all">All Assets</option>
            {assets.map((asset) => (
              <option key={asset} value={asset}>{asset}</option>
            ))}
          </select>
          <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} className={controlClassName}>
            <option value="all">All Time</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="year">This Year</option>
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <select
            value={resultFilter}
            onChange={(event) => setResultFilter(event.target.value as ResultFilter)}
            className={controlClassName}
          >
            <option value="all">All Results</option>
            <option value="profit">Profit</option>
            <option value="loss">Loss</option>
            <option value="break-even">Break Even</option>
          </select>
        </div>

        {activeTab === "closed" ? (
          <ClosedTradesTable rows={filteredClosedTrades} />
        ) : (
          <OpenLotsTable rows={filteredOpenLots} />
        )}
      </Card>
    </div>
  );
};
