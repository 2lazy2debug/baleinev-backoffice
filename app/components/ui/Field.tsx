import { cn } from "./cn";

type FieldProps = {
  label: string;
  htmlFor?: string;
  error?: string | null;
  /** Appends the required marker to the label; the input still carries its own `required`. */
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Field({ label, htmlFor, error, required, className, children }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className={cn("block space-y-2", className)}>
      <span className="text-sm font-medium">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {children}
      {error ? <span className="block text-xs text-[var(--bad)]">{error}</span> : null}
    </label>
  );
}
