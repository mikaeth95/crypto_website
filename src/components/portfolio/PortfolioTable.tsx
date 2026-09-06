import type { ColumnDef } from "@tanstack/react-table";
import { EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "../ui/data-table";
import { AssetTableCell } from "../ui/asset-table-cell";
import { formatCurrency, formatNumber, formatPercent, signedClass } from "../../lib/formatters";
import type { PortfolioDisplayRow } from "../../hooks/usePortfolioLiveData";
import { resolveCryptoBubbleAsset, useCryptoBubbleAssets } from "../../hooks/useCryptoBubbleAssets";
import type { CoinPerformanceRow, TransactionRow } from "../../types/portfolio";
import { AssetDetailDrawer } from "./AssetDetailDrawer";
import { PageHeader } from "../ui/page-header";
import { Badge } from "../ui/badge";
import { buildCoinMarketCapUrl } from "../../lib/coinmarketcap";
import { cn } from "../../lib/utils";

const CMC_LOGO_URL = "/data/img/cmc_logo.png";
const CRYPTO_COM_EXCHANGE_LOGO_URL = "/data/img/cryptocom_exchange.png";
const TRADINGVIEW_LOGO_URL = "/data/img/tradingview_logo.png";
const DEFAULT_DUST_VALUE_THRESHOLD = 1;
const HIDE_DUST_STORAGE_KEY = "crypto-portfolio-hide-dust";
const DUST_THRESHOLD_STORAGE_KEY = "crypto-portfolio-dust-threshold-v2";

const readStoredDustThreshold = () => {
  if (typeof window === "undefined") {
    return DEFAULT_DUST_VALUE_THRESHOLD;
  }

  try {
    const storedThreshold = window.localStorage.getItem(DUST_THRESHOLD_STORAGE_KEY);
    const storedValue = storedThreshold === null ? Number.NaN : Number(storedThreshold);
    return Number.isFinite(storedValue) && storedValue >= 0
      ? storedValue
      : DEFAULT_DUST_VALUE_THRESHOLD;
  } catch {
    return DEFAULT_DUST_VALUE_THRESHOLD;
  }
};

const getEstimatedPositionValue = (row: PortfolioDisplayRow) => {
  if (typeof row.currentValue === "number" && Number.isFinite(row.currentValue)) {
    return Math.abs(row.currentValue);
  }

  if (typeof row.currentPrice === "number" && Number.isFinite(row.currentPrice)) {
    return Math.abs(row.currentPrice * row.bestand);
  }

  if (typeof row.avgBuyPrice === "number" && Number.isFinite(row.avgBuyPrice)) {
    return Math.abs(row.avgBuyPrice * row.bestand);
  }

  return null;
};

const isDustPosition = (row: PortfolioDisplayRow, threshold: number) => {
  const quote = row.quote.trim().toUpperCase();
  const estimatedValue = getEstimatedPositionValue(row);

  return (quote === "EUR" || quote === "USD") && estimatedValue !== null && estimatedValue < threshold;
};

const resolveCryptoComInstrument = (
  instrument: string | undefined,
  asset: string | undefined,
  quote: string | undefined,
) => {
  const normalizedInstrument = instrument?.trim().toUpperCase();
  const normalizedAsset = asset?.trim().toUpperCase();
  const normalizedQuote = quote?.trim().toUpperCase();

  if (!normalizedInstrument || !normalizedAsset || !normalizedQuote) {
    return null;
  }

  return `${normalizedAsset}_${normalizedQuote}`;
};

const buildCryptoComExchangeUrl = (instrument: string | null) => {
  const normalizedInstrument = instrument?.trim();

  if (!normalizedInstrument) {
    return null;
  }

  return `https://crypto.com/exchange/trade/${encodeURIComponent(normalizedInstrument)}`;
};

const buildTradingViewUrl = (instrument: string | null) => {
  const normalizedInstrument = instrument?.trim().replace(/_/g, "");

  if (!normalizedInstrument) {
    return null;
  }

  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`CRYPTOCOM:${normalizedInstrument}`)}`;
};

const formatQuoteCurrency = (value: number | null | undefined, quote: string | null | undefined) => {
  if (!quote || value === null || value === undefined) {
    return "n/a";
  }

  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${quote}`;
};

