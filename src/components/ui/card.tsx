import type { PropsWithChildren } from "react";
import { cn } from "../../lib/utils";

export const Card = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <section
    className={cn(
      "relative overflow-hidden rounded-[18px] border border-border/90 bg-panel/95 p-4 shadow-[0_14px_34px_rgba(0,0,0,0.28)] transition-colors [caret-color:transparent] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/5",
      className,
    )}
  >
    {children}
  </section>
);
