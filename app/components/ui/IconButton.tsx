import { forwardRef } from "react";
import { cn } from "./cn";
import { iconControlSquare, type IconControlSize } from "./control";

type IconTone = "neutral" | "accent" | "primary" | "delete" | "save" | "warning";

type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  tone?: IconTone;
  size?: IconControlSize;
  /** Required — these buttons are icon-only, so this doubles as title + aria-label. */
  label: string;
};

// Square version of the shared control scale: `sm` for row actions — the common
// case — and `md` alongside full-size buttons. Both are a 44px touch target below
// `lg` and collapse to the dense desktop footprint above it. Icon is h-4 w-4; `touch` (till arrows) is taller, with an h-6 icon.
const base =
  "inline-flex shrink-0 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50";

// Tone = action type. neutral/accent/primary/save/delete/warning cover every action color in the app.
const tones: Record<IconTone, string> = {
  neutral: "border-[var(--line)] text-[var(--muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]",
  accent: "border-[var(--line)] text-[var(--accent)] hover:bg-[var(--panel-strong)]",
  primary: "border-transparent bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]",
  save: "border-emerald-400/60 text-emerald-400 hover:bg-emerald-950/40",
  delete: "border-rose-400/40 text-rose-300 hover:bg-rose-950/40",
  warning: "border-amber-400/40 text-amber-300 hover:bg-amber-950/40",
};

/** Same recipe for elements that act as icon buttons but are not <button> (e.g. a <summary>). */
export function iconButtonClasses(tone: IconTone = "neutral", size: IconControlSize = "sm", className?: string) {
  return cn(base, iconControlSquare[size], tones[tone], className);
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { tone = "neutral", size = "sm", label, className, children, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      title={label}
      aria-label={label}
      className={iconButtonClasses(tone, size, className)}
      {...props}
    >
      {children}
    </button>
  );
});
