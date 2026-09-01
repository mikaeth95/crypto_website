import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "../../lib/utils";
import { Badge } from "./badge";
import { Card } from "./card";

export const KpiCard = ({
  label,
  value,
  subValue,
  valueClassName,
  subValueClassName,
  trendLabel,
  trendTone = "default",
  sparkline,
  className,
  wrapperClassName,
  icon,
  index = 0,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueClassName?: string;
  subValueClassName?: string;
  trendLabel?: string;
  trendTone?: "default" | "blue" | "green" | "orange" | "red";
  sparkline?: number[];
  className?: string;
  wrapperClassName?: string;
  icon?: ReactNode;
  index?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.28, delay: index * 0.05 }}
    className={wrapperClassName}
  >
    <Card
      className={cn(
        "h-full cursor-default border-border/80 bg-panelSoft/80 p-4",
        className,
      )}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="terminal-label">{label}</p>
            <p
              className={cn(
                "tabular mt-4 whitespace-nowrap text-[20px] font-semibold tracking-[-0.03em] text-slate-50 md:text-[22px]",
                valueClassName,
              )}
            >
              {value}
            </p>
            {subValue ? (
              <p className={cn("tabular mt-1 whitespace-nowrap text-sm text-slate-400", subValueClassName)}>
                {subValue}
              </p>
            ) : null}
          </div>
          {icon ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-panel text-slate-200">
              {icon}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-end justify-between gap-3 border-t border-border/70 pt-4">
          {trendLabel ? <Badge tone={trendTone}>{trendLabel}</Badge> : <span />}
          {sparkline?.length ? (
            <div className="h-10 w-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkline.map((v, i) => ({ i, v }))}>
                  <defs>
                    <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4F7CFF" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="#4F7CFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    dataKey="v"
                    stroke="#4F7CFF"
                    strokeWidth={1.75}
                    fill={`url(#spark-${label})`}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  </motion.div>
);
