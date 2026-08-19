import { X } from "lucide-react";
import { cn } from "./cn";

type ChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  /** Trailing control, typically a <ChipRemoveButton>. */
  action?: React.ReactNode;
};

/** A small removable token — event types, assigned staff. Not a status Badge. */
export function Chip({ action, className, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-2 text-xs lg:py-1",
        className,
      )}
      {...props}
    >
      {children}
      {action}
    </span>
  );
}

type ChipRemoveButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string };

export function ChipRemoveButton({ label, className, type, ...props }: ChipRemoveButtonProps) {
  return (
    <button
      type={type ?? "submit"}
      title={label}
      aria-label={label}
      className={cn(
        // The chip itself stays a compact token; only the tap target grows below
        // `lg`, where the row it sits in is touched rather than clicked.
        "flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:text-rose-400 disabled:opacity-50 lg:h-5 lg:w-5",
        className,
      )}
      {...props}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
