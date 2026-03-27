import type { PortfolioAssetRow } from "../../types/portfolio";
import { formatPercent, signedClass } from "../../lib/formatters";
import { Badge } from "../ui/badge";
import { ChartPanel } from "../ui/chart-panel";

const fiatLikeAssets = new Set(["EUR", "USD", "USDC", "USDT", "USDP", "DAI", "TUSD", "USDE"]);

const MoverList = ({ title, rows }: { title: string; rows: PortfolioAssetRow[] }) => (
  <ChartPanel title={title}>
    <div className="space-y-2">
      {rows.map((r, idx) => (
        <div
          key={r.asset}
          className="rounded-lg border border-border/70 bg-panelSoft/65 px-3 py-3 text-sm"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge tone="blue">#{idx + 1}</Badge>
              <span className="font-medium text-slate-100">{r.asset}</span>
            </div>
            <span className={`tabular ${signedClass(r.unrealizedProfitPct)}`}>
              {formatPercent(r.unrealizedProfitPct)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#0b0f14]">
            <div
              className={signedClass(r.unrealizedProfitPct).includes("pos") ? "h-full bg-emerald-400" : "h-full bg-rose-400"}
              style={{
                width: `${Math.min(100, Math.abs(r.unrealizedProfitPct ?? 0))}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  </ChartPanel>
);

export const TopMovers = ({ assets }: { assets: PortfolioAssetRow[] }) => {
  const sorted = assets
    .filter((asset) => !fiatLikeAssets.has(asset.asset.toUpperCase()))
    .sort(
      (a, b) => (b.unrealizedProfitPct ?? -Infinity) - (a.unrealizedProfitPct ?? -Infinity),
    );
  const winners = sorted.slice(0, 5);
  const losers = sorted.slice(-5).reverse();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <MoverList title="Top Winners" rows={winners} />
      <MoverList title="Top Losers" rows={losers} />
    </div>
  );
};
