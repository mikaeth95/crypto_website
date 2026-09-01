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
import type { PerformanceDisplayRow } from "../../hooks/usePerformanceMarketData";
import { formatChartPercent } from "../../lib/formatters";
import { Badge } from "../ui/badge";
import { ChartPanel } from "../ui/chart-panel";

const POSITIVE_COLOR = "#22C55E";
const NEGATIVE_COLOR = "#EF4444";
const ACCENT_COLOR = "#4F7CFF";
const WATCH_COLOR = "#F59E0B";

type RankedBarDatum = {
  key: string;
  asset: string;
  value: number;
  magnitude: number;
};

type Quadrant = "recovery" | "leaders" | "weak" | "watch";

type ScatterDatum = {
  key: string;
  asset: string;
  x: number;
  y: number;
  quadrant: Quadrant;
  label: string;
};

type TooltipProps<T> = {
  active?: boolean;
  payload?: Array<{ payload?: T }>;
};

type BarValueLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
};

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

const toRankedBarDatum = (row: PerformanceDisplayRow, value: number): RankedBarDatum => ({
  key: `${row.asset}-${row.quote}`,
  asset: row.asset,
  value,
  magnitude: Math.abs(value),
});

const RankedPercentTooltip = ({ active, payload }: TooltipProps<RankedBarDatum>) => {
  const row = payload?.[0]?.payload;

  if (!active || !row) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-panelSoft/95 px-3 py-2 shadow-xl">
      <p className="text-xs font-semibold text-slate-100">{row.asset}</p>
      <p className={`tabular mt-1 text-xs ${row.value >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
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
        <p>Distance from Avg Buy: {formatChartPercent(row.x, { signed: true })}</p>
        <p>30D Performance: {formatChartPercent(row.y, { signed: true })}</p>
        <p style={{ color: quadrantColors[row.quadrant] }}>{quadrantLabels[row.quadrant]}</p>
      </div>
    </div>
  );
};

const RankedBarValueLabel = ({ x = 0, y = 0, width = 0, height = 0, value }: BarValueLabelProps) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return (
    <text
      x={Number(x) + Number(width) + 7}
      y={Number(y) + Number(height) / 2}
      dy="0.35em"
      fill={numericValue >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR}
      fontSize={10}
      fontWeight={600}
      textAnchor="start"
    >
      {formatChartPercent(numericValue, { signed: true })}
    </text>
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
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 58, bottom: 2, left: 0 }}>
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
          <Bar dataKey="magnitude" barSize={9} radius={[0, 5, 5, 0]}>
            {data.map((row) => (
              <Cell key={row.key} fill={row.value >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR} />
            ))}
            <LabelList dataKey="value" content={<RankedBarValueLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
  const rowsWith30D = [...rows]
    .filter((row): row is PerformanceDisplayRow & { change30D: number } => row.change30D !== null)
    .sort((left, right) => right.change30D - left.change30D);
  const topPerformers = rowsWith30D.slice(0, 5);
  const topPerformerKeys = new Set(topPerformers.map((row) => `${row.asset}-${row.quote}`));
  const bottomPerformers = [...rowsWith30D]
    .sort((left, right) => left.change30D - right.change30D)
    .filter((row) => !topPerformerKeys.has(`${row.asset}-${row.quote}`))
    .slice(0, 5);
  const topPerformanceData = topPerformers.map((row) => toRankedBarDatum(row, row.change30D));
  const bottomPerformanceData = bottomPerformers.map((row) => toRankedBarDatum(row, row.change30D));
  const performanceMaxMagnitude = Math.max(
    1,
    ...topPerformanceData.map((row) => row.magnitude),
    ...bottomPerformanceData.map((row) => row.magnitude),
  );

  const rowsWithAthDrawdown = [...rows]
    .filter(
      (row): row is PerformanceDisplayRow & { athDrawdownResolved: number } =>
        row.athDrawdownResolved !== null,
    )
    .sort((left, right) => left.athDrawdownResolved - right.athDrawdownResolved);
  const athDrawdownData = rowsWithAthDrawdown
    .slice(0, 8)
    .map((row) => toRankedBarDatum(row, row.athDrawdownResolved));
  const athMaxMagnitude = Math.max(1, ...athDrawdownData.map((row) => row.magnitude));

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
        label: "",
      };
    });
  const labeledKeys = new Set(
    (["recovery", "leaders", "weak", "watch"] as Quadrant[])
      .map((quadrant) => pickQuadrantRepresentative(scatterRows, quadrant)?.key)
      .filter((key): key is string => Boolean(key)),
  );
  const labeledScatterRows = scatterRows.map((row) => ({
    ...row,
    label: labeledKeys.has(row.key) ? row.asset : "",
  }));
  const recoveryCandidate = pickQuadrantRepresentative(scatterRows, "recovery");
  const strongest = rowsWith30D[0];
  const weakestAth = rowsWithAthDrawdown[0];
  const scatterXDomain = buildZeroDomain(scatterRows.map((row) => row.x));
  const scatterYDomain = buildZeroDomain(scatterRows.map((row) => row.y));

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <ChartPanel
        title="30D Performance"
        subtitle="Which assets are gaining or losing momentum?"
        action={
          strongest ? (
            <Badge tone={strongest.change30D >= 0 ? "green" : "red"}>
              Best: {strongest.asset} {formatChartPercent(strongest.change30D, { signed: true })}
            </Badge>
          ) : null
        }
      >
        <div className="h-64">
          <p className="terminal-label mb-1">Top performers</p>
          <RankedBarList data={topPerformanceData} height={104} maxMagnitude={performanceMaxMagnitude} />
          <p className="terminal-label mb-1 mt-2">Bottom performers</p>
          <RankedBarList data={bottomPerformanceData} height={104} maxMagnitude={performanceMaxMagnitude} />
        </div>
      </ChartPanel>

      <ChartPanel
        title="Distance from ATH"
        subtitle="Which assets remain furthest below their peak?"
        action={
          weakestAth ? (
            <Badge tone="red">
              Worst: {weakestAth.asset} {formatChartPercent(weakestAth.athDrawdownResolved, { signed: true })}
            </Badge>
          ) : null
        }
      >
        <RankedBarList data={athDrawdownData} height={256} maxMagnitude={athMaxMagnitude} />
      </ChartPanel>

      <ChartPanel title="Momentum vs Entry" subtitle="Which positions are recovering relative to your buy price?">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 18, right: 16, bottom: 24, left: 14 }}>
              <CartesianGrid stroke="#1e2630" strokeDasharray="3 3" />
              <ReferenceArea
                x1={scatterXDomain[0]}
                x2={0}
                y1={0}
                y2={scatterYDomain[1]}
                fill={POSITIVE_COLOR}
                fillOpacity={0.035}
                label={{ value: quadrantLabels.recovery, position: "insideTopLeft", fill: "#6EE7B7", fontSize: 9 }}
              />
              <ReferenceArea
                x1={0}
                x2={scatterXDomain[1]}
                y1={0}
                y2={scatterYDomain[1]}
                fill={ACCENT_COLOR}
                fillOpacity={0.035}
                label={{ value: quadrantLabels.leaders, position: "insideTopRight", fill: "#9AB1FF", fontSize: 9 }}
              />
              <ReferenceArea
                x1={scatterXDomain[0]}
                x2={0}
                y1={scatterYDomain[0]}
                y2={0}
                fill={NEGATIVE_COLOR}
                fillOpacity={0.03}
                label={{ value: quadrantLabels.weak, position: "insideBottomLeft", fill: "#FDA4AF", fontSize: 9 }}
              />
              <ReferenceArea
                x1={0}
                x2={scatterXDomain[1]}
                y1={scatterYDomain[0]}
                y2={0}
                fill={WATCH_COLOR}
                fillOpacity={0.025}
                label={{ value: quadrantLabels.watch, position: "insideBottomRight", fill: "#FCD34D", fontSize: 9 }}
              />
              <ReferenceLine x={0} stroke="#64748B" strokeWidth={1.2} />
              <ReferenceLine y={0} stroke="#64748B" strokeWidth={1.2} />
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
                width={48}
                tick={{ fill: "#8A97A8", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                label={{ value: "30D Performance", angle: -90, position: "insideLeft", offset: -5, fill: "#64748B", fontSize: 9 }}
              />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterPercentTooltip />} />
              <Scatter data={labeledScatterRows} shape="circle">
                <LabelList dataKey="label" position="top" offset={8} className="fill-slate-300 text-[9px]" />
                {labeledScatterRows.map((row) => (
                  <Cell key={row.key} fill={quadrantColors[row.quadrant]} stroke="#0f141b" strokeWidth={1.5} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className={`tabular mt-2 text-xs ${recoveryCandidate ? "text-emerald-300" : "text-slate-500"}`}>
          Strongest recovery candidate: {recoveryCandidate?.asset ?? "n/a"}
        </p>
      </ChartPanel>
    </div>
  );
};
