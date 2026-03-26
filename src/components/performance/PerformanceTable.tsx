import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { formatCompact, formatNumber, formatPercent, signedClass } from "../../lib/formatters";
import type { PerformanceDisplayRow } from "../../hooks/usePerformanceMarketData";
import type { PortfolioAssetRow, TransactionRow } from "../../types/portfolio";
import { DataTable } from "../ui/data-table";
import { AssetDetailDrawer } from "../portfolio/AssetDetailDrawer";

const pctCell = (v: number | null | undefined) => (
  <span className={signedClass(v)}>{formatPercent(v)}</span>
);

const formatQuoteValue = (value: number | null | undefined, quote: string, maxFractionDigits: number = 6) => {
  if (value === null || value === undefined) {
    return "n/a";
  }

  if (quote === "USD" || quote === "EUR") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: quote,
      minimumFractionDigits: 2,
      maximumFractionDigits: maxFractionDigits,
    }).format(value);
  }

  return `${formatNumber(value, maxFractionDigits)} ${quote}`;
};

export const PerformanceTable = ({
  rows,
  assets,
  transactions,
}: {
  rows: PerformanceDisplayRow[];
  assets: PortfolioAssetRow[];
  transactions: TransactionRow[];
}) => {
  const [selected, setSelected] = useState<PerformanceDisplayRow | null>(null);
  const assetLookup = useMemo(
    () =>
      new Map(
        assets.map((asset) => [`${asset.asset.toUpperCase()}__${asset.quote.toUpperCase()}`, asset]),
      ),
    [assets],
  );

  const columns = useMemo<ColumnDef<PerformanceDisplayRow>[]>(
    () => [
      {
        accessorKey: "asset",
        header: "Asset",
        cell: (i) => <span className="font-medium text-slate-100">{i.getValue<string>()}</span>,
      },
      {
        id: "currentPriceResolved",
        accessorFn: (row) => row.currentPriceResolved,
        header: "Current Price",
        cell: (info) => formatQuoteValue(info.row.original.currentPriceResolved, info.row.original.quote, 6),
      },
      {
        id: "athDrawdownResolved",
        accessorFn: (row) => row.athDrawdownResolved,
        header: "ATH DD %",
        cell: (i) => pctCell(i.getValue<number>()),
      },
      { accessorKey: "change1D", header: "1D %", cell: (i) => pctCell(i.getValue<number>()) },
      { accessorKey: "change7D", header: "7D %", cell: (i) => pctCell(i.getValue<number>()) },
      { accessorKey: "change30D", header: "30D %", cell: (i) => pctCell(i.getValue<number>()) },
      { accessorKey: "change90D", header: "90D %", cell: (i) => pctCell(i.getValue<number>()) },
      { accessorKey: "change1Y", header: "1Y %", cell: (i) => pctCell(i.getValue<number>()) },
      { accessorKey: "high30D", header: "30D High", cell: (i) => formatNumber(i.getValue<number>()) },
      { accessorKey: "low30D", header: "30D Low", cell: (i) => formatNumber(i.getValue<number>()) },
      { accessorKey: "range30DPct", header: "30D Range %", cell: (i) => pctCell(i.getValue<number>()) },
      { accessorKey: "high1Y", header: "1Y High", cell: (i) => formatNumber(i.getValue<number>()) },
      { accessorKey: "drawdown1YPct", header: "1Y DD %", cell: (i) => pctCell(i.getValue<number>()) },
      { accessorKey: "vol30D", header: "30D Vol", cell: (i) => formatCompact(i.getValue<number>()) },
      { accessorKey: "vol90D", header: "90D Vol", cell: (i) => formatCompact(i.getValue<number>()) },
      { accessorKey: "avgBuy", header: "Avg Buy", cell: (i) => formatNumber(i.getValue<number>(), 6) },
      { accessorKey: "distanceAvgPct", header: "Distance Avg %", cell: (i) => pctCell(i.getValue<number>()) },
    ],
    [],
  );

  const selectedAsset = selected
    ? assetLookup.get(`${selected.asset.toUpperCase()}__${selected.quote.toUpperCase()}`) ?? null
    : null;

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search asset..."
        className="tabular"
        tableContainerClassName="overflow-x-hidden overflow-y-hidden"
        tableClassName="w-full table-fixed text-[12px]"
        headerCellClassName="px-2 py-2.5 text-[9px]"
        bodyCellClassName="px-2 py-2.5 text-[12px] whitespace-nowrap"
        onRowClick={(row) => setSelected(row)}
      />
      {selected && selectedAsset ? (
        <AssetDetailDrawer
          asset={{
            ...selectedAsset,
            currentPrice: selected.currentPriceResolved ?? selectedAsset.currentPrice,
            ath: selected.athResolved ?? selectedAsset.ath,
            athDate: selected.athDateResolved ?? selectedAsset.athDate,
          }}
          performance={selected}
          transactions={transactions.filter((transaction) => transaction.asset === selected.asset)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
};
