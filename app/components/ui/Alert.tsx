import { cn } from "./cn";

type AlertTone = "error" | "warning" | "success" | "info";

const tones: Record<AlertTone, string> = {
  error: "border-rose-400/30 bg-rose-950/30 text-rose-200",
  warning: "border-amber-400/30 bg-amber-950/30 text-amber-200",
  success: "border-emerald-400/30 bg-emerald-950/30 text-emerald-200",
  info: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--muted)]",
};

type AlertProps = React.HTMLAttributes<HTMLParagraphElement> & { tone?: AlertTone };

// The one inline message panel — form errors, save failures, sign-in failures.
export function Alert({ tone = "error", className, children, ...props }: AlertProps) {
  return (
    <p className={cn("rounded-lg border px-3 py-2 text-sm", tones[tone], className)} {...props}>
      {children}
    </p>
  );
}
