import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import type { PerformanceDisplayRow } from "../../hooks/usePerformanceMarketData";
import { formatChartPercent, formatChartPrice } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { ChartPanel } from "../ui/chart-panel";

const POSITIVE_COLOR = "#22C55E";
const NEGATIVE_COLOR = "#EF4444";
const ACCENT_COLOR = "#4F7CFF";
const WATCH_COLOR = "#F59E0B";

type RankedBarDatum = {
  key: string;
  asset: string;
  value: number | null;
  magnitude: number;
};

type DrawdownRecoveryDatum = {
  key: string;
  asset: string;
  athDrawdown: number | null;
  recovery90D: number | null;
};

type Quadrant = "recovery" | "leaders" | "weak" | "watch";

type ScatterDatum = {
  key: string;
  asset: string;
  x: number;
  y: number;
  quadrant: Quadrant;
  currentPrice: number | null;
  avgBuy: number | null;
  quote: string;
  recoveryLabel: string;
  leaderLabel: string;
  weakestLabel: string;
};

type TooltipProps<T> = {
  active?: boolean;
  payload?: Array<{ payload?: T }>;
};

type RankedBarShapeProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  payload?: RankedBarDatum;
};

type PerformanceView = "top" | "bottom" | "all";
type DrawdownView = "worst" | "recovery" | "all";

