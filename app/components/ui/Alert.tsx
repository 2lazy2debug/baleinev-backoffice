import { cn } from "./cn";

type AlertTone = "error" | "warning" | "success" | "info";

const tones: Record<AlertTone, string> = {
  error: "border-[var(--bad)]/30 bg-[var(--bad)]/10 text-[var(--bad)]",
  warning: "border-[var(--warn)]/30 bg-[var(--warn)]/10 text-[var(--warn)]",
  success: "border-[var(--good)]/30 bg-[var(--good)]/10 text-[var(--good)]",
  info: "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]",
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
