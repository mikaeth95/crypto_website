import type { CoinPerformanceRow, PortfolioAssetRow, TransactionRow } from "../../types/portfolio";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent, signedClass } from "../../lib/formatters";
import { parseLocalizedNumber } from "../../lib/parsers";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

type DrawerPerformanceRow = CoinPerformanceRow & {
  athResolved?: number | null;
  athDateResolved?: string | null;
};

const formatQuoteValue = (value: number | null | undefined, quote: string) => {
  if (value === null || value === undefined) {
    return "n/a";
  }

  if (quote === "EUR" || quote === "USD") {
    return formatCurrency(value, quote);
  }

  return `${formatNumber(value, 6)} ${quote}`;
};

const EMPTY_VALUE = "n/a";

const calculateTransactionProfit = (tx: TransactionRow, currentPrice: number | null | undefined) => {
  const executionPrice = parseLocalizedNumber(tx.ausfuehrungspreis);
  const netQuantity = parseLocalizedNumber(tx.nettomenge);

  if (
    currentPrice === null ||
    currentPrice === undefined ||
    executionPrice === null ||
    netQuantity === null
  ) {
    return null;
  }

  return (currentPrice - executionPrice) * Math.abs(netQuantity);
};

const formatProfitValue = (value: number | null, quote: string | null | undefined) => {
  if (value === null || !quote) {
    return EMPTY_VALUE;
  }

  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${quote}`;
};

const formatTransactionId = (value: string) => value.replace(/^crypto_com_exchange:/, "");

export const AssetDetailDrawer = ({
  asset,
  performance,
  transactions,
  onClose,
}: {
  asset: PortfolioAssetRow;
  performance?: DrawerPerformanceRow;
  transactions: TransactionRow[];
  onClose: () => void;
}) => {
  const resolvedAth = performance?.athResolved ?? performance?.ath ?? asset.ath;
  const resolvedAthDate = performance?.athDateResolved ?? performance?.athDate ?? asset.athDate;

  return (
    <AnimatePresence>
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
          onClick={(e) => e.stopPropagation()}
          className="h-full w-full max-w-2xl overflow-auto border-l border-border/90 bg-panel px-5 py-5 shadow-[-20px_0_40px_rgba(0,0,0,0.4)]"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="terminal-label">Asset Detail</p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-100">{asset.asset}</h2>
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
            <Badge tone="blue">{asset.quote}</Badge>
            <Badge tone={(asset.unrealizedProfitPct ?? 0) >= 0 ? "green" : "red"}>
              {formatPercent(asset.unrealizedProfitPct)}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Card className="space-y-1 border-border/80 bg-panelSoft/70 text-sm">
              <p className="text-slate-400">Current Price</p>
              <p className="tabular text-lg font-semibold text-slate-100">
                {formatQuoteValue(asset.currentPrice, asset.quote)}
              </p>
              <p className="text-slate-400">Avg Buy: {formatQuoteValue(asset.avgBuyPrice, asset.quote)}</p>
            </Card>
            <Card className="space-y-1 border-border/80 bg-panelSoft/70 text-sm">
              <p className="text-slate-400">Performance Highlights</p>
              <p className={signedClass(performance?.distanceAvgPct)}>
                Distance to Avg Buy: {formatPercent(performance?.distanceAvgPct)}
              </p>
              <p className="text-slate-300">ATH: {formatQuoteValue(resolvedAth, asset.quote)}</p>
              <p className="text-slate-300">ATH Date: {resolvedAthDate ?? "n/a"}</p>
            </Card>
          </div>

          <Card className="mt-4 space-y-3 border-border/80 bg-panelSoft/60">
            <h3 className="text-sm font-semibold text-slate-100">Related Transactions</h3>
            {transactions.length ? (
              transactions.slice(0, 12).map((tx) => {
                const transactionProfit = calculateTransactionProfit(tx, asset.currentPrice);
                const quote = tx.quote ?? asset.quote;

                return (
                  <div
                    key={tx.transaktionId}
                    className="space-y-2 rounded-lg border border-border/70 bg-panel px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-200">{tx.typ}</span>
                      <span className="tabular text-slate-400">{tx.datum ?? EMPTY_VALUE}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <span className="text-slate-300">
                        Price: <span className="tabular text-slate-100">{tx.ausfuehrungspreis ?? EMPTY_VALUE}</span>
                      </span>
                      <span className="text-slate-300">
                        Net: <span className="tabular text-slate-100">{tx.nettowert}</span>
                      </span>
                      <span className="text-slate-300">
                        Profit:{" "}
                        <span className={`tabular ${signedClass(transactionProfit)}`}>
                          {formatProfitValue(transactionProfit, quote)}
                        </span>
                      </span>
                    </div>
                    <div className="truncate text-slate-500" title={tx.transaktionId}>
                      {formatTransactionId(tx.transaktionId)}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-400">No related transactions found.</p>
            )}
          </Card>

          {performance?.cmcUrl ? (
            <a
              className="button-primary mt-4"
              href={performance.cmcUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open CoinMarketCap <ExternalLink size={14} />
            </a>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
