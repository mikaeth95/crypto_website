import { useMemo, useState } from "react";
import { Pie, PieChart, ResponsiveContainer, Cell } from "recharts";
import type { PortfolioAssetRow } from "../../types/portfolio";
import { formatCurrency, formatNumber } from "../../lib/formatters";
import { ChartPanel } from "../ui/chart-panel";
import { Badge } from "../ui/badge";

const fiatLikeAssets = new Set(["EUR", "USD", "USDC", "USDT", "USDP", "DAI", "TUSD", "USDE"]);
const BASE_HUE = 220;
const SATURATION_STEPS = [76, 68, 82, 72, 86];
const LIGHTNESS_STEPS = [58, 52, 64, 48, 60];

type AllocationTab = "fiat" | "crypto";

type AllocationDatum = {
  name: string;
  value: number;
  balance: number;
  pct: number;
  quote: string | null;
  isFiat: boolean;
  displayValue: number;
  color: string;
};

const greatestCommonDivisor = (left: number, right: number): number => {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const remainder = a % b;

    a = b;
    b = remainder;
  }

  return a;
};

const buildAllocationPalette = (count: number) => {
  if (count <= 0) {
    return [];
  }

  const hueStep = 360 / count;
  let permutationStep = Math.floor(count / 2) + 1;

  while (greatestCommonDivisor(permutationStep, count) !== 1) {
    permutationStep += 1;
  }

  return Array.from({ length: count }, (_, index) => {
    const hueIndex = (index * permutationStep) % count;
    const hue = (BASE_HUE + hueIndex * hueStep) % 360;
    const saturation = SATURATION_STEPS[(index + hueIndex) % SATURATION_STEPS.length];
    const lightness = LIGHTNESS_STEPS[(index * 3 + hueIndex) % LIGHTNESS_STEPS.length];

    return `hsl(${hue.toFixed(0)} ${saturation}% ${lightness}%)`;
  });
};

const formatAllocationValue = (entry: AllocationDatum, activeTab: AllocationTab) =>
  activeTab === "fiat"
    ? `${formatNumber(entry.displayValue, 8)} ${entry.name}`
    : formatCurrency(entry.displayValue, entry.quote === "EUR" ? "EUR" : "USD");

export const AllocationChart = ({ assets }: { assets: PortfolioAssetRow[] }) => {
  const [activeTab, setActiveTab] = useState<AllocationTab>("crypto");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const allData = useMemo(
    () =>
      [...assets]
        .map((asset) => ({
          name: asset.asset,
          value: asset.currentValue ?? 0,
          balance: asset.bestand ?? 0,
          pct: asset.portfolioPct ?? 0,
          quote: asset.quote,
          isFiat: fiatLikeAssets.has(asset.asset.toUpperCase()),
        })),
    [assets],
  );
  const data = useMemo(() => {
    const filteredEntries = allData
      .filter((entry) => {
        const activeValue = activeTab === "fiat" ? entry.balance : entry.value;

        return (activeTab === "fiat" ? entry.isFiat : !entry.isFiat) && activeValue > 0;
      });
    const normalizedEntries =
      activeTab === "fiat"
        ? Array.from(
            filteredEntries.reduce<Map<string, Omit<AllocationDatum, "displayValue" | "color">>>((totals, entry) => {
              const existingEntry = totals.get(entry.name);

              if (existingEntry) {
                existingEntry.value += entry.value;
                existingEntry.balance += entry.balance;
                existingEntry.pct += entry.pct;
                return totals;
              }

              totals.set(entry.name, { ...entry });
              return totals;
            }, new Map()).values(),
          )
        : filteredEntries;
    const sortedEntries = normalizedEntries.sort((left, right) =>
      activeTab === "fiat" ? right.balance - left.balance : right.value - left.value,
    );
    const activeTotal = sortedEntries.reduce(
      (total, entry) => total + (activeTab === "fiat" ? entry.balance : entry.value),
      0,
    );
    const palette = buildAllocationPalette(sortedEntries.length);

    return sortedEntries.map((entry, index) => ({
      ...entry,
      displayValue: activeTab === "fiat" ? entry.balance : entry.value,
      pct:
        activeTotal > 0 ? ((activeTab === "fiat" ? entry.balance : entry.value) / activeTotal) * 100 : 0,
      color: palette[index],
    }));
  }, [activeTab, allData]);

  const hoveredEntry = hoveredIndex !== null ? data[hoveredIndex] ?? null : null;
  const topAsset = data[0]?.name ?? "n/a";
  const hasData = data.length > 0;

  return (
    <ChartPanel
      title="Asset Allocation"
      subtitle={activeTab === "fiat" ? "Fiat balances by remaining amount" : "Portfolio weight by current position value"}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/80 bg-panelSoft/70 p-1">
            <button
              type="button"
              className={activeTab === "fiat" ? "button-primary px-3 py-1.5 text-xs" : "button-surface border-0 px-3 py-1.5 text-xs"}
              onClick={() => {
                setActiveTab("fiat");
                setHoveredIndex(null);
              }}
            >
              Fiat
            </button>
            <button
              type="button"
              className={activeTab === "crypto" ? "button-primary px-3 py-1.5 text-xs" : "button-surface border-0 px-3 py-1.5 text-xs"}
              onClick={() => {
                setActiveTab("crypto");
                setHoveredIndex(null);
              }}
            >
              Crypto
            </button>
          </div>
          <Badge tone="blue">Top: {topAsset}</Badge>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[18px] border border-border/80 bg-[#0c1117] p-3">
          <div className="relative h-72">
            {hasData ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      dataKey="displayValue"
                      nameKey="name"
                      innerRadius={72}
                      outerRadius={104}
                      paddingAngle={2}
                      onMouseMove={(_, index) => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      {data.map((entry, index) => (
                        <Cell
                          key={`${entry.name}-${entry.quote ?? "na"}`}
                          fill={entry.color}
                          stroke={hoveredIndex === index ? "#ffffff" : "rgba(255,255,255,0.92)"}
                          strokeWidth={hoveredIndex === index ? 3 : 1}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {hoveredEntry ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="rounded-[18px] border border-border/80 bg-[rgba(10,14,20,0.86)] px-4 py-3 text-center shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-sm">
                      <p className="terminal-label" style={{ color: hoveredEntry.color }}>
                        {hoveredEntry.name}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">
                        {formatAllocationValue(hoveredEntry, activeTab)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{hoveredEntry.pct.toFixed(2)}%</p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[14px] border border-dashed border-border/70 bg-panelSoft/35 px-4 text-center text-sm text-slate-400">
                No {activeTab === "fiat" ? "fiat currency" : "crypto"} positions available.
              </div>
            )}
          </div>
        </div>
        <div className="rounded-[18px] border border-border/80 bg-panelSoft/35 p-2">
          {hasData ? (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {data.map((entry, index) => (
                <div
                  key={`${entry.name}-${entry.quote ?? "na"}`}
                  className="flex items-center justify-between rounded-lg border border-border/70 bg-panelSoft/65 px-3 py-2.5 text-sm transition hover:border-slate-500/70 hover:bg-[#151c25]"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span>{entry.name}</span>
                  </div>
                  <span className="tabular text-slate-300">{entry.pct.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-border/70 bg-panelSoft/35 px-4 py-5 text-sm text-slate-400">
              Nothing to display in this tab yet.
            </div>
          )}
        </div>
      </div>
    </ChartPanel>
  );
};
