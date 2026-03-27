import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { TransactionRow } from "../../types/portfolio";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import {
  EMPTY_VALUE,
  formatAssetPair,
  formatInlineTransactionValue,
  formatPlainTransactionNumber,
  formatTransactionFeeDisplay,
  transactionTone,
} from "./transactionDisplay";

const DetailField = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) => (
  <div className="space-y-1 rounded-lg border border-border/70 bg-panelSoft/60 px-3 py-2.5">
    <p className="terminal-label">{label}</p>
    <p className={mono ? "break-all font-mono text-sm text-slate-200" : "text-sm text-slate-200"}>
      {value?.trim() ? value : EMPTY_VALUE}
    </p>
  </div>
);

export const TransactionDetailDrawer = ({
  transaction,
  onClose,
}: {
  transaction: TransactionRow | null;
  onClose: () => void;
}) => (
  <AnimatePresence>
    {transaction ? (
      <motion.div
        className="fixed inset-0 z-50 flex justify-end bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
        initial={{ x: 36, opacity: 0.9 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 230 }}
        onClick={(event) => event.stopPropagation()}
          className="h-full w-full max-w-2xl overflow-auto border-l border-border/90 bg-panel px-5 py-5 shadow-[-20px_0_40px_rgba(0,0,0,0.4)]"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="terminal-label">Transaction Detail</p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
                {formatAssetPair(transaction.asset, transaction.quote)}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{transaction.datum ?? EMPTY_VALUE}</p>
            </div>
            <button
              className="button-surface p-2"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone={transactionTone(transaction.typ)}>{transaction.typ}</Badge>
            <Badge tone="blue">{transaction.quote ?? "No Quote"}</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="space-y-1 border-border/80 bg-panelSoft/70 text-sm">
              <p className="text-slate-400">Quantity</p>
              <p className="tabular text-lg font-semibold text-slate-100">
                {formatPlainTransactionNumber(transaction.menge, 6)}
              </p>
            </Card>
            <Card className="space-y-1 border-border/80 bg-panelSoft/70 text-sm">
              <p className="text-slate-400">Net Quantity</p>
              <p className="tabular text-lg font-semibold text-slate-100">
                {formatPlainTransactionNumber(transaction.nettomenge, 6)}
              </p>
            </Card>
            <Card className="space-y-1 border-border/80 bg-panelSoft/70 text-sm">
              <p className="text-slate-400">Buy Price</p>
              <p className="tabular text-lg font-semibold text-slate-100">
                {formatInlineTransactionValue(transaction.ausfuehrungspreis, { maxFractionDigits: 6 })}
              </p>
            </Card>
            <Card className="space-y-1 border-border/80 bg-panelSoft/70 text-sm">
              <p className="text-slate-400">Total</p>
              <p className="tabular text-lg font-semibold text-slate-100">
                {formatInlineTransactionValue(transaction.bruttoWert)}
              </p>
            </Card>
            <Card className="space-y-1 border-border/80 bg-panelSoft/70 text-sm">
              <p className="text-slate-400">Fee</p>
              <p className="tabular text-lg font-semibold text-slate-100">
                {formatTransactionFeeDisplay(transaction)}
              </p>
            </Card>
          </div>

          <Card className="mt-4 space-y-3 border-border/80 bg-panelSoft/65">
            <h3 className="text-sm font-semibold text-slate-100">Details</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <DetailField label="Quote" value={transaction.quote} />
              <DetailField label="Fee Currency" value={transaction.waehrungGebuehr} />
              <DetailField label="Exchange" value={transaction.boerse} />
              <DetailField label="Source" value={transaction.datenquelle} />
            </div>
          </Card>

          <Card className="mt-4 space-y-3 border-border/80 bg-panelSoft/65">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">Imported Values</h3>
              <p className="terminal-label">Raw Stored Strings</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <DetailField label="Quantity" value={transaction.menge} />
              <DetailField label="Buy Price" value={transaction.ausfuehrungspreis} />
              <DetailField label="Gross Value" value={transaction.bruttoWert} />
              <DetailField label="Net Quantity" value={transaction.nettomenge} />
              <DetailField label="Net Value" value={transaction.nettowert} />
              <DetailField
                label="Fee"
                value={
                  transaction.gebuehr?.trim()
                    ? transaction.waehrungGebuehr
                      ? `${transaction.gebuehr} ${transaction.waehrungGebuehr}`
                      : transaction.gebuehr
                    : null
                }
              />
            </div>
          </Card>

          <Card className="mt-4 space-y-3 border-border/80 bg-panelSoft/65">
            <h3 className="text-sm font-semibold text-slate-100">Identifiers</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <DetailField label="Order ID" value={transaction.orderId} mono />
              <DetailField label="Trade ID" value={transaction.tradeId} mono />
              <DetailField label="External ID" value={transaction.transaktionId} mono />
              <DetailField label="Trade Match ID" value={transaction.tradeMatchId} mono />
              <DetailField label="Client Order ID" value={transaction.clientOrderId} mono />
              <DetailField
                label="Journal IDs"
                value={transaction.journalIds.length ? transaction.journalIds.join(", ") : null}
                mono
              />
            </div>
          </Card>
        </motion.div>
      </motion.div>
    ) : null}
  </AnimatePresence>
);
