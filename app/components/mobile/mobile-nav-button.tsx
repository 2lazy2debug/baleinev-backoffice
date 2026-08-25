"use client";

import Link from "next/link";

import { cn } from "@/components/ui/cn";

/**
 * The one bottom-bar button recipe: icon over a micro label, no chrome, at least
 * a 44px tap target. The buttons share the bar evenly (`flex-1 basis-0`), so the
 * bar holds four or five of them without a 320px phone overflowing.
 */
const navButtonClasses = cn(
  "flex min-h-11 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5",
  "text-3xs font-semibold text-[var(--muted)] transition hover:text-[var(--ink)]",
  "[&_svg]:h-5 [&_svg]:w-5",
);

/** The label under the icon — one line, ellipsised rather than wrapped. */
const navLabelClasses = "w-full truncate text-center";

type MobileNavButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
};

export function MobileNavButton({ icon: Icon, label, className, type, ...props }: MobileNavButtonProps) {
  return (
    <button type={type ?? "button"} className={cn(navButtonClasses, className)} {...props}>
      <Icon />
      <span className={navLabelClasses}>{label}</span>
    </button>
  );
}

type MobileNavLinkProps = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** The slot's route is the one being shown. */
  active?: boolean;
  /** A count bubble on the icon, for an app that is waiting on the user. */
  badge?: number;
};

/** Same recipe, for a bar slot that navigates instead of opening an overlay. */
export function MobileNavLink({ href, icon: Icon, label, active = false, badge = 0 }: MobileNavLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(navButtonClasses, active ? "text-[var(--accent)]" : null)}
    >
      <span className="relative">
        <Icon />
        {badge > 0 ? (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-3xs font-bold text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <span className={navLabelClasses}>{label}</span>
    </Link>
  );
}
