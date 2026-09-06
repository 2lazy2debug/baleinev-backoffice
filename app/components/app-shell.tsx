"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookText,
  CalendarDays,
  Contact,
  FileBadge,
  FileStack,
  Home,
  Coins,
  KeyRound,
  Landmark,
  LayoutGrid,
  Boxes,
  ListTodo,
  Network,
  ReceiptText,
  Tags,
  Target,
  Users,
  Wallet,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Globe,
} from "lucide-react";
import { useState, useRef } from "react";

import { EditionClosedBanner, EditionReadOnlyProvider } from "@/components/edition-read-only";
import { LanguageModal } from "@/components/language-modal";
import { MobileShell } from "@/components/mobile/mobile-shell";
import { MobileShellProvider } from "@/components/mobile/mobile-shell-context";
import type { EditionOption, NavigationItem } from "@/components/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { IconButton, Select, buttonClasses, iconButtonClasses } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

type AppShellProps = {
  children: React.ReactNode;
  userName: string;
  editions: EditionOption[];
  selectedEditionId: string | null;
  locale: Locale;
  role: "ADMIN" | "DEPARTMENT";
  canManageMoneyAccounts: boolean;
  pendingTaskCount: number;
};

const GLOBAL_ROUTES = ["/addresses", "/articles", "/passwords", "/stock", "/users", "/departments", "/templates", "/editions", "/account"];