const formatPriceCurrency = (value: number | null | undefined, quote: string | null | undefined) => {
  if (!quote || value === null || value === undefined) {
    return "n/a";
  }

  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })} ${quote}`;
};

export const PortfolioTable = ({
  rows,
  performance,
  transactions,
  updatedAt,
}: {
  rows: PortfolioDisplayRow[];
  performance: CoinPerformanceRow[];
  transactions: TransactionRow[];
  updatedAt: string | null;
}) => {
  const [selected, setSelected] = useState<PortfolioDisplayRow | null>(null);
  const [hideDust, setHideDust] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.localStorage.getItem(HIDE_DUST_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [dustThreshold, setDustThreshold] = useState(readStoredDustThreshold);
  const [dustThresholdInput, setDustThresholdInput] = useState(() => readStoredDustThreshold().toFixed(2));
  const bubbleAssetsBySymbol = useCryptoBubbleAssets();
  const dustRows = useMemo(
    () => rows.filter((row) => isDustPosition(row, dustThreshold)),
    [dustThreshold, rows],
  );
  const visibleRows = useMemo(
    () => (hideDust ? rows.filter((row) => !isDustPosition(row, dustThreshold)) : rows),
    [dustThreshold, hideDust, rows],
  );

  const handleDustToggle = () => {
    const nextHideDust = !hideDust;
    setHideDust(nextHideDust);

    if (nextHideDust && selected && isDustPosition(selected, dustThreshold)) {
      setSelected(null);
    }

    try {
      window.localStorage.setItem(HIDE_DUST_STORAGE_KEY, String(nextHideDust));
    } catch {
      // The filter still works for this session when storage is unavailable.
    }
  };

  const handleDustThresholdChange = (value: string) => {
    setDustThresholdInput(value);

    if (value.trim() === "") {
      return;
    }

    const nextThreshold = Number(value);
    if (!Number.isFinite(nextThreshold) || nextThreshold < 0) {
      return;
    }

    setDustThreshold(nextThreshold);

    if (hideDust && selected && isDustPosition(selected, nextThreshold)) {
      setSelected(null);
    }

    try {
      window.localStorage.setItem(DUST_THRESHOLD_STORAGE_KEY, String(nextThreshold));
    } catch {
      // The threshold still works for this session when storage is unavailable.
    }
  };

  const normalizeDustThresholdInput = () => {
    setDustThresholdInput(dustThreshold.toFixed(2));
  };

  const columns = useMemo<ColumnDef<PortfolioDisplayRow>[]>(
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
        accessorKey: "currentPrice",
        header: "Price",
        cell: (info) => formatPriceCurrency(info.getValue<number>(), info.row.original.quote),
      },
      {
        accessorKey: "avgBuyPrice",
        header: "Avg Buy",
        cell: (info) => formatPriceCurrency(info.getValue<number>(), info.row.original.quote),
      },
      {
        accessorKey: "currentValue",
        header: "Current Value",
        cell: (info) => formatCurrency(info.getValue<number>(), info.row.original.quote as "EUR" | "USD"),
      },
      {
        accessorKey: "bestand",
        header: "Balance",
        cell: (info) => formatNumber(info.getValue<number>(), 6),
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
      {
        id: "links",
        header: "Links",
        enableSorting: false,
        cell: (info) => {
          const bubbleAsset = resolveCryptoBubbleAsset(info.row.original.asset, bubbleAssetsBySymbol);
          const slug = bubbleAsset?.slug?.trim();
          const cryptoComInstrument = resolveCryptoComInstrument(
            bubbleAsset?.symbols?.cryptocom,
            info.row.original.asset,
            info.row.original.quote,
          );
          const cryptoComExchangeUrl = buildCryptoComExchangeUrl(cryptoComInstrument);
          const tradingViewUrl = buildTradingViewUrl(cryptoComInstrument);

          if (!slug && !cryptoComExchangeUrl) {
            return <span className="text-slate-600">n/a</span>;
          }

          return (
            <div className="flex items-center gap-2">
              {slug ? (
                <a
                  href={buildCoinMarketCapUrl(slug)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Open ${info.row.original.asset} on CoinMarketCap`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-[#101722] transition hover:border-slate-500/80 hover:bg-[#151c25]"
                >
                  <img src={CMC_LOGO_URL} alt="" className="h-10 w-10 max-w-none object-cover" loading="lazy" />
                </a>
              ) : null}
              {cryptoComExchangeUrl ? (
                <a
                  href={cryptoComExchangeUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Open ${info.row.original.asset} on Crypto.com Exchange`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-[#101722] transition hover:border-slate-500/80 hover:bg-[#151c25]"
                >
                  <img
                    src={CRYPTO_COM_EXCHANGE_LOGO_URL}
                    alt=""
                    className="h-10 w-10 max-w-none object-cover"
                    loading="lazy"
                  />
                </a>
              ) : null}
              {tradingViewUrl ? (
                <a
                  href={tradingViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Open ${info.row.original.asset} on TradingView`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-[#101722] transition hover:border-slate-500/80 hover:bg-[#151c25]"
                >
                  <img
                    src={TRADINGVIEW_LOGO_URL}
                    alt=""
                    className="h-10 w-10 max-w-none object-cover"
                    loading="lazy"
                  />
                </a>
              ) : null}
            </div>
          );
        },
      },
    ],
    [bubbleAssetsBySymbol],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Portfolio"
        description="Holdings, valuation, and unrealized performance by asset."
        action={<Badge tone="blue">{visibleRows.length} Assets</Badge>}
        updatedAt={updatedAt}
      />
      <DataTable
        columns={columns}
        data={visibleRows}
        searchPlaceholder="Search asset..."
        toolbarControls={(
          <>
            <button
              type="button"
              aria-pressed={hideDust}
              title={`Hide positions worth less than ${dustThreshold.toFixed(2)} EUR/USD`}
              className={cn(
                "button-surface h-10 px-3 text-xs",
                hideDust && "border-accent/45 bg-accent/10 text-white hover:border-accent/55 hover:bg-accent/15",
              )}
              onClick={handleDustToggle}
            >
              <EyeOff size={14} aria-hidden="true" />
              Hide dust
              {dustRows.length > 0 ? (
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {dustRows.length}
                </span>
              ) : null}
            </button>
            <label className="inline-flex h-10 items-stretch overflow-hidden rounded-lg border border-border bg-panelSoft text-xs transition focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/10">
              <span className="inline-flex items-center border-r border-border/80 px-2.5 text-slate-500">
                Below
              </span>
              <span className="inline-flex items-center gap-2 px-2.5">
                <input
                  type="number"
                  min="0"
                  step="0.10"
                  inputMode="decimal"
                  aria-label="Dust value threshold"
                  value={dustThresholdInput}
                  onChange={(event) => handleDustThresholdChange(event.target.value)}
                  onBlur={normalizeDustThresholdInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  className="w-12 bg-transparent text-right font-medium text-textPrimary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="whitespace-nowrap text-slate-400">EUR/USD</span>
              </span>
            </label>
          </>
        )}
        exportConfig={{
          fileName: "portfolio",
          sheetName: "Portfolio",
          columns: [
            { header: "Asset", value: (row) => row.asset },
            { header: "Quote", value: (row) => row.quote },
            { header: "Price", value: (row) => row.currentPrice },
            { header: "Avg Buy", value: (row) => row.avgBuyPrice },
            { header: "Current Value", value: (row) => row.currentValue },
            { header: "Balance", value: (row) => row.bestand },
            { header: "Unrealized PnL", value: (row) => row.unrealizedProfit },
            { header: "Unrealized PnL %", value: (row) => row.unrealizedProfitPct },
            { header: "Portfolio %", value: (row) => row.portfolioPct },
            { header: "Trades", value: (row) => row.trades },
          ],
        }}
        className="tabular"
        onRowClick={(row) => setSelected(row)}
      />
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
        {visibleRows.map((r) => (
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
