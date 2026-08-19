import { forwardRef } from "react";
import { cn } from "./cn";
import { controlHeight, type ControlSize } from "./control";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ControlSize;
};

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

// One height per size, straight from the shared control scale — a button and a
// field of the same size are always the same height.
const sizes: Record<ControlSize, string> = {
  md: cn(controlHeight.md, "px-4 text-xs"),
  sm: cn(controlHeight.sm, "px-3 text-2xs"),
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]",
  secondary: "border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--panel-strong)]",
  ghost: "text-[var(--muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]",
  destructive: "border border-rose-400/60 text-rose-300 hover:bg-rose-950/40",
};

/** Same recipe for elements that are links but read as buttons (`<Link href…>`). */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ControlSize = "md", className?: string) {
  return cn(base, sizes[size], variants[variant], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
});
