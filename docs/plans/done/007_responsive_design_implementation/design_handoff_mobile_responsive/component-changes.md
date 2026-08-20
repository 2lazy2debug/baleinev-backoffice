# Component Changes — annotated current → new

> **Status (2026-08-19).** Sections **1–3 are implemented and on `main`** — the code
> below is the *plan* that was followed, not the code that exists. Where they differ,
> the repo wins: read `app/components/ui/Modal.tsx`, `app/components/app-shell.tsx` and
> `app/components/mobile/`. Known differences are listed in the README's
> "Where the design deviated from the mockups" section.
>
> Sections **4–7 are still to do**, with one correction: §6's `×` chips and §7's
> `IconButton` sizing are already handled by the responsive control scale in
> `components/ui/control.ts` and by `ChipRemoveButton` — neither needs a call-site
> change any more. §4 and §5 are the real remaining work (table → `<CardletList>`).

Line numbers below are from the repo at the commit recorded in `github.md` (`app/` is the Next.js project root). Unmodified copies of the "current" files are in `reference-source/` for side-by-side diffing.

---

## 1. `app/components/ui/Modal.tsx` — add a mobile-full-screen option ✅ DONE

**Why**: the Settings modal needs to be edge-to-edge on mobile (per the brief: "full-screen but it stays a modal") without changing every other modal's behavior.

### Current (lines 1–72, full file)
```tsx
"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  full: "max-w-[95vw] max-h-[90vh]",
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

// One modal implementation for the whole app — replaces both the two-div and
// flex-wrapper patterns found in the audit. Always shadow-lg, always Escape-to-close.
export function Modal({ open, onClose, title, size = "md", children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={cn(
          "w-full overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-lg",
          sizeClasses[size],
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
        {footer ? <div className="mt-6 flex items-center justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
```

### New (replaces lines 17–68)
```tsx
type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  /** Edge-to-edge below the `sm` breakpoint (e.g. the Settings modal). Default false. */
  mobileFullScreen?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

// One modal implementation for the whole app — replaces both the two-div and
// flex-wrapper patterns found in the audit. Always shadow-lg, always Escape-to-close.
export function Modal({ open, onClose, title, size = "md", mobileFullScreen = false, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 flex items-center justify-center bg-black/50",
        mobileFullScreen ? "p-0 sm:p-4" : "p-4",
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full overflow-y-auto border border-[var(--line)] bg-[var(--panel)] shadow-lg",
          mobileFullScreen
            ? "h-full rounded-none p-6 sm:h-auto sm:rounded-2xl"
            : "rounded-2xl p-6",
          sizeClasses[size],
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
        {footer ? <div className="mt-6 flex items-center justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
```

---

## 2. `app/components/app-shell.tsx` — hide the sidebar on mobile, mount the bottom shell ✅ DONE

### 2a. Lines 204–206 — make the sidebar desktop-only
**Current:**
```tsx
        <aside
          ref={asideRef}
          className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-[var(--line)] bg-[color:rgba(16,30,43,0.9)] backdrop-blur ${isCollapsed ? "collapsed" : ""}`}
```
**New:**
```tsx
        <aside
          ref={asideRef}
          className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--line)] bg-[color:rgba(16,30,43,0.9)] backdrop-blur lg:flex ${isCollapsed ? "collapsed" : ""}`}
```
(`flex` → `hidden lg:flex`; everything else on the aside is unchanged.)

### 2b. Lines 300–303 — leave room for the bottom bar, mount `MobileShell`
**Current:**
```tsx
        </aside>

        <main className="min-w-0 flex-1 p-6 lg:p-8">
```
**New:**
```tsx
        </aside>

        <MobileShell
          navigation={navigation}
          editions={editions}
          selectedEditionId={selectedEditionId}
          switchingEdition={switchingEdition}
          onSelectEdition={selectEdition}
          onOpenSettings={() => { setSaveError(false); setIsSettingsOpen(true); }}
          signOutLabel={copy.signOut}
        />

        <main className="min-w-0 flex-1 p-4 pb-24 lg:p-8 lg:pb-8">
```
(`MobileShell` derives which 4 apps are "priority" vs. which go in "… other" itself — see its own file below — so no new nav arrays are needed here. `pb-24` on mobile reserves space above the fixed bottom bar; `lg:pb-8` restores the desktop padding.)

### 2c. Line 312 — settings modal, full-screen on mobile
**Current:**
```tsx
      <Modal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title={copy.settings}
        size="sm"
```
**New:**
```tsx
      <Modal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title={copy.settings}
        size="sm"
        mobileFullScreen
```

