import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "../ui/data-table";
import { formatCurrency, formatNumber, formatPercent, signedClass } from "../../lib/formatters";
import type { PortfolioDisplayRow } from "../../hooks/usePortfolioLiveData";
import type { CoinPerformanceRow, TransactionRow } from "../../types/portfolio";
import { AssetDetailDrawer } from "./AssetDetailDrawer";
import { Card } from "../ui/card";
import { PageHeader } from "../ui/page-header";
import { Badge } from "../ui/badge";

const formatQuoteCurrency = (value: number | null | undefined, quote: string | null | undefined) => {
  if (!quote || value === null || value === undefined) {
    return "n/a";
  }

  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${quote}`;
};

export const PortfolioTable = ({
  rows,
  performance,
  transactions,
}: {
  rows: PortfolioDisplayRow[];
  performance: CoinPerformanceRow[];
  transactions: TransactionRow[];
}) => {
  const [selected, setSelected] = useState<PortfolioDisplayRow | null>(null);

  const columns = useMemo<ColumnDef<PortfolioDisplayRow>[]>(
    () => [
      {
        accessorKey: "asset",
        header: "Asset",
        cell: (info) => <span className="font-medium text-slate-100">{info.getValue<string>()}</span>,
      },
      { accessorKey: "quote", header: "Quote" },
      {
        accessorKey: "bestand",
        header: "Balance",
        cell: (info) => formatNumber(info.getValue<number>(), 6),
      },
      {
        accessorKey: "avgBuyPrice",
        header: "Avg Buy",
        cell: (info) => formatCurrency(info.getValue<number>(), info.row.original.quote as "EUR" | "USD"),
      },
      {
        accessorKey: "currentPrice",
        header: "Current",
        cell: (info) => formatCurrency(info.getValue<number>(), info.row.original.quote as "EUR" | "USD"),
      },
      {
        accessorKey: "currentValue",
        header: "Current Value",
        cell: (info) => formatCurrency(info.getValue<number>(), info.row.original.quote as "EUR" | "USD"),
      },
      {
        accessorKey: "unrealizedProfit",
        header: "Unrealized PnL",
        cell: (info) => (
          <span className={signedClass(info.getValue<number>())}>
            {formatQuoteCurrency(info.getValue<number>(), info.row.original.quote)}
          </span>
        ),
      },
      {
        accessorKey: "unrealizedProfitPct",
        header: "Unrealized PnL %",
        cell: (info) => (
          <span className={signedClass(info.getValue<number>())}>
            {formatPercent(info.getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "portfolioPct",
        header: "Portfolio %",
        cell: (info) => formatPercent(info.getValue<number>()),
      },
      { accessorKey: "trades", header: "Trades" },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Portfolio"
        description="Holdings, valuation, and unrealized performance by asset."
        action={<Badge tone="blue">{rows.length} Assets</Badge>}
      />
      <Card>
        <p className="text-sm leading-6 text-slate-400">
          Click a row to open a full asset detail panel with key stats and related transactions.
        </p>
      </Card>
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search asset..."
        className="tabular"
        onRowClick={(row) => setSelected(row)}
      />
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
        {rows.map((r) => (
          <button
            key={r.asset}
            onClick={() => setSelected(r)}
            className="rounded-lg border border-border/70 bg-panelSoft/65 px-3 py-1.5 text-slate-300 transition hover:border-slate-500/70 hover:bg-[#151c25] hover:text-slate-100"
          >
            {r.asset}
          </button>
        ))}
      </div>
      {selected ? (
        <AssetDetailDrawer
          asset={selected}
          performance={performance.find((p) => p.asset === selected.asset)}
          transactions={transactions.filter((t) => t.asset === selected.asset)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
};
