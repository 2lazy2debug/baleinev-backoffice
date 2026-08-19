import { cn } from "./cn";

type BadgeTone = "success" | "error" | "warning" | "info" | "neutral";

const tones: Record<BadgeTone, string> = {
  success: "bg-emerald-500/15 text-emerald-300",
  error: "bg-rose-500/15 text-rose-300",
  warning: "bg-amber-500/15 text-amber-300",
  info: "bg-[var(--accent)]/15 text-[var(--accent)]",
  neutral: "border border-[var(--line)] text-[var(--muted)]",
};

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
