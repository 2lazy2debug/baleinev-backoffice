import { forwardRef } from "react";
import { cn } from "./cn";

type IconTone = "neutral" | "accent" | "delete" | "save" | "warning";

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: IconTone;
  /** Required — these buttons are icon-only, so this doubles as title + aria-label. */
  label: string;
};

// Fixed size for every icon action in the app: h-9 w-9 button, h-4 w-4 icon.
const base =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4";

// Tone = action type. neutral/accent/save/delete/warning cover every action color found in the audit.
const tones: Record<IconTone, string> = {
  neutral: "border-[var(--line)] text-[var(--muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]",
  accent: "border-[var(--line)] text-[var(--accent)] hover:bg-[var(--panel-strong)]",
  save: "border-emerald-400/60 text-emerald-400 hover:bg-emerald-950/40",
  delete: "border-rose-400/40 text-rose-300 hover:bg-rose-950/40",
  warning: "border-amber-400/40 text-amber-300 hover:bg-amber-950/40",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { tone = "neutral", label, className, children, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      title={label}
      aria-label={label}
      className={cn(base, tones[tone], className)}
      {...props}
    >
      {children}
    </button>
  );
});
