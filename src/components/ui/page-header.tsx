import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export const PageHeader = ({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className={cn("mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border/80 pb-4", className)}
  >
    <div className="space-y-1">
      <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-slate-50 md:text-[32px]">{title}</h1>
      {description ? <p className="max-w-3xl text-sm leading-6 text-slate-400">{description}</p> : null}
    </div>
    {action}
  </motion.div>
);
