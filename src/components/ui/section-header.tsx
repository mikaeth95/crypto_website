import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "../../lib/utils";

export const SectionHeader = ({
  title,
  description,
  action,
  className,
}: PropsWithChildren<{
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}>) => (
  <div className={cn("mb-4 flex items-start justify-between gap-3 border-b border-border/70 pb-3", className)}>
    <div>
      <h2 className="text-base font-semibold tracking-[-0.02em] text-slate-100 md:text-lg">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p> : null}
    </div>
    {action}
  </div>
);
