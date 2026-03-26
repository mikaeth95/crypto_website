import type { PropsWithChildren, ReactNode } from "react";
import { Card } from "./card";
import { cn } from "../../lib/utils";

export const ChartPanel = ({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
}>) => (
  <Card className={cn("overflow-hidden p-0", className)}>
    <div className="flex items-start justify-between gap-3 border-b border-border/80 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold tracking-[-0.01em] text-slate-100 md:text-base">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
    <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
  </Card>
);
