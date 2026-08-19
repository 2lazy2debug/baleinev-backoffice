import { forwardRef } from "react";
import { cn } from "./cn";

type RadioProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string };

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, className, id, ...props },
  ref,
) {
  const input = (
    <input
      ref={ref}
      type="radio"
      id={id}
      className={cn("size-4 border-[var(--line)] bg-[var(--panel)] accent-[var(--accent)]", className)}
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
