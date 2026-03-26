import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PerformanceDisplayRow } from "../../hooks/usePerformanceMarketData";
import { formatPercent, signedClass } from "../../lib/formatters";
import { Badge } from "../ui/badge";
import { ChartPanel } from "../ui/chart-panel";

const buildDomain = (values: number[]) => {
  if (values.length === 0) {
    return [-10, 10] as const;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.15, 5);
    return [min - padding, max + padding] as const;
  }

  const padding = Math.max((max - min) * 0.12, 3);

  return [min - padding, max + padding] as const;
};

export const PerformanceCharts = ({ rows }: { rows: PerformanceDisplayRow[] }) => {
  const rowsWith30D = [...rows]
    .filter((row) => row.change30D !== null)
    .sort((a, b) => (b.change30D ?? -Infinity) - (a.change30D ?? -Infinity));
  const rowsWithAthDrawdown = [...rows]
    .filter((row) => row.athDrawdownResolved !== null)
    .sort((a, b) => (a.athDrawdownResolved ?? Infinity) - (b.athDrawdownResolved ?? Infinity));
  const scatterRows = rows
    .filter(
      (row) =>
        row.change30D !== null &&
        row.distanceAvgPct !== null &&
        row.asset.toUpperCase() !== row.quote.toUpperCase(),
    )
    .sort((a, b) => (b.change30D ?? -Infinity) - (a.change30D ?? -Infinity));
  const strongest = rowsWith30D[0];
  const weakestAth = rowsWithAthDrawdown[0];
  const scatterXDomain = buildDomain(scatterRows.map((row) => row.distanceAvgPct ?? 0));
  const scatterYDomain = buildDomain(scatterRows.map((row) => row.change30D ?? 0));

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <ChartPanel
        title="30D Return Profile"
        subtitle="Short-term momentum across tracked assets"
        action={
          strongest ? (
            <Badge tone="green">
              Top: {strongest.asset} {formatPercent(strongest.change30D)}
            </Badge>
          ) : null
        }
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rowsWith30D}>
              <CartesianGrid stroke="#1e2630" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="asset" hide />
              <YAxis tick={{ fill: "#8A97A8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "rgba(15, 20, 27, 0.98)",
                  border: "1px solid rgba(30, 38, 48, 0.98)",
                  borderRadius: "0.75rem",
                }}
              />
              <Bar dataKey="change30D" radius={[6, 6, 2, 2]}>
                {rowsWith30D.map((r) => (
                  <Cell key={r.asset} fill={(r.change30D ?? 0) >= 0 ? "#22C55E" : "#EF4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>
      <ChartPanel
        title="ATH Drawdown"
        subtitle="Distance from each asset's all-time high"
        action={
          weakestAth ? (
            <Badge tone="red">
              Weakest: {weakestAth.asset} {formatPercent(weakestAth.athDrawdownResolved)}
            </Badge>
          ) : null
        }
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rowsWithAthDrawdown}>
              <CartesianGrid stroke="#1e2630" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="asset" hide />
              <YAxis tick={{ fill: "#8A97A8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "rgba(15, 20, 27, 0.98)",
                  border: "1px solid rgba(30, 38, 48, 0.98)",
                  borderRadius: "0.75rem",
                }}
              />
              <Bar dataKey="athDrawdownResolved" fill="#ef4444" radius={[6, 6, 2, 2]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>
      <ChartPanel title="Momentum vs Entry" subtitle="30D change relative to distance from average buy">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid stroke="#1e2630" strokeDasharray="3 3" />
              <ReferenceLine x={0} stroke="#334155" strokeDasharray="4 4" />
              <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
              <XAxis
                dataKey="distanceAvgPct"
                name="Distance Avg %"
                type="number"
                domain={scatterXDomain}
                tick={{ fill: "#8A97A8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="change30D"
                name="30D %"
                type="number"
                domain={scatterYDomain}
                tick={{ fill: "#8A97A8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "rgba(15, 20, 27, 0.98)",
                  border: "1px solid rgba(30, 38, 48, 0.98)",
                  borderRadius: "0.75rem",
                }}
                formatter={(value, name) => [formatPercent(value === undefined ? null : Number(value)), String(name)]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.asset ?? ""}
              />
              <Scatter data={scatterRows} fill="#4F7CFF" shape="circle">
                <LabelList dataKey="asset" position="top" offset={10} className="fill-slate-300 text-[10px]" />
                {scatterRows.map((row) => (
                  <Cell
                    key={`${row.asset}-${row.quote}`}
                    fill={(row.change30D ?? 0) >= 0 ? "#22C55E" : "#4F7CFF"}
                    stroke="#0f141b"
                    strokeWidth={1.5}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-3 text-xs">
          <p className={`tabular ${signedClass(strongest?.change30D)}`}>
            Strongest rebound candidate: {strongest?.asset ?? "n/a"}
          </p>
        </div>
      </ChartPanel>
    </div>
  );
};
