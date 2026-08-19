import { forwardRef } from "react";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "md" | "sm";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

// One height per size, shared by every button in the app — no more px-4 py-2 vs px-5 py-3 drift.
const sizes: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]",
  secondary: "border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--panel-strong)]",
  ghost: "text-[var(--muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]",
  destructive: "border border-rose-400/60 text-rose-300 hover:bg-rose-950/40",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(base, sizes[size], variants[variant], className)}
      {...props}
    />
  );
});
