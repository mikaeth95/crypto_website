import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState, type ReactNode } from "react";
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
    : `${String(parsed.getUTCDate()).padStart(2, "0")}.${String(parsed.getUTCMonth() + 1).padStart(2, "0")}.${parsed.getUTCFullYear()}`;
};

const getClosedTradeBuyDates = (trade: ClosedTrade) =>
  Array.from(new Set(trade.matches.map((match) => match.buyDate).filter(Boolean))).sort();

const formatClosedTradeBuyDates = (trade: ClosedTrade) => {
  const dates = getClosedTradeBuyDates(trade);

  return dates.length ? dates.map(formatDate).join("; ") : "n/a";
};

export const ClosedTradesTable = ({ rows, toolbarControls }: { rows: ClosedTrade[]; toolbarControls?: ReactNode }) => {
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
      {
        id: "buyDate",
        accessorFn: (row) => getClosedTradeBuyDates(row)[0] ?? "",
        header: "Buy Date",
        cell: (info) => {
          const dates = getClosedTradeBuyDates(info.row.original);

          if (!dates.length) {
            return <span className="text-slate-500">n/a</span>;
          }

          return (
            <span
              className="whitespace-nowrap"
              title={dates.map((date) => formatDate(date)).join(", ")}
            >
              {formatDate(dates[0])}
              {dates.length > 1 ? <span className="ml-1 text-slate-500">+{dates.length - 1}</span> : null}
            </span>
          );
        },
      },
      { accessorKey: "sellDate", header: "Sell Date", cell: (info) => formatDate(info.getValue<string>()) },
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
        searchInputClassName="w-full sm:w-[340px] sm:max-w-[340px]"
        toolbarControls={toolbarControls}
        exportConfig={{
          fileName: "trade-history-closed-trades",
          sheetName: "Closed Trades",
          columns: [
            { header: "Asset", value: (row) => row.asset },
            { header: "Quote", value: (row) => row.quote },
            { header: "Buy Date", value: formatClosedTradeBuyDates },
            { header: "Sell Date", value: (row) => formatDate(row.sellDate) },
            { header: "Amount", value: (row) => row.amount },
            { header: "FIFO Cost", value: (row) => row.averageCost },
            { header: "Sell Price", value: (row) => row.sellPrice },
            { header: "Realized P&L", value: (row) => row.realizedPnl },
            { header: "Return %", value: (row) => row.returnPct },
            { header: "FIFO Matches", value: (row) => row.matches.length },
          ],
        }}
        className="tabular"
        tableContainerClassName="max-h-[65vh] overflow-y-auto"
        onRowClick={setSelectedTrade}
        rowClassName={(row) => (row.original.id === selectedTrade?.id ? "bg-[#18212b]" : "")}
      />
      <TradeHistoryDetailDrawer trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
    </>
  );
};

export const OpenLotsTable = ({ rows, toolbarControls }: { rows: OpenLot[]; toolbarControls?: ReactNode }) => {
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
      { accessorKey: "buyDate", header: "Buy Date", cell: (info) => formatDate(info.getValue<string>()) },
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
      searchInputClassName="w-full sm:w-[340px] sm:max-w-[340px]"
      toolbarControls={toolbarControls}
      exportConfig={{
        fileName: "trade-history-open-lots",
        sheetName: "Open Lots",
        columns: [
          { header: "Asset", value: (row) => row.asset },
          { header: "Quote", value: (row) => row.quote },
          { header: "Buy Date", value: (row) => formatDate(row.buyDate) },
          { header: "Original", value: (row) => row.originalQuantity },
          { header: "Remaining", value: (row) => row.remainingQuantity },
          { header: "Buy Price", value: (row) => row.buyPrice },
          { header: "Cost Basis", value: (row) => row.costBasis },
          { header: "Current Value", value: (row) => row.currentValue },
          { header: "Unrealized P&L", value: (row) => row.unrealizedPnl },
          { header: "Return %", value: (row) => row.returnPct },
        ],
      }}
      className="tabular"
      tableContainerClassName="max-h-[65vh] overflow-y-auto"
    />
  );
};
