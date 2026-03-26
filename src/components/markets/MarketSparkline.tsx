import { useId } from "react";
import { cn } from "../../lib/utils";
import type { MarketSparklinePoint } from "../../hooks/useMarketSparklineData";

const POSITIVE_COLOR = "#22C55E";
const NEGATIVE_COLOR = "#EF4444";
const NEUTRAL_COLOR = "#4F7CFF";
const CHART_WIDTH = 100;
const CHART_HEIGHT = 42;
const CHART_PADDING = 3;

const buildLinePath = (points: MarketSparklinePoint[]) => {
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;

  return points
    .map((point, index) => {
      const x =
        CHART_PADDING +
        (index / Math.max(points.length - 1, 1)) * (CHART_WIDTH - CHART_PADDING * 2);
      const y =
        CHART_HEIGHT -
        CHART_PADDING -
        ((point.value - minValue) / valueRange) * (CHART_HEIGHT - CHART_PADDING * 2);

      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
};

const buildAreaPath = (points: MarketSparklinePoint[]) => {
  const linePath = buildLinePath(points);

  return `${linePath} L ${CHART_WIDTH - CHART_PADDING} ${CHART_HEIGHT - CHART_PADDING} L ${CHART_PADDING} ${
    CHART_HEIGHT - CHART_PADDING
  } Z`;
};

export const MarketSparkline = ({
  points,
  positive,
  loading = false,
  className,
}: {
  points: MarketSparklinePoint[];
  positive: boolean | null;
  loading?: boolean;
  className?: string;
}) => {
  const gradientId = useId().replace(/:/g, "");
  const strokeColor =
    positive === null ? NEUTRAL_COLOR : positive ? POSITIVE_COLOR : NEGATIVE_COLOR;

  return (
    <div
      className={cn(
        "h-24 w-full overflow-hidden rounded-[14px] border border-border/80 bg-[#0d131a]",
        className,
      )}
    >
      {loading && points.length < 2 ? (
        <div className="h-full w-full animate-pulse bg-[#151c25]" />
      ) : points.length >= 2 ? (
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.24" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`M ${CHART_PADDING} ${CHART_HEIGHT - CHART_PADDING} H ${CHART_WIDTH - CHART_PADDING}`}
            stroke="rgba(30, 38, 48, 0.95)"
            strokeWidth="1"
            fill="none"
          />
          <path d={buildAreaPath(points)} fill={`url(#${gradientId})`} />
          <path
            d={buildLinePath(points)}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
          No chart data
        </div>
      )}
    </div>
  );
};
