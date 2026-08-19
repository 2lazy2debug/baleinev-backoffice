import { forwardRef } from "react";
import { cn } from "./cn";
import { controlHeight, type ControlSize } from "./control";

// The one text-field recipe, shared by Input, Textarea and Select (imported from here).
// Heights come from the shared control scale so fields match buttons in the same row.
export const fieldSizeClasses: Record<ControlSize, string> = {
  md: cn(controlHeight.md, "px-3 text-sm"),
  sm: cn(controlHeight.sm, "px-2.5 text-xs"),
};

export const inputBaseClasses =
  "w-full rounded-md border border-[var(--line)] bg-[var(--panel)] outline-none transition focus:border-[var(--accent)] disabled:opacity-50";

/** For fields whose height is driven by their content — textareas, multi-selects.
 *  Same recipe, padding instead of a fixed height. */
export const autoHeightFieldClasses = cn(inputBaseClasses, "px-3 py-2 text-sm");

export function inputClasses(size: ControlSize = "md") {
  return cn(inputBaseClasses, fieldSizeClasses[size]);
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: ControlSize };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size = "md", ...props },
  ref,
) {
  return <input ref={ref} className={cn(inputClasses(size), className)} {...props} />;
});
