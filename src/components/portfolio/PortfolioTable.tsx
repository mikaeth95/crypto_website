import type { ColumnDef } from "@tanstack/react-table";
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

const CMC_LOGO_URL = "/data/img/cmc_logo.png";
const CRYPTO_COM_EXCHANGE_LOGO_URL = "/data/img/cryptocom_exchange.png";
const TRADINGVIEW_LOGO_URL = "/data/img/tradingview_logo.png";

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
  const bubbleAssetsBySymbol = useCryptoBubbleAssets();

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
        action={<Badge tone="blue">{rows.length} Assets</Badge>}
        updatedAt={updatedAt}
      />
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search asset..."
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
