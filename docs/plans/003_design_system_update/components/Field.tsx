import { cn } from "./cn";

type FieldProps = {
  label: string;
  htmlFor?: string;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
};

export function Field({ label, htmlFor, error, className, children }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className={cn("block space-y-2", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="block text-xs text-rose-300">{error}</span> : null}
    </label>
  );
}
