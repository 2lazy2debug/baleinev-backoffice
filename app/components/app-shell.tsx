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
  ListTodo,
  ReceiptText,
  Settings,
  Target,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

type AppShellProps = {
  children: React.ReactNode;
  userName: string;
  activeEditionName?: string;
  locale: Locale;
  role: "ADMIN" | "DEPARTMENT";
  pendingTaskCount: number;
  refundProfile: {
    firstName: string | null;
    lastName: string | null;
    iban: string | null;
    zip: string | null;
    city: string | null;
  };
};

export function AppShell({ children, userName, activeEditionName, locale, role, pendingTaskCount, refundProfile }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
  const [refundFirstName, setRefundFirstName] = useState(refundProfile.firstName ?? "");
  const [refundLastName, setRefundLastName] = useState(refundProfile.lastName ?? "");
  const [refundIban, setRefundIban] = useState(refundProfile.iban ?? "");
  const [refundZip, setRefundZip] = useState(refundProfile.zip ?? "");
  const [refundCity, setRefundCity] = useState(refundProfile.city ?? "");
  const [saving, setSaving] = useState(false);
  const copy = dictionaries[locale].shell;

  type NavigationItem = {
    type: "item";
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  } | {
    type: "divider";
    key: string;
  };

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
    { type: "divider", key: "d3" },
    { type: "item", href: "/editions", label: copy.editions, icon: FileStack },
    { type: "item", href: "/users", label: copy.users, icon: Users },
  ];
  const departmentNavigation: NavigationItem[] = [
    { type: "item", href: "/tasks", label: copy.tasks, icon: ListTodo },
    { type: "item", href: "/calendar", label: copy.calendar, icon: CalendarDays },
    { type: "divider", key: "dept-d1" },
    { type: "item", href: "/budget", label: copy.budget, icon: Wallet },
    { type: "item", href: "/expense-reports", label: copy.expenseReports, icon: ReceiptText },
    { type: "item", href: "/events", label: copy.events, icon: Target },
  ];

  const navigation = role === "ADMIN"
    ? adminNavigation
    : departmentNavigation;

  async function saveSettings() {
    setSaving(true);
    try {
      await fetch("/api/preferences/language", {
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
      setIsSettingsOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page)] text-[var(--ink)]">
      <div className="flex min-h-screen">
        <aside
          className="sticky top-0 flex h-screen shrink-0 flex-col border-r border-[var(--line)] bg-[color:rgba(16,30,43,0.9)] backdrop-blur"
          style={{ width: "clamp(220px, 14.285vw, 320px)" }}
        >
          <div className="shrink-0 border-b border-[var(--line)] px-5 py-5">
            <Image src="/logo_blv.png" alt="Baleinev" width={320} height={128} className="w-full object-contain" priority />
            <p className="mt-3 text-right text-xs text-[var(--muted)]">
              {activeEditionName ? `${copy.activeEdition}: ${activeEditionName}` : copy.noActiveEdition}
            </p>
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
                  className={`flex items-center justify-between px-3 py-2 text-sm ${
                    isActive
                      ? "bg-[var(--panel-strong)] font-semibold text-[var(--ink)]"
                      : "text-[var(--muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.href === "/tasks" && pendingTaskCount > 0 ? (
                    <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
                      {pendingTaskCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="shrink-0 border-t border-[var(--line)] p-3">
            <p className="truncate text-sm font-medium">{userName}</p>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 border border-[var(--line)] px-4 whitespace-nowrap text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
            >
              <Settings className="h-4 w-4" />
              {copy.settings}
            </button>
            <div className="mt-2">
              <SignOutButton label={copy.signOut} />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>

      {isSettingsOpen ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setIsSettingsOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-lg">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{copy.settings}</h2>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--ink)]"
                aria-label={copy.cancel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">{copy.language}</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="language"
                  value="en"
                  checked={selectedLocale === "en"}
                  onChange={() => setSelectedLocale("en")}
                />
                {copy.english}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="language"
                  value="fr"
                  checked={selectedLocale === "fr"}
                  onChange={() => setSelectedLocale("fr")}
                />
                {copy.french}
              </label>

              <div className="pt-3">
                <p className="text-sm font-medium">{copy.refundDetails}</p>
                <div className="mt-2 grid gap-2">
                  <input
                    type="text"
                    value={refundFirstName}
                    onChange={(event) => setRefundFirstName(event.target.value)}
                    placeholder={copy.refundFirstName}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                  />
                  <input
                    type="text"
                    value={refundLastName}
                    onChange={(event) => setRefundLastName(event.target.value)}
                    placeholder={copy.refundLastName}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                  />
                  <input
                    type="text"
                    value={refundIban}
                    onChange={(event) => setRefundIban(event.target.value)}
                    placeholder={copy.refundIban}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm uppercase outline-none transition focus:border-[var(--accent)]"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={refundZip}
                      onChange={(event) => setRefundZip(event.target.value)}
                      placeholder={copy.refundZip}
                      className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                    />
                    <input
                      type="text"
                      value={refundCity}
                      onChange={(event) => setRefundCity(event.target.value)}
                      placeholder={copy.refundCity}
                      className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--panel-strong)]"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={saveSettings}
                disabled={saving}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
              >
                {saving ? "..." : copy.save}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}