const CompactViewSelector = <T extends string,>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) => (
  <div
    role="group"
    aria-label={label}
    className="inline-flex rounded-lg border border-border/80 bg-panelSoft/85 p-0.5"
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        aria-pressed={value === option.value}
        className={cn(
          "rounded-md px-2 py-1 text-[9px] font-medium text-slate-500 transition-colors hover:text-slate-300",
          value === option.value && "bg-white/[0.07] text-slate-100",
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const getQuadrant = (x: number, y: number): Quadrant => {
  if (y >= 0) {
    return x < 0 ? "recovery" : "leaders";
  }

  return x < 0 ? "weak" : "watch";
};

const quadrantLabels: Record<Quadrant, string> = {
  recovery: "Recovery Candidates",
  leaders: "Leaders",
  weak: "Weak / Falling",
  watch: "Watch",
};

const quadrantColors: Record<Quadrant, string> = {
  recovery: POSITIVE_COLOR,
  leaders: ACCENT_COLOR,
  weak: NEGATIVE_COLOR,
  watch: WATCH_COLOR,
};

const buildZeroDomain = (values: number[]) => {
  if (values.length === 0) {
    return [-10, 10] as const;
  }

  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min;
  const padding = Math.max(span * 0.1, 3);

  return [min === 0 ? -padding : min - padding, max === 0 ? padding : max + padding] as const;
};

const toRankedBarDatum = (row: PerformanceDisplayRow, value: number | null): RankedBarDatum => ({
  key: `${row.asset}-${row.quote}`,
  asset: row.asset,
  value,
  magnitude: Math.abs(value ?? 0),
});

const toDrawdownRecoveryDatum = (row: PerformanceDisplayRow): DrawdownRecoveryDatum => ({
  key: `${row.asset}-${row.quote}`,
  asset: row.asset,
  athDrawdown: row.athDrawdownResolved,
  recovery90D:
    row.currentPriceResolved !== null && row.low90DResolved !== null && row.low90DResolved > 0
      ? ((row.currentPriceResolved / row.low90DResolved) - 1) * 100
      : null,
});

const RankedPercentTooltip = ({ active, payload }: TooltipProps<RankedBarDatum>) => {
  const row = payload?.[0]?.payload;

  if (!active || !row) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-panelSoft/95 px-3 py-2 shadow-xl">
      <p className="text-xs font-semibold text-slate-100">{row.asset}</p>
      <p className={`tabular mt-1 text-xs ${row.value === null ? "text-slate-400" : row.value >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
        {formatChartPercent(row.value, { signed: true })}
      </p>
    </div>
  );
};

const ScatterPercentTooltip = ({ active, payload }: TooltipProps<ScatterDatum>) => {
  const row = payload?.[0]?.payload;

  if (!active || !row) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-panelSoft/95 px-3 py-2 shadow-xl">
      <p className="text-xs font-semibold text-slate-100">{row.asset}</p>
      <div className="tabular mt-1.5 space-y-1 text-[11px] text-slate-300">
        <p>30D Performance: {formatChartPercent(row.y, { signed: true })}</p>
        <p>Distance from Avg Buy: {formatChartPercent(row.x, { signed: true })}</p>
        <p>Current Price: {formatChartPrice(row.currentPrice, row.quote)}</p>
        <p>Avg Buy: {formatChartPrice(row.avgBuy, row.quote)}</p>
        <p style={{ color: quadrantColors[row.quadrant] }}>{quadrantLabels[row.quadrant]}</p>
      </div>
    </div>
  );
};

const RankedBarShape = ({ x = 0, y = 0, width = 0, height = 0, payload }: RankedBarShapeProps) => {
  const numericValue = payload?.value;

  if (numericValue === undefined) {
    return null;
  }

  const numericX = Number(x);
  const numericY = Number(y);
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  const hasValue = numericValue !== null && Number.isFinite(numericValue);
  const renderedWidth = hasValue ? Math.max(numericWidth, 1) : 0;
  const color = hasValue ? (numericValue >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR) : "#64748B";

  return (
    <g>
      {hasValue ? (
        <rect
          x={numericX}
          y={numericY}
          width={renderedWidth}
          height={numericHeight}
          rx={Math.min(5, numericHeight / 2)}
          ry={Math.min(5, numericHeight / 2)}
          fill={color}
        />
      ) : null}
      <text
        x={numericX + renderedWidth + 7}
        y={numericY + numericHeight / 2}
        dy="0.35em"
        fill={color}
        fontSize={10}
        fontWeight={600}
        textAnchor="start"
      >
        {formatChartPercent(numericValue, { signed: true })}
      </text>
    </g>
  );
};

const RankedBarList = ({
  data,
  height,
  maxMagnitude = Math.max(1, ...data.map((row) => row.magnitude)),
}: {
  data: RankedBarDatum[];
  height: number;
  maxMagnitude?: number;
}) => {
  if (!data.length) {
    return <div className="flex items-center justify-center text-xs text-slate-500" style={{ height }}>No data</div>;
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 68, bottom: 2, left: 0 }}>
          <CartesianGrid stroke="#1e2630" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" dataKey="magnitude" hide domain={[0, maxMagnitude]} />
          <YAxis
            type="category"
            dataKey="asset"
            width={44}
            interval={0}
            tick={{ fill: "#CBD5E1", fontSize: 10, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.025)" }} content={<RankedPercentTooltip />} />
          <Bar
            dataKey="magnitude"
            barSize={9}
            minPointSize={1}
            shape={<RankedBarShape />}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const DrawdownRecoveryAssetRow = ({
  row,
  maxMagnitude,
}: {
  row: DrawdownRecoveryDatum;
  maxMagnitude: number;
}) => {
  const barWidth = (value: number) => `${Math.max(1.5, (Math.abs(value) / maxMagnitude) * 100)}%`;

  return (
    <div className="grid h-7 shrink-0 grid-cols-[40px_28px_minmax(0,1fr)_52px] grid-rows-[9px_9px] items-center gap-x-2 gap-y-0.5 border-b border-border/30 py-0.5 last:border-b-0">
      <span className="row-span-2 self-center truncate text-[10px] font-semibold leading-none text-slate-200">{row.asset}</span>

      <span className="font-mono text-[8px] font-medium uppercase leading-none tracking-[0.08em] text-emerald-300/70">90D</span>
      <span className={cn("h-1.5 overflow-hidden rounded-full", row.recovery90D === null ? "bg-white/[0.035]" : "bg-emerald-500/10")}>
        {row.recovery90D !== null ? (
          <span
            className="block h-full min-w-px rounded-full bg-emerald-500"
            style={{ width: barWidth(row.recovery90D) }}
          />
        ) : null}
      </span>
      <span className={cn("tabular text-right text-[9px] font-semibold leading-none", row.recovery90D === null ? "text-slate-500" : "text-emerald-300")}>
        {formatChartPercent(row.recovery90D, { signed: true })}
      </span>

      <span className="font-mono text-[8px] font-medium uppercase leading-none tracking-[0.08em] text-rose-300/70">ATH</span>
      <span className={cn("h-1.5 overflow-hidden rounded-full", row.athDrawdown === null ? "bg-white/[0.035]" : "bg-rose-500/10")}>
        {row.athDrawdown !== null ? (
          <span
            className="block h-full min-w-px rounded-full bg-rose-500"
            style={{ width: barWidth(row.athDrawdown) }}
          />
        ) : null}
      </span>
      <span className={cn("tabular text-right text-[9px] font-semibold leading-none", row.athDrawdown === null ? "text-slate-500" : "text-rose-300")}>
        {formatChartPercent(row.athDrawdown, { signed: true })}
      </span>
    </div>
  );
};

const DrawdownRecoveryList = ({ data }: { data: DrawdownRecoveryDatum[] }) => {
  if (!data.length) {
    return <div className="flex h-56 items-center justify-center text-xs text-slate-500">No data</div>;
  }

  const maxMagnitude = Math.max(
    1,
    ...data.flatMap((row) => [Math.abs(row.athDrawdown ?? 0), Math.abs(row.recovery90D ?? 0)]),
  );

  return (
    <div className="h-56 overflow-y-auto pr-1">
      <div style={{ height: data.length * 28 }}>
        {data.map((row) => (
          <DrawdownRecoveryAssetRow key={row.key} row={row} maxMagnitude={maxMagnitude} />
        ))}
      </div>
    </div>
  );
};

const pickQuadrantRepresentative = (rows: ScatterDatum[], quadrant: Quadrant) => {
  const matches = rows.filter((row) => row.quadrant === quadrant);

  if (quadrant === "recovery" || quadrant === "leaders") {
    return matches.sort((left, right) => right.y - left.y)[0];
  }

  return matches.sort((left, right) => left.y - right.y)[0];
};

export const PerformanceCharts = ({ rows }: { rows: PerformanceDisplayRow[] }) => {
  const [performanceView, setPerformanceView] = useState<PerformanceView>("top");
  const [drawdownView, setDrawdownView] = useState<DrawdownView>("worst");
  const allPerformanceRows = [...rows].sort((left, right) => {
    if (left.change30D === null) return right.change30D === null ? 0 : 1;
    if (right.change30D === null) return -1;
    return right.change30D - left.change30D;
  });
  const rowsWith30D = allPerformanceRows
    .filter((row): row is PerformanceDisplayRow & { change30D: number } => row.change30D !== null)
    .sort((left, right) => right.change30D - left.change30D);
  const topPerformers = rowsWith30D.slice(0, 5);
  const bottomPerformers = [...rowsWith30D]
    .sort((left, right) => left.change30D - right.change30D)
    .slice(0, 5);
  const selectedPerformanceRows =
    performanceView === "top" ? topPerformers : performanceView === "bottom" ? bottomPerformers : allPerformanceRows;
  const performanceData = selectedPerformanceRows.map((row) => toRankedBarDatum(row, row.change30D));
  const performanceMaxMagnitude = Math.max(
    1,
    ...performanceData.map((row) => row.magnitude),
  );
  const performanceSectionLabel =
    performanceView === "top" ? "Top performers" : performanceView === "bottom" ? "Bottom performers" : "All assets";
  const strongest = rowsWith30D[0];
  const weakest30D = bottomPerformers[0];
  const performanceSummary = performanceView === "bottom" ? weakest30D : strongest;

  const rowsWithAthDrawdown = [...rows]
    .filter(
      (row): row is PerformanceDisplayRow & { athDrawdownResolved: number } =>
        row.athDrawdownResolved !== null,
    )
    .sort((left, right) => left.athDrawdownResolved - right.athDrawdownResolved);
  const allDrawdownRecoveryData = [...rows]
    .sort((left, right) => {
      if (left.athDrawdownResolved === null) return right.athDrawdownResolved === null ? 0 : 1;
      if (right.athDrawdownResolved === null) return -1;
      return left.athDrawdownResolved - right.athDrawdownResolved;
    })
    .map(toDrawdownRecoveryDatum);
  const worstDrawdownData = rowsWithAthDrawdown.slice(0, 8).map(toDrawdownRecoveryDatum);
  const recoveryData = [...allDrawdownRecoveryData]
    .filter((row): row is DrawdownRecoveryDatum & { recovery90D: number } => row.recovery90D !== null)
    .sort((left, right) => right.recovery90D - left.recovery90D)
    .slice(0, 8);
  const drawdownRecoveryData =
    drawdownView === "worst"
      ? worstDrawdownData
      : drawdownView === "recovery"
        ? recoveryData
        : allDrawdownRecoveryData;
  const strongestRecovery = recoveryData[0];

  const scatterRows: ScatterDatum[] = rows
    .filter(
      (row) =>
        row.change30D !== null &&
        row.distanceAvgPct !== null &&
        row.asset.toUpperCase() !== row.quote.toUpperCase(),
    )
    .map((row) => {
      const x = row.distanceAvgPct as number;
      const y = row.change30D as number;

      return {
        key: `${row.asset}-${row.quote}`,
        asset: row.asset,
        x,
        y,
        quadrant: getQuadrant(x, y),
        currentPrice: row.currentPriceResolved,
        avgBuy: row.avgBuy,
        quote: row.quote,
        recoveryLabel: "",
        leaderLabel: "",
        weakestLabel: "",
      };
    });
  const recoveryCandidate = pickQuadrantRepresentative(scatterRows, "recovery");
  const strongestLeader = pickQuadrantRepresentative(scatterRows, "leaders");
  const weakestMomentum = [...scatterRows].filter((row) => row.y < 0).sort((left, right) => left.y - right.y)[0];
  const labeledScatterRows = scatterRows.map((row) => ({
    ...row,
    recoveryLabel: row.key === recoveryCandidate?.key ? row.asset : "",
    leaderLabel: row.key === strongestLeader?.key ? row.asset : "",
    weakestLabel: row.key === weakestMomentum?.key ? row.asset : "",
  }));
  const weakestAth = rowsWithAthDrawdown[0];
  const scatterXDomain = buildZeroDomain(scatterRows.map((row) => row.x));
  const scatterYDomain = buildZeroDomain(scatterRows.map((row) => row.y));

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <ChartPanel
        title="30D Performance"
        subtitle="Which assets are gaining or losing momentum?"
        action={
          <div className="flex flex-col items-end gap-1.5">
            <CompactViewSelector
              value={performanceView}
              onChange={setPerformanceView}
              label="30D performance view"
              options={[
                { value: "top", label: "Top" },
                { value: "bottom", label: "Bottom" },
                { value: "all", label: "All" },
              ]}
            />
            {performanceSummary ? (
              <Badge tone={performanceSummary.change30D >= 0 ? "green" : "red"}>
                {performanceView === "bottom" ? "Worst" : "Best"}: {performanceSummary.asset}{" "}
                {formatChartPercent(performanceSummary.change30D, { signed: true })}
              </Badge>
            ) : null}
          </div>
        }
      >
        <div className="flex h-56 flex-col">
          <p className="terminal-label mb-1">{performanceSectionLabel}</p>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <RankedBarList
              data={performanceData}
              height={Math.max(196, performanceData.length * 24)}
              maxMagnitude={performanceMaxMagnitude}
            />
          </div>
        </div>
      </ChartPanel>

      <ChartPanel
        title="Drawdown & Recovery"
        subtitle="How far each asset is below its peak and how strongly it has rebounded from its 90D low."
        headerClassName="px-4 py-3"
        bodyClassName="px-4 py-3"
        action={
          <div className="flex flex-col items-end gap-1.5">
            <CompactViewSelector
              value={drawdownView}
              onChange={setDrawdownView}
              label="Drawdown and recovery view"
              options={[
                { value: "worst", label: "Worst" },
                { value: "recovery", label: "Recovery" },
                { value: "all", label: "All" },
              ]}
            />
            {drawdownView === "worst" && weakestAth ? (
              <Badge tone="red">
                Worst: {weakestAth.asset} {formatChartPercent(weakestAth.athDrawdownResolved, { signed: true })}
              </Badge>
            ) : strongestRecovery ? (
              <Badge tone="green">
                Recovery: {strongestRecovery.asset} {formatChartPercent(strongestRecovery.recovery90D, { signed: true })}
              </Badge>
            ) : null}
          </div>
        }
      >
        <DrawdownRecoveryList data={drawdownRecoveryData} />
      </ChartPanel>

      <ChartPanel
        title="Momentum vs Entry"
        subtitle="Which positions are recovering relative to your buy price?"
        headerClassName="px-4 py-3"
        bodyClassName="px-3 py-3"
      >
        <div className="relative h-60">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 text-[8px] font-medium uppercase tracking-[0.08em]"
          >
            <span className="absolute left-[68px] top-5 text-emerald-300/45">Recovery Candidates</span>
            <span className="absolute right-6 top-5 text-blue-300/45">Leaders</span>
            <span className="absolute bottom-[48px] left-14 text-[7px] text-rose-300/30">Weak / Falling</span>
            <span className="absolute bottom-[48px] right-3.5 text-[7px] text-amber-300/30">Watch</span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 8, bottom: 18, left: 6 }}>
              <CartesianGrid stroke="#1e2630" strokeDasharray="3 3" />
              <ReferenceArea
                x1={scatterXDomain[0]}
                x2={0}
                y1={0}
                y2={scatterYDomain[1]}
                fill={POSITIVE_COLOR}
                fillOpacity={0.035}
              />
              <ReferenceArea
                x1={0}
                x2={scatterXDomain[1]}
                y1={0}
                y2={scatterYDomain[1]}
                fill={ACCENT_COLOR}
                fillOpacity={0.035}
              />
              <ReferenceArea
                x1={scatterXDomain[0]}
                x2={0}
                y1={scatterYDomain[0]}
                y2={0}
                fill={NEGATIVE_COLOR}
                fillOpacity={0.03}
              />
              <ReferenceArea
                x1={0}
                x2={scatterXDomain[1]}
                y1={scatterYDomain[0]}
                y2={0}
                fill={WATCH_COLOR}
                fillOpacity={0.025}
              />
              <ReferenceLine x={0} stroke="#7C8BA1" strokeOpacity={0.85} strokeWidth={1.5} />
              <ReferenceLine y={0} stroke="#7C8BA1" strokeOpacity={0.85} strokeWidth={1.5} />
              <XAxis
                dataKey="x"
                name="Distance from Avg Buy"
                type="number"
                domain={scatterXDomain}
                tickFormatter={(value) => formatChartPercent(Number(value))}
                tickCount={5}
                tick={{ fill: "#8A97A8", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                label={{ value: "Distance from Avg Buy", position: "insideBottom", offset: -18, fill: "#64748B", fontSize: 9 }}
              />
              <YAxis
                dataKey="y"
                name="30D Performance"
                type="number"
                domain={scatterYDomain}
                tickFormatter={(value) => formatChartPercent(Number(value))}
                tickCount={5}
                width={44}
                tick={{ fill: "#8A97A8", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                label={{ value: "30D Performance", angle: -90, position: "insideLeft", offset: -5, fill: "#64748B", fontSize: 9 }}
              />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterPercentTooltip />} />
              <Scatter data={labeledScatterRows} shape="circle">
                <LabelList dataKey="recoveryLabel" position="right" offset={10} className="fill-slate-300 text-[9px]" />
                <LabelList dataKey="leaderLabel" position="left" offset={10} className="fill-slate-300 text-[9px]" />
                <LabelList
                  dataKey="weakestLabel"
                  position={weakestMomentum?.quadrant === "weak" ? "top" : "left"}
                  offset={14}
                  className="fill-slate-300 text-[9px]"
                />
                {labeledScatterRows.map((row) => (
                  <Cell key={row.key} fill={quadrantColors[row.quadrant]} stroke="#0f141b" strokeWidth={1.5} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className={`tabular mt-1 text-xs leading-4 ${recoveryCandidate ? "text-emerald-300" : "text-slate-500"}`}>
          Strongest recovery candidate: {recoveryCandidate?.asset ?? "n/a"}
        </p>
      </ChartPanel>
    </div>
  );
};
