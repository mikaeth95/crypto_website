import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink, X } from "lucide-react";
import type { ClosedTrade } from "../../lib/tradeHistory";
import { formatNumber, formatPercent, signedClass } from "../../lib/formatters";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

const formatQuoteValue = (value: number, quote: string, decimals = 2) =>
  `${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${quote}`;

const transactionLink = (transactionId: string) =>
  `/transactions?transaction=${encodeURIComponent(transactionId)}`;

export const TradeHistoryDetailDrawer = ({
  trade,
  onClose,
}: {
  trade: ClosedTrade | null;
  onClose: () => void;
}) => (
  <AnimatePresence>
    {trade ? (
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
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="terminal-label">FIFO Trade</p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-100">{trade.asset}</h2>
              <p className="mt-1 text-sm text-slate-400">Sold {trade.sellDate}</p>
            </div>
            <button type="button" className="button-surface p-2" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone="green">Closed</Badge>
            <Badge tone="blue">{trade.quote}</Badge>
            <Badge>{trade.matches.length} FIFO matches</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-border/80 bg-panelSoft/70">
              <p className="terminal-label">Sold</p>
              <p className="tabular mt-3 text-xl font-semibold text-slate-100">
                {formatNumber(trade.amount, 6)} {trade.asset}
              </p>
              <p className="tabular mt-1 text-sm text-slate-400">
                @ {formatQuoteValue(trade.sellPrice, trade.quote, 4)}
              </p>
            </Card>
            <Card className="border-border/80 bg-panelSoft/70">
              <p className="terminal-label">Realized P&L</p>
              <p className={`tabular mt-3 text-xl font-semibold ${signedClass(trade.realizedPnl)}`}>
                {formatQuoteValue(trade.realizedPnl, trade.quote)}
              </p>
              <p className={`tabular mt-1 text-sm ${signedClass(trade.returnPct)}`}>
                {formatPercent(trade.returnPct)}
              </p>
            </Card>
          </div>

          <Card className="mt-4 border-border/80 bg-panelSoft/65">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ["Cost Basis", formatQuoteValue(trade.costBasis, trade.quote)],
                ["Gross Proceeds", formatQuoteValue(trade.grossProceeds, trade.quote)],
                ["Sell Fee", formatQuoteValue(trade.sellFee, trade.quote)],
                ["Net Proceeds", formatQuoteValue(trade.netProceeds, trade.quote)],
                ["Average Holding", `${trade.averageHoldingDays} days`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border/70 bg-panel px-3 py-2.5">
                  <p className="terminal-label">{label}</p>
                  <p className="tabular mt-1 text-slate-200">{value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="mt-4 space-y-3 border-border/80 bg-panelSoft/65">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">FIFO Matches</h3>
              <span className="terminal-label">Oldest lots first</span>
            </div>
            {trade.matches.map((match) => (
              <div key={match.id} className="rounded-lg border border-border/70 bg-panel px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-100">
                      {formatNumber(match.amount, 6)} {match.asset}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Bought {match.buyDate} · {match.holdingDays} days
                    </p>
                  </div>
                  <p className={`tabular font-semibold ${signedClass(match.realizedPnl)}`}>
                    {formatQuoteValue(match.realizedPnl, match.quote)}
                  </p>
                </div>
                <div className="tabular mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span>{formatQuoteValue(match.buyPrice, match.quote, 4)}</span>
                  <ArrowRight size={13} className="text-slate-600" />
                  <span>{formatQuoteValue(match.sellPrice, match.quote, 4)}</span>
                  <span className={signedClass(match.returnPct)}>({formatPercent(match.returnPct)})</span>
                </div>
                <Link
                  to={transactionLink(match.buyTransactionId)}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#9ab1ff] hover:text-white"
                >
                  View buy transaction <ExternalLink size={12} />
                </Link>
              </div>
            ))}
          </Card>

          <Link to={transactionLink(trade.sellTransactionId)} className="button-primary mt-4">
            View sell transaction <ExternalLink size={14} />
          </Link>
        </motion.div>
      </motion.div>
    ) : null}
  </AnimatePresence>
);
