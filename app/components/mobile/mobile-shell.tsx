"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { MobileNavButton, MobileNavLink } from "@/components/mobile/mobile-nav-button";
import { MobileSheet, MobileSheetRow } from "@/components/mobile/mobile-sheet";
import type { NavigationItem } from "@/components/navigation";
import { IconButton } from "@/components/ui/IconButton";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

/**
 * The four apps that get a bar slot of their own, in bar order. Everything else
 * the role's navigation carries is behind "Other" — including anything added
 * later, with no change to this file.
 */
const BAR_HREFS = ["/tasks", "/expense-reports", "/events", "/calendar"];

type NavItem = Extract<NavigationItem, { type: "item" }>;

type MobileShellProps = {
  /** The same array AppShell renders in the sidebar — no mobile-specific nav list. */
  navigation: NavigationItem[];
  locale: Locale;
  pendingTaskCount: number;
};

/**
 * The bottom bar and the app drawer behind its last slot.
 *
 * The bar is apps and nothing else — four of them a tap away, the rest one tap
 * further. Everything that is about the *person* rather than an app (account,
 * language, edition, sign out) is in <MobileAccountMenu>, at the top right of
 * the screen's own top bar.
 */
export function MobileShell({ navigation, locale, pendingTaskCount }: MobileShellProps) {
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const copy = dictionaries[locale].shell;

  const items = navigation.filter((item): item is NavItem => item.type === "item");
  const barItems = BAR_HREFS
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
  const drawerItems = items.filter((item) => !BAR_HREFS.includes(item.href));

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  /**
   * A bar slot has ~54px of label. "Expense reports" / "Notes de frais" does not
   * fit and is not what anyone calls it anyway, so that one slot gets the short
   * name — here only; the sidebar and every heading keep the full one.
   */
  function barLabel(item: NavItem) {
    return item.href === "/expense-reports" ? copy.barExpenseReports : item.label;
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[var(--line)] bg-[var(--panel-strong)] px-1 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 lg:hidden">
        {barItems.map((item) => (
          <MobileNavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={barLabel(item)}
            active={isActive(item.href)}
            badge={item.href === "/tasks" ? pendingTaskCount : 0}
          />
        ))}
        <MobileNavButton
          icon={Menu}
          label={copy.barOther}
          aria-expanded={isDrawerOpen}
          onClick={() => setIsDrawerOpen(true)}
        />
      </nav>

      {/* One level, no submenu: the drawer is the apps the bar had no room for. */}
      <MobileSheet open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{copy.otherApps}</span>
          <IconButton label={copy.close} onClick={() => setIsDrawerOpen(false)}>
            <X />
          </IconButton>
        </div>
        {drawerItems.map((item) => (
          <MobileSheetRow
            key={item.href}
            icon={item.icon}
            label={item.label}
            href={item.href}
            active={isActive(item.href)}
            onClick={() => setIsDrawerOpen(false)}
          />
        ))}
      </MobileSheet>
    </>
  );
}
