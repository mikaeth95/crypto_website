import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "../ui/data-table";
import { formatCurrency, formatNumber, formatPercent, signedClass } from "../../lib/formatters";
import type { PortfolioDisplayRow } from "../../hooks/usePortfolioLiveData";
import type { CoinPerformanceRow, TransactionRow } from "../../types/portfolio";
import { AssetDetailDrawer } from "./AssetDetailDrawer";
import { Card } from "../ui/card";
import { PageHeader } from "../ui/page-header";
import { Badge } from "../ui/badge";
import { buildCoinMarketCapUrl } from "../../lib/coinmarketcap";

type BubbleAsset = {
  image?: string;
  slug?: string;
  symbol?: string;
  symbols?: Record<string, string | undefined>;
};

const BUBBLES_DATA_URL = "/data/bubbles1000.json";
const CRYPTO_BUBBLES_ASSET_BASE_URL = "https://cryptobubbles.net/backend/";
const CMC_LOGO_URL = "/data/img/cmc_logo.png";
const CRYPTO_COM_EXCHANGE_LOGO_URL = "/data/img/cryptocom_exchange.png";

const buildBubbleImageUrl = (imagePath: string | undefined) => {
  if (!imagePath) {
    return null;
  }

  return new URL(imagePath, CRYPTO_BUBBLES_ASSET_BASE_URL).toString();
};

const buildCryptoComExchangeUrl = (instrument: string | undefined) => {
  const normalizedInstrument = instrument?.trim();

  if (!normalizedInstrument) {
    return null;
  }

  return `https://crypto.com/exchange-pro/trade/${encodeURIComponent(normalizedInstrument)}`;
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
}: {
  rows: PortfolioDisplayRow[];
  performance: CoinPerformanceRow[];
  transactions: TransactionRow[];
}) => {
  const [selected, setSelected] = useState<PortfolioDisplayRow | null>(null);
  const [bubbleAssetsBySymbol, setBubbleAssetsBySymbol] = useState<Record<string, BubbleAsset>>({});

  useEffect(() => {
    let cancelled = false;

    void fetch(BUBBLES_DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load bubbles data: ${response.status}`);
        }

        return response.json() as Promise<BubbleAsset[]>;
      })
      .then((bubbleAssets) => {
        if (cancelled) {
          return;
        }

        const nextLookup = bubbleAssets.reduce<Record<string, BubbleAsset>>((lookup, asset) => {
          const symbol = asset.symbol?.trim().toUpperCase();

          if (symbol && !lookup[symbol]) {
            lookup[symbol] = asset;
          }

          return lookup;
        }, {});

        setBubbleAssetsBySymbol(nextLookup);
      })
      .catch(() => {
        if (!cancelled) {
          setBubbleAssetsBySymbol({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const columns = useMemo<ColumnDef<PortfolioDisplayRow>[]>(
    () => [
      {
        accessorKey: "asset",
        header: "Asset",
        cell: (info) => {
          const asset = info.getValue<string>();
          const bubbleAsset = bubbleAssetsBySymbol[asset.toUpperCase()];
          const imageUrl = buildBubbleImageUrl(bubbleAsset?.image);

          return (
            <span className="inline-flex items-center gap-2 font-medium text-slate-100">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-5 w-5 rounded-full bg-slate-950/60 object-cover"
                  loading="lazy"
                />
              ) : null}
              <span>{asset}</span>
            </span>
          );
        },
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
          const bubbleAsset = bubbleAssetsBySymbol[info.row.original.asset.toUpperCase()];
          const slug = bubbleAsset?.slug?.trim();
          const cryptoComExchangeUrl = buildCryptoComExchangeUrl(bubbleAsset?.symbols?.cryptocom);

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
