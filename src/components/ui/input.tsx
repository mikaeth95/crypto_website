import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={cn(
      "control-surface",
      props.className,
    )}
  />
);
