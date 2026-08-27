import { forwardRef } from "react";
import { cn } from "./cn";
import { controlHeight, type ControlSize } from "./control";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ControlSize;
  /**
   * Leading icon, drawn before the label. Also what is left of the button once
   * `compactOnMobile` drops the label, so that prop needs one.
   */
  icon?: React.ReactNode;
  /**
   * Below `lg` the label is dropped and the button takes the square <IconButton>
   * footprint — for an action row that fits a desktop header but not a phone.
   * Needs `icon`, and `children` must be plain text: it stops being drawn but
   * stays the accessible name.
   */
  compactOnMobile?: boolean;
};

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

// One height per size, straight from the shared control scale — a button and a
// field of the same size are always the same height.
const sizes: Record<ControlSize, string> = {
  md: cn(controlHeight.md, "px-4 text-xs"),
  sm: cn(controlHeight.sm, "px-3 text-2xs"),
};

// The compact half of the same scale: the widths mirror `controlSquare`, so a
// label-less button and the <IconButton> next to it are the same square.
const compactWidths: Record<ControlSize, string> = {
  md: "w-11 px-0 lg:w-auto lg:px-4",
  sm: "w-11 px-0 lg:w-auto lg:px-3",
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
  { variant = "secondary", size = "md", icon, compactOnMobile = false, className, type, children, ...props },
  ref,
) {
  // Only meaningful once the label is hidden, but harmless above `lg` — where it
  // reads as the tooltip a labelled action would want anyway.
  const label = compactOnMobile && typeof children === "string" ? children : undefined;

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      title={label}
      aria-label={label}
      className={buttonClasses(variant, size, cn(compactOnMobile ? compactWidths[size] : null, className))}
      {...props}
    >
      {icon}
      {compactOnMobile ? <span className="hidden lg:inline">{children}</span> : children}
    </button>
  );
});
