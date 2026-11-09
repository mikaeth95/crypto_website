import { Fragment, useMemo, useState } from "react";
import { Pie, PieChart, ResponsiveContainer, Cell } from "recharts";
import type { PortfolioAssetRow } from "../../types/portfolio";
import { formatCurrency, formatNumber } from "../../lib/formatters";
import { ChartPanel } from "../ui/chart-panel";
import { Badge } from "../ui/badge";

const fiatLikeAssets = new Set(["EUR", "USD", "USDC", "USDT", "USDP", "DAI", "TUSD", "USDE"]);
const BASE_HUE = 220;
const SATURATION_STEPS = [76, 68, 82, 72, 86];
const LIGHTNESS_STEPS = [58, 52, 64, 48, 60];

/**
 * Kleinstpositionen ("Dust") werden im Tortendiagramm zu einem Stück
 * zusammengefasst. Ohne das bekommt jedes Stück seinen eigenen Abstand
 * (paddingAngle). Bei sehr vielen Positionen übersteigen allein die Abstände
 * 360 Grad und recharts zeichnet nur noch einen Bogen statt eines Rings.
 * In der Liste neben dem Diagramm bleiben alle Positionen einzeln sichtbar.
 */
const DUST_THRESHOLD_PCT = 1;
const MAX_PIE_SLICES = 12;
const PIE_PADDING_ANGLE = 2;
const DUST_KEY = "__dust__";
const DUST_COLOR = "hsl(220 12% 42%)";

type AllocationTab = "fiat" | "crypto";

type AllocationDatum = {
  key: string;
  name: string;
  value: number;
  balance: number;
  pct: number;
  quote: string | null;
  isFiat: boolean;
  isDust: boolean;
  dustCount: number;
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

const formatAllocationValue = (entry: AllocationDatum, activeTab: AllocationTab) => {
  if (entry.key === DUST_KEY) {
    return `${entry.dustCount} small positions`;
  }

  return activeTab === "fiat"
    ? `${formatNumber(entry.displayValue, 8)} ${entry.name}`
    : formatCurrency(entry.displayValue, entry.quote === "EUR" ? "EUR" : "USD");
};

export const AllocationChart = ({ assets }: { assets: PortfolioAssetRow[] }) => {
  const [activeTab, setActiveTab] = useState<AllocationTab>("crypto");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
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
  const { data, pieData, mainCount } = useMemo(() => {
    const filteredEntries = allData
      .filter((entry) => {
        const activeValue = activeTab === "fiat" ? entry.balance : entry.value;

        return (activeTab === "fiat" ? entry.isFiat : !entry.isFiat) && activeValue > 0;
      });
    const normalizedEntries =
      activeTab === "fiat"
        ? Array.from(
            filteredEntries.reduce<Map<string, (typeof filteredEntries)[number]>>((totals, entry) => {
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
    const entriesWithShare = sortedEntries.map((entry) => {
      const displayValue = activeTab === "fiat" ? entry.balance : entry.value;

      return {
        ...entry,
        key: `${entry.name}-${entry.quote ?? "na"}`,
        displayValue,
        pct: activeTotal > 0 ? (displayValue / activeTotal) * 100 : 0,
      };
    });

    // Die Liste ist absteigend sortiert: Ab der ersten Position unter der
    // Schwelle (oder ab der maximalen Stückzahl) ist alles Weitere Dust.
    // Eine einzelne Kleinstposition lohnt keine Gruppe und bleibt eigenes Stück.
    const firstDustIndex = entriesWithShare.findIndex(
      (entry, index) => index >= MAX_PIE_SLICES || entry.pct < DUST_THRESHOLD_PCT,
    );
    const splitIndex =
      firstDustIndex === -1 || entriesWithShare.length - firstDustIndex < 2
        ? entriesWithShare.length
        : firstDustIndex;
    const palette = buildAllocationPalette(splitIndex);

    const listEntries: AllocationDatum[] = entriesWithShare.map((entry, index) => ({
      ...entry,
      isDust: index >= splitIndex,
      dustCount: 0,
      color: index < splitIndex ? palette[index] : DUST_COLOR,
    }));
    const dustEntries = listEntries.slice(splitIndex);
    const sumDust = (pick: (entry: AllocationDatum) => number) =>
      dustEntries.reduce((total, entry) => total + pick(entry), 0);
    const dustSlice: AllocationDatum[] =
      dustEntries.length > 0
        ? [
            {
              key: DUST_KEY,
              name: "Dust",
              value: sumDust((entry) => entry.value),
              balance: sumDust((entry) => entry.balance),
              pct: sumDust((entry) => entry.pct),
              quote: null,
              isFiat: activeTab === "fiat",
              isDust: true,
              dustCount: dustEntries.length,
              displayValue: sumDust((entry) => entry.displayValue),
              color: DUST_COLOR,
            },
          ]
        : [];

    return {
      data: listEntries,
      pieData: [...listEntries.slice(0, splitIndex), ...dustSlice],
      mainCount: splitIndex,
    };
  }, [activeTab, allData]);

  const hoveredEntry =
    hoveredKey !== null
      ? data.find((entry) => entry.key === hoveredKey) ?? pieData.find((entry) => entry.key === hoveredKey) ?? null
      : null;
  // Eine Dust-Position aus der Liste hebt im Diagramm das Dust-Stück hervor.
  const highlightedSliceKey = hoveredEntry ? (hoveredEntry.isDust ? DUST_KEY : hoveredEntry.key) : null;
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
                setHoveredKey(null);
              }}
            >
              Fiat
            </button>
            <button
              type="button"
              className={activeTab === "crypto" ? "button-primary px-3 py-1.5 text-xs" : "button-surface border-0 px-3 py-1.5 text-xs"}
              onClick={() => {
                setActiveTab("crypto");
                setHoveredKey(null);
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
                      data={pieData}
                      dataKey="displayValue"
                      nameKey="name"
                      innerRadius={72}
                      outerRadius={104}
                      // Ein einzelnes Stück braucht keinen Abstand, sonst bleibt eine Lücke im Ring.
                      paddingAngle={pieData.length > 1 ? PIE_PADDING_ANGLE : 0}
                      onMouseMove={(_, index) => setHoveredKey(pieData[index]?.key ?? null)}
                      onMouseLeave={() => setHoveredKey(null)}
                    >
                      {pieData.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={entry.color}
                          stroke={highlightedSliceKey === entry.key ? "#ffffff" : "rgba(255,255,255,0.92)"}
                          strokeWidth={highlightedSliceKey === entry.key ? 3 : 1}
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
                <Fragment key={entry.key}>
                  {index === mainCount && index > 0 ? (
                    <p className="terminal-label px-1 pt-2">Dust · grouped in chart</p>
                  ) : null}
                  <div
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-panelSoft/65 px-3 py-2.5 text-sm transition hover:border-slate-500/70 hover:bg-[#151c25]"
                    onMouseEnter={() => setHoveredKey(entry.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className={entry.isDust ? "text-slate-400" : undefined}>{entry.name}</span>
                    </div>
                    <span className="tabular text-slate-300">{entry.pct.toFixed(2)}%</span>
                  </div>
                </Fragment>
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
