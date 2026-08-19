"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookText,
  CalendarDays,
  FileBadge,
  FileStack,
  Home,
  KeyRound,
  Landmark,
  ListTodo,
  ReceiptText,
  Settings,
  Target,
  Users,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, useRef } from "react";

import { EditionClosedBanner, EditionReadOnlyProvider } from "@/components/edition-read-only";
import { MobileShell } from "@/components/mobile/mobile-shell";
import type { EditionOption, NavigationItem } from "@/components/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { Alert, Button, IconButton, Input, Modal, Radio, Select } from "@/components/ui";
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
  refundProfile: {
    firstName: string | null;
    lastName: string | null;
    iban: string | null;
    zip: string | null;
    city: string | null;
  };
};

const GLOBAL_ROUTES = ["/passwords", "/users", "/templates", "/editions"];

export function AppShell({ children, userName, editions, selectedEditionId, locale, role, canManageMoneyAccounts, pendingTaskCount, refundProfile }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [switchingEdition, setSwitchingEdition] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
  const [refundFirstName, setRefundFirstName] = useState(refundProfile.firstName ?? "");
  const [refundLastName, setRefundLastName] = useState(refundProfile.lastName ?? "");
  const [refundIban, setRefundIban] = useState(refundProfile.iban ?? "");
  const [refundZip, setRefundZip] = useState(refundProfile.zip ?? "");
  const [refundCity, setRefundCity] = useState(refundProfile.city ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const copy = dictionaries[locale].shell;

  const selectedEdition = editions.find((edition) => edition.id === selectedEditionId) ?? null;
  const isEditionReadOnly = selectedEdition?.isClosed ?? false;
  // Passwords, users, templates and editions are global — the selected edition
  // being closed says nothing about whether they can be edited.
  const isEditionScopedRoute = !GLOBAL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  const moneyAccountsItem: NavigationItem = { type: "item", href: "/money-accounts", label: copy.moneyAccounts, icon: Landmark };

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
    { type: "divider", key: "d2" },
    { type: "item", href: "/templates", label: copy.templates, icon: FileStack },
    { type: "item", href: "/passwords", label: copy.passwords, icon: KeyRound },
    { type: "divider", key: "d3" },
    { type: "item", href: "/editions", label: copy.editions, icon: FileStack },
    moneyAccountsItem,
    { type: "item", href: "/users", label: copy.users, icon: Users },
  ];
  const departmentNavigation: NavigationItem[] = [
    { type: "item", href: "/tasks", label: copy.tasks, icon: ListTodo },
    { type: "item", href: "/calendar", label: copy.calendar, icon: CalendarDays },
    { type: "divider", key: "dept-d1" },
    { type: "item", href: "/budget", label: copy.budget, icon: Wallet },
    { type: "item", href: "/expense-reports", label: copy.expenseReports, icon: ReceiptText },
    { type: "item", href: "/events", label: copy.events, icon: Target },
    ...(canManageMoneyAccounts ? [moneyAccountsItem] : []),
    { type: "divider", key: "dept-d2" },
    { type: "item", href: "/passwords", label: copy.passwords, icon: KeyRound },
  ];

  const navigation = role === "ADMIN"
    ? adminNavigation
    : departmentNavigation;

  async function saveSettings() {
    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetch("/api/preferences/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: selectedLocale,
          refundFirstName,
          refundLastName,
          refundIban,
          refundZip,
          refundCity,
        }),
      });
      if (!response.ok) {
        setSaveError(true);
        return;
      }
      setIsSettingsOpen(false);
      router.refresh();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

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
              /* Collapsed: settings, the expand arrow and sign out stack as three
                 identically sized icon buttons — no labels, no user name. */
              <div className="flex flex-col items-center gap-2">
                <IconButton
                  size="md"
                  tone="neutral"
                  label={copy.settings}
                  onClick={() => { setSaveError(false); setIsSettingsOpen(true); }}
                >
                  <Settings />
                </IconButton>
                <IconButton size="md" tone="neutral" label="Expand sidebar" onClick={toggleCollapse}>
                  <ChevronRight />
                </IconButton>
                <SignOutButton compact label={copy.signOut} />
              </div>
            ) : (
              <>
                <p className="truncate text-sm font-medium">{userName}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => { setSaveError(false); setIsSettingsOpen(true); }}
                    className="flex-1"
                  >
                    <Settings />
                    <span>{copy.settings}</span>
                  </Button>
                  <IconButton size="md" tone="neutral" label="Collapse sidebar" onClick={toggleCollapse}>
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

        <MobileShell
          navigation={navigation}
          editions={editions}
          selectedEditionId={selectedEditionId}
          switchingEdition={switchingEdition}
          onSelectEdition={selectEdition}
          onOpenSettings={() => { setSaveError(false); setIsSettingsOpen(true); }}
          locale={locale}
          pendingTaskCount={pendingTaskCount}
        />

        {/* `pb-24` clears the fixed bottom bar; `lg:pb-8` gives the padding back once it is gone. */}
        <main className="min-w-0 flex-1 p-4 pb-24 lg:p-8">
          <EditionReadOnlyProvider isReadOnly={isEditionReadOnly}>
            {isEditionReadOnly && isEditionScopedRoute && selectedEdition ? (
              <EditionClosedBanner locale={locale} editionName={selectedEdition.name} />
            ) : null}
            {children}
          </EditionReadOnlyProvider>
        </main>
      </div>

      <Modal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title={copy.settings}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setIsSettingsOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="button" variant="primary" onClick={saveSettings} disabled={saving}>
              {saving ? "..." : copy.save}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm font-medium">{copy.language}</p>
          <Radio
            id="language-en"
            name="language"
            value="en"
            label={copy.english}
            checked={selectedLocale === "en"}
            onChange={() => setSelectedLocale("en")}
          />
          <Radio
            id="language-fr"
            name="language"
            value="fr"
            label={copy.french}
            checked={selectedLocale === "fr"}
            onChange={() => setSelectedLocale("fr")}
          />

          <div className="pt-3">
            <p className="text-sm font-medium">{copy.refundDetails}</p>
            <div className="mt-2 grid gap-2">
              <Input
                type="text"
                value={refundFirstName}
                onChange={(event) => setRefundFirstName(event.target.value)}
                placeholder={copy.refundFirstName}
              />
              <Input
                type="text"
                value={refundLastName}
                onChange={(event) => setRefundLastName(event.target.value)}
                placeholder={copy.refundLastName}
              />
              <Input
                type="text"
                value={refundIban}
                onChange={(event) => setRefundIban(event.target.value)}
                placeholder={copy.refundIban}
                className="uppercase"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="text"
                  value={refundZip}
                  onChange={(event) => setRefundZip(event.target.value)}
                  placeholder={copy.refundZip}
                />
                <Input
                  type="text"
                  value={refundCity}
                  onChange={(event) => setRefundCity(event.target.value)}
                  placeholder={copy.refundCity}
                />
              </div>
            </div>
          </div>
        </div>

        {saveError ? (
          <Alert className="mt-4">{copy.saveFailed}</Alert>
        ) : null}
      </Modal>
    </div>
  );
}