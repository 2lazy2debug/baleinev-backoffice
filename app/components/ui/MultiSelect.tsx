import { forwardRef } from "react";
import { cn } from "./cn";
import { autoHeightFieldClasses } from "./Input";

type MultiSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size" | "multiple"> & {
  /** Number of options to show before scrolling — clamped to 3–8 rows. */
  rows?: number;
};

// A multi-select is sized by its rows, not by the control-height scale, so it gets
// the auto-height field recipe. One component for the three department pickers.
export const MultiSelect = forwardRef<HTMLSelectElement, MultiSelectProps>(function MultiSelect(
  { rows = 3, className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      multiple
      size={Math.min(Math.max(rows, 3), 8)}
      className={cn(autoHeightFieldClasses, "text-sm", className)}
      {...props}
    >
      {children}
    </select>
  );
});
