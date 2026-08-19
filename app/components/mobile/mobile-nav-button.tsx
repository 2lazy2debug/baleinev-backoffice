"use client";

import { cn } from "@/components/ui";

/**
 * The one bottom-bar button recipe: icon over a micro label, no chrome, at least
 * a 44px tap target. Exported as a class string too, because <SignOutButton>
 * needs to render as one of these without importing the whole shell.
 */
export const mobileNavButtonClasses = cn(
  "flex min-h-11 min-w-16 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5",
  "text-3xs font-semibold text-[var(--muted)] transition hover:text-[var(--ink)]",
  "[&_svg]:h-5 [&_svg]:w-5",
);

type MobileNavButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
};

export function MobileNavButton({ icon: Icon, label, className, type, ...props }: MobileNavButtonProps) {
  return (
    <button type={type ?? "button"} className={cn(mobileNavButtonClasses, className)} {...props}>
      <Icon />
      <span className="max-w-16 truncate">{label}</span>
    </button>
  );
}