### 2d. Import line (near the top, with the other component imports)
Add:
```tsx
import { MobileShell } from "@/components/mobile/mobile-shell";
```

No other lines in `app-shell.tsx` change — `adminNavigation`/`departmentNavigation` (lines 93–121), `saveSettings()` (128), `selectEdition()` (157) and `toggleCollapse()` (179) are reused as-is.

---

## 3. `app/components/mobile/mobile-shell.tsx` — new file ✅ DONE (built as three files: `mobile-shell.tsx`, `mobile-sheet.tsx`, `mobile-nav-button.tsx`)

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Grid2x2,
  Layers,
  SlidersHorizontal,
  LogOut,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";

import { Modal, Select } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out-button";

// Fixed across both roles — these 4 stay one tap away everywhere.
const PRIORITY_HREFS = ["/expense-reports", "/tasks", "/events", "/passwords"];

type NavItem = {
  type: "item";
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
} | { type: "divider"; key: string };

type EditionOption = { id: string; name: string; isClosed: boolean };

type MobileShellProps = {
  navigation: NavItem[]; // same array AppShell already builds for the sidebar
  editions: EditionOption[];
  selectedEditionId: string | null;
  switchingEdition: boolean;
  onSelectEdition: (id: string) => void;
  onOpenSettings: () => void;
  signOutLabel: string;
};

type Sheet = "closed" | "apps-primary" | "apps-other" | "edition";

