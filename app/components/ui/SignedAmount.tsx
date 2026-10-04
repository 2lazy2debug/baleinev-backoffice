import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "./cn";

// One recipe for "positive is green, negative is rose" — the shade matches
// Badge tone="success"/"error". Use signedAmountClasses for a value that is
// signed by something other than its number (a PRODUITS entry, say).
export function signedAmountClasses(positive: boolean) {
  return positive ? "text-emerald-300" : "text-rose-300";
}

type SignedAmountProps = {
  value: number;
  label: React.ReactNode;
  trend?: boolean;
  className?: string;
};

export function SignedAmount({ value, label, trend = false, className }: SignedAmountProps) {
  const positive = value >= 0;
  const text = <span className={cn("whitespace-nowrap", signedAmountClasses(positive), className)}>{label}</span>;
  if (!trend) return text;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex flex-nowrap items-center gap-1.5">
      {text}
      <Icon aria-hidden className={cn("h-4 w-4", signedAmountClasses(positive))} />
    </span>
  );
}
