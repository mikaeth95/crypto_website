import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export const PageHeader = ({
  title,
  description,
  action,
  updatedAt,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  updatedAt?: string | null;
  className?: string;
}) => {
  const updatedDate = updatedAt ? new Date(updatedAt) : null;
  const updatedLabel =
    updatedDate && !Number.isNaN(updatedDate.getTime())
      ? updatedDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn("mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-3", className)}
    >
      <div className="space-y-0.5">
        <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-slate-50 md:text-[28px]">{title}</h1>
        {description ? <p className="max-w-3xl text-sm leading-5 text-slate-400">{description}</p> : null}
      </div>
      {action || updatedLabel ? (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {action}
          {updatedLabel ? (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_7px_rgba(52,211,153,0.45)]" />
              <span className="text-emerald-300/80">Live</span>
              <span aria-hidden="true">·</span>
              <span>Updated {updatedLabel}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
};
