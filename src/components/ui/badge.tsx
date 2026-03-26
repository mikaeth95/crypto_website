import type { PropsWithChildren } from "react";
import { cn } from "../../lib/utils";

const toneMap = {
  default: "border-border bg-panelSoft text-slate-300",
  blue: "border-accent/35 bg-accent/10 text-[#b8c9ff]",
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  orange: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  red: "border-rose-500/30 bg-rose-500/10 text-rose-300",
} as const;

export const Badge = ({
  children,
  tone = "default",
}: PropsWithChildren<{ tone?: keyof typeof toneMap }>) => (
  <span
    className={cn(
      "inline-flex items-center rounded-md border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
      toneMap[tone],
    )}
  >
    {children}
  </span>
);
