"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Grid2x2, Layers, SlidersHorizontal, X } from "lucide-react";

import { MobileNavButton } from "@/components/mobile/mobile-nav-button";
import { MobileSheet } from "@/components/mobile/mobile-sheet";
import type { EditionOption, NavigationItem } from "@/components/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { IconButton, Modal, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

/** The four apps that stay one tap away in both roles; everything else is "… other". */
const PRIORITY_HREFS = ["/expense-reports", "/tasks", "/events", "/passwords"];

type NavItem = Extract<NavigationItem, { type: "item" }>;

/**
 * Which overlay is up, as a single enum rather than a boolean per surface — two
 * sheets can never be open at once, and closing is always `setSheet("closed")`.
 * Settings is not in here: it is the shell's existing <Modal>, opened through
 * `onOpenSettings` so there is one settings implementation, not two.
 */
type Sheet = "closed" | "apps-primary" | "apps-other" | "edition";

type MobileShellProps = {
  /** The same array AppShell renders in the sidebar — no mobile-specific nav list. */
  navigation: NavigationItem[];
  editions: EditionOption[];
  selectedEditionId: string | null;
  switchingEdition: boolean;
  /** AppShell's `selectEdition` — the mobile switcher is a container, not new logic. */
  onSelectEdition: (editionId: string) => void;
  /** Opens AppShell's settings modal (which renders `mobileFullScreen`). */
  onOpenSettings: () => void;
  locale: Locale;
  pendingTaskCount: number;
};

/** "2025–2026" → "25–26", "Edition 2025" → "2025". The bar has room for ~6 characters. */
function shortEditionLabel(name: string) {
  const years = name.match(/\d{4}/g);
  if (years && years.length >= 2) {
    return `${years[0].slice(2)}–${years[1].slice(2)}`;
  }
  if (years) {
    return years[0];
  }
  return name;
}

export function MobileShell({
  navigation,
  editions,
  selectedEditionId,
  switchingEdition,
  onSelectEdition,
  onOpenSettings,
  locale,
  pendingTaskCount,
}: MobileShellProps) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<Sheet>("closed");
  const copy = dictionaries[locale].shell;

  const items = navigation.filter((item): item is NavItem => item.type === "item");
  // Priority order is PRIORITY_HREFS's, not the sidebar's; anything the role's nav
  // gains later falls into "other" on its own, with no change to this file.
  const priorityItems = PRIORITY_HREFS
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
  const otherItems = items.filter((item) => !PRIORITY_HREFS.includes(item.href));

  const selectedEdition = editions.find((edition) => edition.id === selectedEditionId) ?? null;
  const editionLabel = selectedEdition ? shortEditionLabel(selectedEdition.name) : copy.edition;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[var(--line)] bg-[var(--panel-strong)] px-1 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 lg:hidden">
        <MobileNavButton icon={Grid2x2} label={copy.apps} onClick={() => setSheet("apps-primary")} />
        <MobileNavButton icon={Layers} label={editionLabel} onClick={() => setSheet("edition")} />
        <MobileNavButton icon={SlidersHorizontal} label={copy.settings} onClick={onOpenSettings} />
        <SignOutButton nav label={copy.signOut} />
      </nav>

      <MobileSheet open={sheet === "apps-primary" || sheet === "apps-other"} onClose={() => setSheet("closed")}>
        {sheet === "apps-primary" ? (
          <>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{copy.apps}</span>
              <IconButton label={copy.close} onClick={() => setSheet("closed")}>
                <X />
              </IconButton>
            </div>
            {priorityItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSheet("closed")}
                className="flex min-h-14 items-center gap-3 border-b border-[var(--line)] py-3"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--panel)] ${
                    isActive(item.href) ? "text-[var(--accent)]" : "text-[var(--muted)]"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-medium">{item.label}</span>
                {item.href === "/tasks" && pendingTaskCount > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-3xs font-bold text-white">
                    {pendingTaskCount}
                  </span>
                ) : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setSheet("apps-other")}
              className="flex min-h-14 w-full items-center gap-3 py-3 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--panel)] text-[var(--muted)]">
                <Grid2x2 className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-medium text-[var(--muted)]">… {copy.otherApps.toLowerCase()}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            </button>
          </>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSheet("apps-primary")}
                className="-ml-1 flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-[var(--accent)]"
              >
                <ChevronLeft className="h-4 w-4" />
                {copy.back}
              </button>
              <span className="flex-1 text-sm font-semibold">{copy.otherApps}</span>
            </div>
            {otherItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSheet("closed")}
                className="flex min-h-12 items-center gap-3 border-b border-[var(--line)] py-2.5 text-sm last:border-b-0"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--panel)] ${
                    isActive(item.href) ? "text-[var(--accent)]" : "text-[var(--muted)]"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="flex-1">{item.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              </Link>
            ))}
          </>
        )}
      </MobileSheet>

      {/* The sidebar's edition <Select>, relocated — same options, same handler. */}
      <Modal
        open={sheet === "edition"}
        onClose={() => setSheet("closed")}
        title={copy.switchEdition}
        size="sm"
      >
        {editions.length > 0 ? (
          <Select
            aria-label={copy.edition}
            value={selectedEditionId ?? ""}
            disabled={switchingEdition}
            onChange={(event) => {
              onSelectEdition(event.target.value);
              setSheet("closed");
            }}
          >
            {selectedEditionId ? null : <option value="">{copy.pickEdition}</option>}
            {editions.map((edition) => (
              <option key={edition.id} value={edition.id}>
                {edition.isClosed ? `${edition.name} — ${copy.editionClosed}` : edition.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-[var(--muted)]">{copy.noEditions}</p>
        )}
      </Modal>
    </>
  );
}
