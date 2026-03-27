import { useMemo } from "react";
import { AllocationChart } from "../components/dashboard/AllocationChart";
import { RecentTransactions } from "../components/dashboard/RecentTransactions";
import { SummaryCards } from "../components/dashboard/SummaryCards";
import { TopMovers } from "../components/dashboard/TopMovers";
import { Card } from "../components/ui/card";
import { PageHeader } from "../components/ui/page-header";
import { SectionHeader } from "../components/ui/section-header";
import { Badge } from "../components/ui/badge";
import { usePortfolioLiveData } from "../hooks/usePortfolioLiveData";
import { dashboardDerived, deriveDashboardSummary } from "../lib/calculations";
import type { WorkbookData } from "../types/portfolio";

export const DashboardPage = ({ data }: { data: WorkbookData }) => {
  const { rows } = usePortfolioLiveData(data.assets);
  const summary = useMemo(() => deriveDashboardSummary(rows), [rows]);
  const composition = useMemo(() => dashboardDerived(rows, data.transactions), [rows, data.transactions]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview Dashboard"
        description="Portfolio health, allocation, movers, and latest trading activity."
        action={<Badge tone="blue">{composition.assetsHeld} Active Assets</Badge>}
      />
      <SummaryCards summary={summary} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AllocationChart assets={rows} />
        </div>
        <Card className="space-y-4 overflow-hidden p-0 text-sm">
          <div className="px-5 py-4">
            <SectionHeader
              title="Portfolio Composition"
              description="Internal position breadth and concentration overview."
              className="mb-0"
            />
          </div>
          <div className="space-y-2 px-5 pb-5">
            <p className="flex items-center justify-between rounded-lg border border-border/70 bg-panelSoft/65 px-3 py-2.5">
              <span className="text-slate-400">Active assets</span>
              <span className="tabular font-medium text-slate-100">{composition.assetsHeld}</span>
            </p>
            <p className="flex items-center justify-between rounded-lg border border-border/70 bg-panelSoft/65 px-3 py-2.5">
              <span className="text-slate-400">Total transactions</span>
              <span className="tabular font-medium text-slate-100">{composition.txCount}</span>
            </p>
            <p className="flex items-center justify-between rounded-lg border border-border/70 bg-panelSoft/65 px-3 py-2.5">
              <span className="text-slate-400">Profitable assets</span>
              <span className="tabular font-medium text-emerald-300">{composition.profitableAssets}</span>
            </p>
            <p className="flex items-center justify-between rounded-lg border border-border/70 bg-panelSoft/65 px-3 py-2.5">
              <span className="text-slate-400">Losing assets</span>
              <span className="tabular font-medium text-rose-300">{composition.losingAssets}</span>
            </p>
            <p className="flex items-center justify-between rounded-lg border border-border/70 bg-panelSoft/65 px-3 py-2.5">
              <span className="text-slate-400">Largest position</span>
              <span className="tabular font-medium text-slate-100">{composition.largestPosition ?? "n/a"}</span>
            </p>
          </div>
        </Card>
      </div>
      <TopMovers assets={rows} />
      <RecentTransactions transactions={data.transactions} />
    </div>
  );
};
