import { forwardRef } from "react";
import { cn } from "./cn";
import { controlHeight, type ControlSize } from "./control";

// The one text-field recipe, shared by Input, Textarea and Select (imported from here).
// Heights come from the shared control scale so fields match buttons in the same row.
export const fieldSizeClasses: Record<ControlSize, string> = {
  md: cn(controlHeight.md, "px-3 text-sm"),
  sm: cn(controlHeight.sm, "px-2.5 text-xs"),
};

// `rounded-lg` (8px), not the button's `rounded-md` (5px): the mockups give a field a
// softer corner than the control next to it, so the row reads as a field plus a button
// rather than one undifferentiated strip.
export const inputBaseClasses =
  "w-full rounded-lg border bg-[var(--panel)] outline-none transition focus:border-[var(--accent)] disabled:opacity-50";

/** Border colour of a field: the line token, or rose when the field is the risky one. */
const fieldTones = {
  default: "border-[var(--line)]",
  danger: "border-rose-400/60",
} as const;

type FieldTone = keyof typeof fieldTones;

/** Borderless variant for fields that live inside a table cell and provide their own frame. */
const bareFieldClasses = "w-full bg-transparent outline-none disabled:opacity-50";

/** For fields whose height is driven by their content — textareas, multi-selects.
 *  Same recipe, padding instead of a fixed height. */
export const autoHeightFieldClasses = cn(inputBaseClasses, fieldTones.default, "px-3 py-2");

export function inputClasses(size: ControlSize = "md", tone: FieldTone = "default") {
  return cn(inputBaseClasses, fieldTones[tone], fieldSizeClasses[size]);
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: ControlSize;
  tone?: FieldTone;
  /** No frame — for inputs inside a table cell, where the cell is the frame. */
  bare?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size = "md", tone = "default", bare = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(bare ? bareFieldClasses : inputClasses(size, tone), className)}
      {...props}
    />
  );
});
