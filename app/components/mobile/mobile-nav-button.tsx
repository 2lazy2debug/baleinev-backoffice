"use client";

import Link from "next/link";

import { cn } from "@/components/ui";

/**
 * The one bottom-bar button recipe: icon over a micro label, no chrome, at least
 * a 44px tap target. The buttons share the bar evenly (`flex-1 basis-0`), so the
 * bar holds four or five of them without a 320px phone overflowing. Exported as
 * a class string too, because <SignOutButton> needs to render as one of these
 * without importing the whole shell.
 */
export const mobileNavButtonClasses = cn(
  "flex min-h-11 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5",
  "text-3xs font-semibold text-[var(--muted)] transition hover:text-[var(--ink)]",
  "[&_svg]:h-5 [&_svg]:w-5",
);

/** The label under the icon — one line, ellipsised rather than wrapped. */
export const mobileNavLabelClasses = "w-full truncate text-center";

type MobileNavButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
};

export function MobileNavButton({ icon: Icon, label, className, type, ...props }: MobileNavButtonProps) {
  return (
    <button type={type ?? "button"} className={cn(mobileNavButtonClasses, className)} {...props}>
      <Icon />
      <span className={mobileNavLabelClasses}>{label}</span>
    </button>
  );
}

type MobileNavLinkProps = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** The bar's only stateful button — a slot that is a route, not an overlay. */
  active?: boolean;
};

/** Same recipe, for a bar slot that navigates instead of opening an overlay. */
export function MobileNavLink({ href, icon: Icon, label, active = false }: MobileNavLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(mobileNavButtonClasses, active ? "text-[var(--accent)]" : null)}
    >
      <Icon />
      <span className={mobileNavLabelClasses}>{label}</span>
    </Link>
  );
}