export function MobileShell({
  navigation,
  editions,
  selectedEditionId,
  switchingEdition,
  onSelectEdition,
  onOpenSettings,
  signOutLabel,
}: MobileShellProps) {
  const [sheet, setSheet] = useState<Sheet>("closed");

  const items = navigation.filter((item): item is Extract<NavItem, { type: "item" }> => item.type === "item");
  const priorityItems = PRIORITY_HREFS
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is Extract<NavItem, { type: "item" }> => Boolean(item));
  const otherItems = items.filter((item) => !PRIORITY_HREFS.includes(item.href));

  const selectedEdition = editions.find((edition) => edition.id === selectedEditionId) ?? null;
  const editionShortLabel = selectedEdition ? selectedEdition.name.replace(/\D+/g, "").slice(-4) || selectedEdition.name : "—";

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[var(--line)] bg-[var(--panel-strong)] px-1 pb-[max(env(safe-area-inset-bottom),16px)] pt-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setSheet("apps-primary")}
          className="flex min-w-16 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold text-[var(--muted)]"
        >
          <Grid2x2 className="h-5 w-5" />
          Apps
        </button>
        <button
          type="button"
          onClick={() => setSheet("edition")}
          className="flex min-w-16 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold text-[var(--muted)]"
        >
          <Layers className="h-5 w-5" />
          {editionShortLabel}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex min-w-16 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold text-[var(--muted)]"
        >
          <SlidersHorizontal className="h-5 w-5" />
          Settings
        </button>
        <SignOutButton
          label={signOutLabel}
          className="flex min-w-16 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold text-[var(--muted)]"
          iconOnly={false}
        >
          <LogOut className="h-5 w-5" />
        </SignOutButton>
      </nav>

      {sheet === "apps-primary" || sheet === "apps-other" ? (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60 lg:hidden"
          onClick={() => setSheet("closed")}
        >
          <div
            className="max-h-[78%] overflow-y-auto rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--panel-strong)] px-4 pb-9 pt-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-[var(--line)]" />

            {sheet === "apps-primary" ? (
              <>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[15px] font-semibold">Apps</span>
                  <button type="button" onClick={() => setSheet("closed")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--muted)]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {priorityItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSheet("closed")}
                    className="flex items-center gap-3 border-b border-[var(--line)] py-3"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--panel)] text-[var(--accent)]">
                      <item.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex-1 text-sm font-medium">{item.label}</span>
                    <ChevronRight className="h-4 w-4 text-[var(--muted)]" />
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => setSheet("apps-other")}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--panel)] text-[var(--muted)]">
                    <Grid2x2 className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-[var(--muted)]">… other</span>
                  <ChevronRight className="h-4 w-4 text-[var(--muted)]" />
                </button>
              </>
            ) : (
              <>
                <div className="mb-1.5 flex items-center gap-2">
                  <button type="button" onClick={() => setSheet("apps-primary")} className="flex items-center gap-1 text-sm font-semibold text-[var(--accent)]">
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <span className="flex-1 text-center text-[15px] font-semibold" style={{ marginRight: 52 }}>Other apps</span>
                </div>
                {otherItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSheet("closed")}
                    className="flex items-center gap-3 border-b border-[var(--line)] py-2.5 text-[13.5px] last:border-b-0"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--panel)] text-[var(--muted)]">
                      <item.icon className="h-4 w-4" />
                    </span>
                    {item.label}
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>
      ) : null}

      <Modal
        open={sheet === "edition"}
        onClose={() => setSheet("closed")}
        title="Switch edition"
        size="sm"
      >
        {editions.length > 0 ? (
          <Select
            value={selectedEditionId ?? ""}
            disabled={switchingEdition}
            onChange={(event) => { onSelectEdition(event.target.value); setSheet("closed"); }}
          >
            {editions.map((edition) => (
              <option key={edition.id} value={edition.id}>
                {edition.isClosed ? `${edition.name} — Closed` : edition.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-[var(--muted)]">No editions yet.</p>
        )}
      </Modal>
    </>
  );
}
```

**Notes for whoever implements this:**
- Reuses the *exact same* `navigation` array `AppShell` already computes for the sidebar (lines 93–126) — priority items are pulled out by href, everything else falls into "other" automatically, so a future nav item added to `adminNavigation`/`departmentNavigation` shows up in "other" with zero mobile-specific code.
- The edition modal renders the existing `Select` — same options, same `onChange` — just relocated. It is **not** a new dropdown implementation.
- `SignOutButton` needs a small prop addition (`iconOnly`/`className` passthrough) to render as an icon+label nav button — check its current signature in `components/sign-out-button.tsx` before wiring this in.

---

## 4. `app/app/(app)/expense-reports/client.tsx` — table → cardlets on mobile ⬜ TO DO

### Lines 122–178 (the `<div className="mt-4 overflow-hidden ...">` wrapping the `<table>`)
**Current** (excerpt, full block starts at line 121):
```tsx
        {expenseReports.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">{copy.expenseReports.noHistory}</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)]">
            <table className="w-full text-left text-sm">
              {/* ...THead + tbody, lines 124–226... */}
            </table>
          </div>
        )}
```

**New** — wrap the existing table in `hidden sm:block`, add a `sm:hidden` cardlet list right after it that maps the *same* `expenseReports` array (reuse the `statusLabel`/`bankInfoLines` computation already inside the `.map`):
```tsx
        {expenseReports.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">{copy.expenseReports.noHistory}</p>
        ) : (
          <>
            <div className="mt-4 hidden overflow-hidden rounded-xl border border-[var(--line)] sm:block">
              <table className="w-full text-left text-sm">
                {/* ...unchanged THead + tbody... */}
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:hidden">
              {expenseReports.map((report) => {
                const statusLabel = /* same computation as the table branch */ report.status;
                const statusTone = report.status === ExpenseReportStatus.APPROVED ? "success"
                  : report.status === ExpenseReportStatus.REJECTED ? "error" : "warning";

                return (
                  <div key={report.id} className="flex flex-col gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-3.5">
                    <div className="flex items-start justify-between gap-2.5">
                      <p className="min-w-0 flex-1 font-medium">{report.description}</p>
                      <Badge tone={statusTone}>{statusLabel}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div><p className="uppercase tracking-wide text-[var(--muted)]">{copy.expenseReports.date}</p><p>{formatDate(report.date)}</p></div>
                      <div><p className="uppercase tracking-wide text-[var(--muted)]">{copy.expenseReports.reportType}</p><p>{report.reportType === "DRIVING" ? copy.expenseReports.drivingExpense : copy.expenseReports.standardExpense}</p></div>
                      <div><p className="uppercase tracking-wide text-[var(--muted)]">{copy.expenseReports.department}</p><p>{report.department.name}</p></div>
                      <div><p className="uppercase tracking-wide text-[var(--muted)]">{copy.expenseReports.amount}</p><p>{formatCurrency(decimalToNumber(report.amount))}</p></div>
                    </div>
                    {access.role === "ADMIN" && !isReadOnly && report.status === ExpenseReportStatus.PENDING ? (
                      <div className="flex flex-col gap-2">
                        <form action={approveFormAction}>
                          <input type="hidden" name="expenseReportId" value={report.id} />
                          <Button type="submit" variant="primary" className="w-full">{copy.expenseReports.approve}</Button>
                        </form>
                        <form action={rejectFormAction}>
                          <input type="hidden" name="expenseReportId" value={report.id} />
                          <Button type="submit" variant="destructive" className="w-full">{copy.expenseReports.reject}</Button>
                        </form>
                      </div>
                    ) : null}
                    {access.role === "ADMIN" && report.status === ExpenseReportStatus.APPROVED ? (
                      <a href={`/journal?fromExpenseReport=${report.id}`} className="block w-full rounded-md border border-[var(--accent)] py-2.5 text-center text-sm font-semibold text-[var(--accent)]">
                        {copy.expenseReports.recordInJournal}
                      </a>
                    ) : null}
                    {report.rejectionReason ? <p className="text-xs text-rose-300">{report.rejectionReason}</p> : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
```
Treat the pseudo-code above as a starting point, not a literal drop-in — line up the field list and status/tone mapping with the real `statusLabel`/badge logic already written in the table branch (lines 138–150) so the two views never drift.

**Since this was written**, the recipe became components. Use `<Table desktopOnly>` for the desktop half and `<CardletList>` / `<Cardlet>` / `<CardletHeader>` / `<CardletFields>` / `<CardletField>` / `<CardletActions>` from `@/components/ui` for the mobile half — do not hand-roll the `hidden sm:block` / `sm:hidden` classes or the card surface. `<CardletActions>` already stretches its children full width, so the `className="w-full"` on each `<Button>` above is unnecessary.

---

## 5. `app/components/journal-table.tsx` — same table → cardlets pattern ⬜ TO DO

Apply the identical split around the `<table ref={tableRef}>` block (lines 280–404) — `<Table desktopOnly>` plus a `<CardletList>`, both from `@/components/ui`; see the note at the end of §4. Cardlet fields: **Date + Type** / **Department + Amount** / **Cost center + Account** as a 2×2 grid, then **Beneficiary**, then the running balance line, then Edit/Delete `IconButton`s (or "Locked" text) reusing the exact same `runningBalanceByEntryId`/`isEditing` logic already computed above the table (lines ~113–199) — do not duplicate that computation, just render it differently on mobile. Skip the inline-edit affordance on mobile for v1 (editing a 10-field row inline on a phone is a bad interaction) — mobile Edit can open the row in a small `Modal` form instead, reusing the same `handleEditStart`/`saveFormAction`.

---

## 6. `app/app/(app)/events/client.tsx` — touch targets for admin controls ✅ SUPERSEDED

> **Superseded.** Both changes below are already live without touching this file: the
> responsive control scale gives every `Button`/`IconButton`/`Select` a 44px footprint
> below `lg`, and `ChipRemoveButton` (in `components/ui/Chip.tsx`) is now the shared
> version of the bigger `×` hit area sketched below. What §4 of the README still asks
> for — shift cards with a full-width Sign up/Withdraw — is real work and is *not* done.

### Lines 387–396 — assign-staff row (already gated by `canManageEvents`)
No structural change — just confirm the `<Select size="compact">` + `<Button size="sm">+</Button>` pair (currently ~32–36px tall) is swapped for `size="md"` / a 44×44 `IconButton` on mobile. Easiest: give `Button`/`IconButton` a `h-11`/`w-11` floor as noted in the README's general rules, so this fixes itself without a per-call-site change.

### Lines 417–424 — remove-individual-staff-member chips
**Current:**
```tsx
                                    {shift.assignments.map((a) => (
                                      <form key={a.id} action={withdrawFormAction} className="inline-flex items-center gap-1">
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <input type="hidden" name="userId" value={a.userId} />
                                        <span className="text-xs">{a.user.name}</span>
                                        <button disabled={isWithdrawing} className="text-[var(--muted)] hover:text-rose-400 text-xs disabled:opacity-50">×</button>
                                      </form>
                                    ))}
```
**New** — same logic, bigger hit area on the remove button (the name badge stays compact, only the tap target grows):
```tsx
                                    {shift.assignments.map((a) => (
                                      <form key={a.id} action={withdrawFormAction} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel)] py-1 pl-2.5 pr-1">
                                        <input type="hidden" name="shiftId" value={shift.id} />
                                        <input type="hidden" name="userId" value={a.userId} />
                                        <span className="text-xs">{a.user.name}</span>
                                        <button
                                          disabled={isWithdrawing}
                                          aria-label={`Remove ${a.user.name}`}
                                          className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--muted)] hover:text-rose-400 disabled:opacity-50"
                                        >
                                          ×
                                        </button>
                                      </form>
                                    ))}
```

No other lines in this file change — the `canManageEvents` gate (line 148 area) and the sign-up/withdraw buttons already work as-is; they just need the global 44px `Button` floor from the README's general rules.

---

## 7. `app/app/(app)/passwords/client.tsx` — no structural change ✅ DONE (nothing to change)

`EntryRow` (from line 178) already uses `flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4` for its detail row — this already collapses to one column on mobile. The only change here was the global `IconButton` 44px floor, which shipped in `components/ui/control.ts`; no line-level edit was needed in this file, and none is needed now.
