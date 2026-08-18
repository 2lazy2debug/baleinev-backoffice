import { forwardRef } from "react";
import { cn } from "./cn";

type FieldSize = "md" | "compact";

// The one text-field recipe, shared by Input, Textarea and Select (imported from here).
export const fieldSizeClasses: Record<FieldSize, string> = {
  md: "rounded-2xl px-4 py-3 text-sm",
  compact: "rounded-md px-2.5 py-1.5 text-sm", // e.g. sidebar pickers — named, not ad hoc
};

export const inputBaseClasses =
  "w-full border border-[var(--line)] bg-[var(--panel)] outline-none transition focus:border-[var(--accent)] disabled:opacity-50";

export function inputClasses(size: FieldSize = "md") {
  return cn(inputBaseClasses, fieldSizeClasses[size]);
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: FieldSize };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size = "md", ...props },
  ref,
) {
  return <input ref={ref} className={cn(inputClasses(size), className)} {...props} />;
});
