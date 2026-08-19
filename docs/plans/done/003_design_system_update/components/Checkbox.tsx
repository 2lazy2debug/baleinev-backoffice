import { forwardRef } from "react";
import { cn } from "./cn";

type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string };

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, id, ...props },
  ref,
) {
  const input = (
    <input
      ref={ref}
      type="checkbox"
      id={id}
      className={cn(
        "size-4 rounded-sm border-[var(--line)] bg-[var(--panel)] accent-[var(--accent)]",
        className,
      )}
      {...props}
    />
  );

  if (!label) {
    return input;
  }

  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      {input}
      {label}
    </label>
  );
});
