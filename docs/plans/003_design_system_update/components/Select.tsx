import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { inputClasses } from "./Input";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { size?: "md" | "compact" };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, size = "md", children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(inputClasses(size), "appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
    </div>
  );
});
