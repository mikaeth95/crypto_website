import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { ClosedTrade, OpenLot } from "../../lib/tradeHistory";
import { formatNumber, formatPercent, signedClass } from "../../lib/formatters";
import { useCryptoBubbleAssets } from "../../hooks/useCryptoBubbleAssets";
import { AssetTableCell } from "../ui/asset-table-cell";
import { Badge } from "../ui/badge";
import { DataTable } from "../ui/data-table";
import { TradeHistoryDetailDrawer } from "./TradeHistoryDetailDrawer";

const formatQuoteValue = (value: number | null | undefined, quote: string, decimals = 2) => {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${quote}`;
};

const formatDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00Z`);

  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
};

export const ClosedTradesTable = ({ rows }: { rows: ClosedTrade[] }) => {
  const [selectedTrade, setSelectedTrade] = useState<ClosedTrade | null>(null);
  const bubbleAssetsBySymbol = useCryptoBubbleAssets();
  const columns = useMemo<ColumnDef<ClosedTrade>[]>(
    () => [
      {
        accessorKey: "asset",
        header: "Asset",
        cell: (info) => (
          <AssetTableCell asset={info.getValue<string>()} bubbleAssetsBySymbol={bubbleAssetsBySymbol} />
        ),
      },
      { accessorKey: "quote", header: "Quote" },
      { accessorKey: "sellDate", header: "Sold", cell: (info) => formatDate(info.getValue<string>()) },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: (info) => formatNumber(info.getValue<number>(), 6),
      },
      {
        accessorKey: "averageCost",
        header: "FIFO Cost",
        cell: (info) => formatQuoteValue(info.getValue<number>(), info.row.original.quote, 4),
      },
      {
        accessorKey: "sellPrice",
        header: "Sell Price",
        cell: (info) => formatQuoteValue(info.getValue<number>(), info.row.original.quote, 4),
      },
      {
        accessorKey: "realizedPnl",
        header: "Realized P&L",
        cell: (info) => (
          <span className={signedClass(info.getValue<number>())}>
            {formatQuoteValue(info.getValue<number>(), info.row.original.quote)}
          </span>
        ),
      },
      {
        accessorKey: "returnPct",
        header: "Return",
        cell: (info) => (
          <span className={signedClass(info.getValue<number | null>())}>
            {formatPercent(info.getValue<number | null>())}
          </span>
        ),
      },
      {
        id: "matches",
        accessorFn: (row) => row.matches.length,
        header: "FIFO Matches",
        cell: (info) => <Badge>{info.row.original.matches.length}</Badge>,
      },
    ],
    [bubbleAssetsBySymbol],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search closed trades..."
        className="tabular"
        tableContainerClassName="max-h-[65vh] overflow-y-auto"
        onRowClick={setSelectedTrade}
        rowClassName={(row) => (row.original.id === selectedTrade?.id ? "bg-[#18212b]" : "")}
      />
      <TradeHistoryDetailDrawer trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
    </>
  );
};

export const OpenLotsTable = ({ rows }: { rows: OpenLot[] }) => {
  const bubbleAssetsBySymbol = useCryptoBubbleAssets();
  const columns = useMemo<ColumnDef<OpenLot>[]>(
    () => [
      {
        accessorKey: "asset",
        header: "Asset",
        cell: (info) => (
          <AssetTableCell asset={info.getValue<string>()} bubbleAssetsBySymbol={bubbleAssetsBySymbol} />
        ),
      },
      { accessorKey: "quote", header: "Quote" },
      { accessorKey: "buyDate", header: "Bought", cell: (info) => formatDate(info.getValue<string>()) },
      {
        accessorKey: "originalQuantity",
        header: "Original",
        cell: (info) => formatNumber(info.getValue<number>(), 6),
      },
      {
        accessorKey: "remainingQuantity",
        header: "Remaining",
        cell: (info) => formatNumber(info.getValue<number>(), 6),
      },
      {
        accessorKey: "buyPrice",
        header: "Buy Price",
        cell: (info) => formatQuoteValue(info.getValue<number>(), info.row.original.quote, 4),
      },
      {
        accessorKey: "costBasis",
        header: "Cost Basis",
        cell: (info) => formatQuoteValue(info.getValue<number>(), info.row.original.quote),
      },
      {
        accessorKey: "currentValue",
        header: "Current Value",
        cell: (info) => formatQuoteValue(info.getValue<number | null>(), info.row.original.quote),
      },
      {
        accessorKey: "unrealizedPnl",
        header: "Unrealized P&L",
        cell: (info) => (
          <span className={signedClass(info.getValue<number | null>())}>
            {formatQuoteValue(info.getValue<number | null>(), info.row.original.quote)}
          </span>
        ),
      },
      {
        accessorKey: "returnPct",
        header: "Return",
        cell: (info) => (
          <span className={signedClass(info.getValue<number | null>())}>
            {formatPercent(info.getValue<number | null>())}
          </span>
        ),
      },
    ],
    [bubbleAssetsBySymbol],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Search open lots..."
      className="tabular"
      tableContainerClassName="max-h-[65vh] overflow-y-auto"
    />
  );
};
