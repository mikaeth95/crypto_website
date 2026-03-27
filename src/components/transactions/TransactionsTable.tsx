import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { TransactionRow } from "../../types/portfolio";
import { DataTable } from "../ui/data-table";
import { Badge } from "../ui/badge";
import { TransactionDetailDrawer } from "./TransactionDetailDrawer";
import {
  EMPTY_VALUE,
  formatAssetPair,
  formatIdentifier,
  formatInlineTransactionValue,
  formatPlainTransactionNumber,
  formatTransactionFeeDisplay,
  transactionTone,
} from "./transactionDisplay";

const InlineTransactionValueCell = ({
  value,
  maxFractionDigits = 4,
}: {
  value: string | null | undefined;
  maxFractionDigits?: number;
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const displayValue = formatInlineTransactionValue(value, {
    raw: showRaw,
    maxFractionDigits,
  });

  if (displayValue === EMPTY_VALUE) {
    return <span className="text-slate-500">{EMPTY_VALUE}</span>;
  }

  return (
    <button
      type="button"
      className="block max-w-full whitespace-normal break-words text-left text-inherit transition hover:text-slate-300"
      onClick={(event) => {
        event.stopPropagation();
        setShowRaw((current) => !current);
      }}
      title={showRaw ? "Click to show rounded value" : "Click to show raw imported value"}
    >
      {displayValue}
    </button>
  );
};

const IdentifierCell = ({ value }: { value: string | null | undefined }) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return <span className="text-slate-500">{EMPTY_VALUE}</span>;
  }

  return (
    <span className="block truncate font-mono text-xs text-slate-200" title={trimmed}>
      {formatIdentifier(trimmed)}
    </span>
  );
};

export const TransactionsTable = ({ rows }: { rows: TransactionRow[] }) => {
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRow | null>(null);

  const columns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      { accessorKey: "datum", header: "Date" },
      {
        accessorKey: "typ",
        header: "Type",
        cell: (info) => <Badge tone={transactionTone(info.getValue<string>())}>{info.getValue<string>()}</Badge>,
      },
      {
        id: "assetPair",
        accessorFn: (row) => formatAssetPair(row.asset, row.quote),
        header: "Asset",
        cell: (info) => (
          <div className="min-w-0">
            <span className="font-medium text-slate-100">
              {formatAssetPair(info.row.original.asset, info.row.original.quote)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "menge",
        header: "Quantity",
        cell: (info) => (
          <span className="tabular text-slate-100">{formatPlainTransactionNumber(info.getValue<string>(), 6)}</span>
        ),
      },
      {
        accessorKey: "nettomenge",
        header: "Net Quantity",
        cell: (info) => (
          <span className="tabular text-slate-100">{formatPlainTransactionNumber(info.getValue<string>(), 6)}</span>
        ),
      },
      {
        id: "price",
        accessorFn: (row) => row.ausfuehrungspreis ?? "",
        header: "Buy Price",
        cell: (info) => (
          <InlineTransactionValueCell value={info.row.original.ausfuehrungspreis} maxFractionDigits={6} />
        ),
      },
      {
        id: "total",
        accessorFn: (row) => row.bruttoWert,
        header: "Total",
        cell: (info) => <InlineTransactionValueCell value={info.row.original.bruttoWert} maxFractionDigits={4} />,
      },
      {
        id: "fee",
        accessorFn: (row) => formatTransactionFeeDisplay(row),
        header: "Fee",
        cell: (info) => (
          <span className="block max-w-full whitespace-normal break-words text-slate-100">
            {formatTransactionFeeDisplay(info.row.original)}
          </span>
        ),
      },
      {
        accessorKey: "orderId",
        header: "Order ID",
        cell: (info) => <IdentifierCell value={info.getValue<string | null>()} />,
      },
      {
        accessorKey: "tradeId",
        header: "Trade ID",
        cell: (info) => <IdentifierCell value={info.getValue<string | null>()} />,
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search asset, order id, or trade id..."
        className="tabular [&_table]:table-fixed [&_td]:align-top [&_th]:whitespace-nowrap"
        tableContainerClassName="max-h-[70vh] overflow-y-auto"
        onRowClick={(row) => setSelectedTransaction(row)}
        rowClassName={(row) =>
          row.original.transaktionId === selectedTransaction?.transaktionId ? "bg-[#18212b]" : ""
        }
      />

      <TransactionDetailDrawer
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </>
  );
};
