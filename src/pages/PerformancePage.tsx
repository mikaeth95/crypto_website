import { PerformanceCharts } from "../components/performance/PerformanceCharts";
import { PerformanceTable } from "../components/performance/PerformanceTable";
import { Badge } from "../components/ui/badge";
import { PageHeader } from "../components/ui/page-header";
import { usePerformanceMarketData } from "../hooks/usePerformanceMarketData";
import type { WorkbookData } from "../types/portfolio";

export const PerformancePage = ({ data }: { data: WorkbookData }) => {
  const { rows } = usePerformanceMarketData(data.performance, data.assets);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coin Performance"
        description="Momentum, drawdown, and volatility analytics across tracked coins."
        action={<Badge tone="blue">{rows.length} Assets</Badge>}
      />
      <PerformanceCharts rows={rows} />
      <PerformanceTable rows={rows} assets={data.assets} transactions={data.transactions} />
    </div>
  );
};
