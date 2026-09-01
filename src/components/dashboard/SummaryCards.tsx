import { CircleDollarSign, Landmark, TrendingDown, TrendingUp } from "lucide-react";
import { formatPercent, signedClass } from "../../lib/formatters";
import type { DashboardMetricSummary, DashboardSummary } from "../../lib/calculations";
import { KpiCard } from "../ui/kpi-card";

const formatMoneyWithSymbol = (value: number | null | undefined, currency: "EUR" | "USD") => {
  if (value === null || value === undefined) {
    return "n/a";
  }

  const symbol = currency === "EUR" ? "€" : "$";

  return `${symbol} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatCombinedTotals = (metric: DashboardMetricSummary) =>
  `${formatMoneyWithSymbol(metric.combinedEUR, "EUR")} / ${formatMoneyWithSymbol(metric.combinedUSD, "USD")}`;

const formatQuoteBreakdown = (metric: DashboardMetricSummary) =>
  `${formatMoneyWithSymbol(metric.quoteEUR, "EUR")} / ${formatMoneyWithSymbol(metric.quoteUSD, "USD")}`;

export const SummaryCards = ({ summary }: { summary: DashboardSummary }) => {
  const profitPositive = (summary.profit.combinedEUR ?? 0) >= 0;
  const perfPositive = (summary.performance.combined ?? 0) >= 0;
  const profitValueClassName = signedClass(summary.profit.combinedEUR);
  const performanceValueClassName = signedClass(summary.performance.combined);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        index={0}
        label="Total Portfolio"
        value={formatCombinedTotals(summary.portfolio)}
        subValue={formatQuoteBreakdown(summary.portfolio)}
        trendLabel="Consolidated Value"
        trendTone="blue"
        sparkline={[6, 7, 6.8, 7.1, 7.4, 7.3, 7.5, 7.9]}
        icon={<CircleDollarSign size={16} className="text-sky-300" />}
      />
      <KpiCard
        index={1}
        label="Total Invested"
        value={formatCombinedTotals(summary.invested)}
        subValue={formatQuoteBreakdown(summary.invested)}
        trendLabel="Cost Basis"
        trendTone="orange"
        sparkline={[4.8, 5, 5.15, 5.2, 5.3, 5.4, 5.42, 5.5]}
        icon={<Landmark size={16} className="text-orange-300" />}
      />
      <KpiCard
        index={2}
        label="Total Profit"
        value={formatCombinedTotals(summary.profit)}
        subValue={formatQuoteBreakdown(summary.profit)}
        valueClassName={profitValueClassName}
        subValueClassName={profitValueClassName}
        trendLabel={profitPositive ? "Unrealized Gain" : "Unrealized Drawdown"}
        trendTone={profitPositive ? "green" : "red"}
        sparkline={profitPositive ? [1, 1.2, 1.15, 1.3, 1.4, 1.55, 1.7, 1.8] : [2, 1.8, 1.7, 1.55, 1.35, 1.2, 1.15, 1]}
        icon={
          profitPositive ? (
            <TrendingUp size={16} className="text-emerald-300" />
          ) : (
            <TrendingDown size={16} className="text-rose-300" />
          )
        }
      />
      <KpiCard
        index={3}
        label="Performance"
        value={formatPercent((summary.performance.combined ?? 0) * 100)}
        subValue={`${formatPercent((summary.performance.eur ?? 0) * 100)} / ${formatPercent((summary.performance.usd ?? 0) * 100)}`}
        valueClassName={performanceValueClassName}
        subValueClassName={performanceValueClassName}
        trendLabel={perfPositive ? "Positive Momentum" : "Negative Momentum"}
        trendTone={perfPositive ? "green" : "red"}
        sparkline={perfPositive ? [10, 10.8, 11.1, 11.6, 11.9, 12.5, 12.8, 13.3] : [13, 12.6, 12.4, 11.8, 11.2, 10.8, 10.4, 9.9]}
        icon={perfPositive ? <TrendingUp size={16} className="text-emerald-300" /> : <TrendingDown size={16} className="text-rose-300" />}
      />
    </div>
  );
};