export function AppShell({ children, userName, editions, selectedEditionId, locale, role, canManageMoneyAccounts, pendingTaskCount }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [switchingEdition, setSwitchingEdition] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const copy = dictionaries[locale].shell;

  const selectedEdition = editions.find((edition) => edition.id === selectedEditionId) ?? null;
  const isEditionReadOnly = selectedEdition?.isClosed ?? false;
  // Addresses, passwords, users, templates and editions are global — the selected
  // edition being closed says nothing about whether they can be edited.
  const isEditionScopedRoute = !GLOBAL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  const moneyAccountsItem: NavigationItem = { type: "item", href: "/money-accounts", label: copy.moneyAccounts, icon: Landmark };
  const cashRegisterItem: NavigationItem = { type: "item", href: "/cash", label: copy.cash, icon: Coins };

  const adminNavigation: NavigationItem[] = [
    { type: "item", href: "/", label: copy.dashboard, icon: Home },
    { type: "item", href: "/tasks", label: copy.tasks, icon: ListTodo },
    { type: "item", href: "/calendar", label: copy.calendar, icon: CalendarDays },
    { type: "item", href: "/events", label: copy.events, icon: Target },
    { type: "divider", key: "d1" },
    { type: "item", href: "/journal", label: copy.journal, icon: BookText },
    { type: "item", href: "/budget", label: copy.budget, icon: Wallet },
    { type: "item", href: "/expense-reports", label: copy.expenseReports, icon: ReceiptText },
    { type: "item", href: "/invoices", label: copy.invoices, icon: FileBadge },
    { type: "item", href: "/cost-centers", label: copy.costCenters, icon: Target },
    cashRegisterItem,
    { type: "item", href: "/pos", label: copy.pos, icon: LayoutGrid },
    { type: "divider", key: "d2" },
    { type: "item", href: "/addresses", label: copy.addresses, icon: Contact },
    { type: "item", href: "/articles", label: copy.articles, icon: Tags },
    { type: "item", href: "/stock", label: copy.stock, icon: Boxes },
    { type: "item", href: "/templates", label: copy.templates, icon: FileStack },
    { type: "item", href: "/passwords", label: copy.passwords, icon: KeyRound },
    { type: "divider", key: "d3" },
    { type: "item", href: "/editions", label: copy.editions, icon: FileStack },
    moneyAccountsItem,
    { type: "item", href: "/departments", label: copy.departments, icon: Network },
    { type: "item", href: "/users", label: copy.users, icon: Users },
  ];
  const departmentNavigation: NavigationItem[] = [
    { type: "item", href: "/tasks", label: copy.tasks, icon: ListTodo },
    { type: "item", href: "/calendar", label: copy.calendar, icon: CalendarDays },
    { type: "divider", key: "dept-d1" },
    { type: "item", href: "/budget", label: copy.budget, icon: Wallet },
    { type: "item", href: "/expense-reports", label: copy.expenseReports, icon: ReceiptText },
    { type: "item", href: "/events", label: copy.events, icon: Target },
    ...(canManageMoneyAccounts ? [moneyAccountsItem, cashRegisterItem] : []),
    { type: "divider", key: "dept-d2" },
    { type: "item", href: "/addresses", label: copy.addresses, icon: Contact },
    { type: "item", href: "/stock", label: copy.stock, icon: Boxes },
    { type: "item", href: "/passwords", label: copy.passwords, icon: KeyRound },
  ];

  const navigation = role === "ADMIN"
    ? adminNavigation
    : departmentNavigation;

  async function selectEdition(editionId: string) {
    if (!editionId || editionId === selectedEditionId) {
      return;
    }

    setSwitchingEdition(true);
    try {
      const response = await fetch("/api/preferences/edition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId }),
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setSwitchingEdition(false);
    }
  }

  const COLLAPSED_WIDTH = 64;

  function toggleCollapse() {
    const asideEl = asideRef.current;
    if (!asideEl) {
      setIsCollapsed((v) => !v);
      document.documentElement.style.setProperty("--content-extra", "0px");
      window.dispatchEvent(new CustomEvent("sidebar:toggled", { detail: { collapsed: !isCollapsed, extra: 0 } }));
      return;
    }

    if (!isCollapsed) {
      const prior = asideEl.offsetWidth || 280;
      const extra = Math.max(0, prior - COLLAPSED_WIDTH);
      document.documentElement.style.setProperty("--content-extra", `${extra}px`);
      window.dispatchEvent(new CustomEvent("sidebar:toggled", { detail: { collapsed: true, extra } }));
    } else {
      document.documentElement.style.setProperty("--content-extra", "0px");
      window.dispatchEvent(new CustomEvent("sidebar:toggled", { detail: { collapsed: false, extra: 0 } }));
    }

    setIsCollapsed((v) => !v);
  }

  return (
    /* Account, language and edition are reached from <PageHeader> on a phone, and
       every screen owns its own header — so those handlers travel by context
       rather than through every page's props. */
    <MobileShellProvider
      value={{
        userName,
        editions,
        selectedEditionId,
        switchingEdition,
        onSelectEdition: selectEdition,
        onOpenLanguage: () => setIsLanguageOpen(true),
        locale,
      }}
    >
      <div className="min-h-screen bg-[var(--page)] text-[var(--ink)]">
        <div className="flex min-h-screen">
          <aside
            ref={asideRef}
            className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--line)] bg-[color:rgba(16,30,43,0.9)] backdrop-blur lg:flex ${isCollapsed ? "collapsed" : ""}`}
            style={{ width: isCollapsed ? `${COLLAPSED_WIDTH}px` : "clamp(220px, 14.285vw, 320px)" }}
          >
            <div className={`shrink-0 border-b border-[var(--line)] ${isCollapsed ? "px-3 py-4" : "px-5 py-5"}`}>
              <Image src="/logo_blv.png" alt="Baleinev" width={320} height={128} className="w-full object-contain" priority />
              {!isCollapsed ? (
                <div className="mt-3 space-y-1">
                  <label htmlFor="edition-picker" className="block text-3xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    {copy.edition}
                  </label>
                  {editions.length > 0 ? (
                    <Select
                      id="edition-picker"
                      size="sm"
                      value={selectedEditionId ?? ""}
                      disabled={switchingEdition}
                      onChange={(event) => selectEdition(event.target.value)}
                    >
                      {selectedEditionId ? null : <option value="">{copy.pickEdition}</option>}
                      {editions.map((edition) => (
                        <option key={edition.id} value={edition.id}>
                          {edition.isClosed ? `${edition.name} — ${copy.editionClosed}` : edition.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <p className="text-xs text-[var(--muted)]">{copy.noEditions}</p>
                  )}
                </div>
              ) : null}
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {navigation.map((item) => {
                if (item.type === "divider") {
                  return <div key={item.key} className="my-2 border-t border-[var(--line)]" />;
                }

                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center rounded-md px-3 py-2 text-sm ${
                      isCollapsed ? "justify-center" : "justify-between"
                    } ${
                      isActive
                        ? "bg-[var(--panel-strong)] font-semibold text-[var(--ink)]"
                        : "text-[var(--muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {!isCollapsed ? <span>{item.label}</span> : null}
                    </span>
                    {item.href === "/tasks" && pendingTaskCount > 0 ? (
                      isCollapsed ? (
                        // No room for the count at 64px — a dot still says "something is waiting".
                        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
                      ) : (
                        <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-3xs font-bold text-white">
                          {pendingTaskCount}
                        </span>
                      )
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <div className="shrink-0 border-t border-[var(--line)] p-3">
              {isCollapsed ? (
                /* Collapsed: account, language, the expand arrow and sign out stack as
                   four identically sized icon buttons — no labels, no user name. */
                <div className="flex flex-col items-center gap-2">
                  <Link
                    href="/account"
                    title={copy.account}
                    aria-label={copy.account}
                    className={iconButtonClasses("neutral", "md")}
                  >
                    <CircleUserRound />
                  </Link>
                  <IconButton size="md" tone="neutral" label={copy.language} onClick={() => setIsLanguageOpen(true)}>
                    <Globe />
                  </IconButton>
                  <IconButton size="md" tone="neutral" label={copy.expandSidebar} onClick={toggleCollapse}>
                    <ChevronRight />
                  </IconButton>
                  <SignOutButton compact label={copy.signOut} />
                </div>
              ) : (
                <>
                  <p className="truncate text-sm font-medium">{userName}</p>
                  <div className="mt-2 flex gap-2">
                    <Link href="/account" className={buttonClasses("secondary", "md", "flex-1")}>
                      <CircleUserRound />
                      <span>{copy.account}</span>
                    </Link>
                    <IconButton size="md" tone="neutral" label={copy.language} onClick={() => setIsLanguageOpen(true)}>
                      <Globe />
                    </IconButton>
                    <IconButton size="md" tone="neutral" label={copy.collapseSidebar} onClick={toggleCollapse}>
                      <ChevronLeft />
                    </IconButton>
                  </div>
                  <div className="mt-2">
                    <SignOutButton label={copy.signOut} />
                  </div>
                </>
              )}
              <p className="mt-3 truncate text-center text-3xs text-[var(--muted)]">
                {isCollapsed ? null : "Baleinev Comptes "}v{process.env.NEXT_PUBLIC_APP_VERSION}
              </p>
            </div>
          </aside>

          <MobileShell navigation={navigation} locale={locale} pendingTaskCount={pendingTaskCount} />

          {/* The phone gutter is 12px — every point of it is width a list row does
              not get — and <PageHeader> bleeds by exactly this much. Change the two
              together. `pb-24` clears the fixed bottom bar; `lg:p-8` gives the
              desktop padding back once that bar is gone. */}
          <main className="min-w-0 flex-1 p-3 pb-24 lg:p-8">
            <EditionReadOnlyProvider isReadOnly={isEditionReadOnly}>
              {isEditionReadOnly && isEditionScopedRoute && selectedEdition ? (
                <EditionClosedBanner locale={locale} editionName={selectedEdition.name} />
              ) : null}
              {children}
            </EditionReadOnlyProvider>
          </main>
        </div>

        {isLanguageOpen ? <LanguageModal locale={locale} onClose={() => setIsLanguageOpen(false)} /> : null}
      </div>
    </MobileShellProvider>
  );
}