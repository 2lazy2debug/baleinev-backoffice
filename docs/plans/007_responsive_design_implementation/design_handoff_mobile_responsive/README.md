# Handoff: Mobile-Responsive Design (Baleinev Comptes)

## Overview
Baleinev Comptes currently has no mobile layout — the sidebar-driven desktop shell is unusable on a phone. This handoff replaces the sidebar with a bottom bar on small screens and makes four apps fully usable on mobile: **Expense Reports, Tasks, Events, Passwords**. Every other app is ported (readable, no dead links) but reachable only through a secondary "… other" menu — it does not need bespoke mobile layout beyond the general rules below.

## About the Design Files
The two HTML files in this bundle (`admin-mobile.html`, `department-mobile.html`) are **design references built as static HTML/CSS/JS** — they are not production code and must not be copied into the Next.js app verbatim. They exist so you can open them in a browser, click through the interactions (bottom bar → apps sheet → other apps → back, settings, edition switcher, expense tabs, password reveal, sign up/withdraw), and see the exact spacing/type/color to target. The task is to **recreate this behavior inside the existing Next.js + Tailwind + `components/ui` system**, using the patterns already established in the codebase (server components, `"use client"` islands, the shared `Button`/`Modal`/`Badge`/`IconButton` primitives) — not to introduce a new framework or a new design system.

## Fidelity
**High-fidelity.** Colors, spacing, radii and type all use the app's real design tokens (`--page`, `--panel`, `--panel-strong`, `--line`, `--ink`, `--muted`, `--accent`, `--accent-strong`, and the existing radius scale). Recreate pixel-close, but treat exact copy/data in the mockups as placeholder — wire real data through the existing page/client/actions pattern.

## Why two files
The desktop sidebar already renders two different navigations for `role === "ADMIN"` vs `"DEPARTMENT"` (see `components/app-shell.tsx` lines 93–121). The mobile "… other" menu inherits that same split, so the two roles need to be reviewed as separate flows:
- **`admin-mobile.html`** — all 4 priority apps, plus an 8-item "other" menu (Dashboard, Calendar, Journal, Budget, Invoices, Cost Centers, Money Accounts, Users) and admin-only controls in Expense Reports (Approve/Reject, Record in journal) and Events (assign staff, delete shift/event).
- **`department-mobile.html`** — the same 4 priority apps, but "other" only has Calendar, Budget (and Money Accounts when `canManageMoneyAccounts` is true). Expense Reports history has no review actions (a department user submits, they don't approve). Events has no management controls, sign up/withdraw only. Adds a read-only Budget screen (department's own budget lines, planned vs. actual).

## Screens / Views

### 1. Mobile shell (bottom bar + sheets) — both roles
- **Purpose**: replace the sidebar as the primary navigation surface below the `lg` breakpoint.
- **Layout**: a `position: fixed` bar pinned to the bottom of the viewport, `lg:hidden`, height ≈ 64px content + safe-area padding, 4 evenly-spaced buttons (`justify-around`), background `var(--panel-strong)`, `border-top: 1px solid var(--line)`.
- **Buttons** (left→right): **Apps** (grid icon), **Edition** (layers icon + short code like "25–26"), **Settings** (sliders icon), **Sign out** (existing `SignOutButton`, icon-only on mobile).
- **Apps sheet**: tapping Apps slides up a bottom sheet (`border-radius: 18px` top corners, `var(--panel-strong)`, drag handle, dimmed backdrop that closes on tap-outside). Primary view lists the 4 priority apps as 56px rows (icon box + label + chevron) plus a 5th "… other" row. Tapping "… other" swaps the sheet's content to a second list with a "‹ Back" button in the header — it does not stack a second sheet.
- **Settings**: tapping Settings opens the *existing* Settings `Modal` (language + refund details) but full-screen on mobile — see the `Modal.tsx` change below. It stays conceptually a modal (dismissible, no route change), just edge-to-edge.
- **Edition switcher**: tapping Edition opens a `Modal` containing the *same* edition `<Select>` already in the sidebar (reuse `selectEdition()`), so there is no duplicated switching logic — just a different container.

### 2. Expense Reports (priority) — both roles, admin sees more actions
- **Layout**: the desktop `xl:grid-cols-[420px_1fr]` split (create form beside history) collapses to a single column below `xl`, and on mobile becomes two tabs — **Create** / **History** — in a segmented control under the page title, so the user isn't scrolling past a long create form to reach their history.
- **Create tab**: existing `<Field>` + `<Select>`/`<Input>` stack, unchanged fields, but every control is a fixed `44px` tall (`box-sizing: border-box`) — the current `Input`/`Select` recipe (`rounded-2xl px-4 py-3`) computes taller than 44px with `min-height` because padding adds on top of it; use `height` + `box-sizing: border-box` instead of `min-height` for the mobile stack, or give mobile inputs their own compact height token.
- **History tab → cardlets**: replace the `<table>` with one card per report. Each cardlet: description + status badge on top, a 2-column field grid (Date/Type, Department/Amount), a muted line for driving-route or "Submitted by", then full-width stacked actions (Approve primary, Reject destructive) for pending rows on admin, "Record in journal" outline button for approved rows on admin, nothing but the status + rejection reason for department users or resolved rows.

### 3. Tasks (priority) — both roles
- Already a single column of cards on desktop (todo cards + standalone task cards) — no structural change needed below `lg`, this screen mainly validates the bottom-bar overlay pattern. Bump the "Mark done" / status buttons to full-width 44px.

### 4. Events (priority) — admin sees management controls, department sees sign up only
- Event header card → day sections (unchanged structure) → shift cards. On mobile, each shift is a full-width card: role/time/spots info, then a full-width Sign up/Withdraw button. Admin-only: an "Assign staff" row (`Select` + 44×44 icon button) and a 44×44 delete-shift `IconButton` (replacing today's inline `×` text buttons, which are well under the 44px minimum) — gate all of it behind `canManageEvents` exactly as today.

### 5. Passwords (priority) — both roles
- Already fairly responsive (`flex-col lg:flex-row` in `EntryRow`) — the main mobile change is sizing: bump `IconButton` touch targets and make the reveal/copy/2FA row wrap onto its own line under the password code on narrow screens. Reveal toggles the same `<code>` element's text between `••••••••••` and the plaintext value — do **not** render a second element for the revealed value.

### 6. Journal (secondary, admin only) — cardlets
- The desktop table is 10 columns (`Date, Department, Type, Amount, Label, Beneficiary, Account, CC, Balance, Actions`) — far too wide for a phone. Below `sm`, replace it with the same cardlet pattern as Expense Reports: header (label + amount, colored by Charges/Produits), a 2×2 field grid (Department/Account, Cost center/Beneficiary), a running-balance line, then Edit/Delete `IconButton`s (or a "Locked" note for opening/linked entries).

### 7. Calendar (secondary, both roles)
- The desktop `xl:grid-cols-[1.2fr_0.8fr]` (month grid beside a hour-by-hour day timeline) collapses to one column: month grid on top (7-col grid of day cells, task/appointment dot indicators), then a simple agenda list for the selected day below (not the absolute-positioned hour timeline — too fine-grained for touch) — colored by task (green) vs. appointment (rose), same as the existing color coding.

### 8. Budget (secondary, department-only in this handoff)
- New read-only mobile view: one cardlet per budget line (label, Charges/Produits badge, planned amount, actual amount rolled up from journal entries, a thin progress bar, and a remaining/over-budget line). No create/edit affordances on mobile for either role in this pass — budget management stays desktop-only for now.

## General rules (apply everywhere)
- **Cards in a row → one column.** The existing `Card`/`CardGrid` span classes (`col-span-12 sm:col-span-6 lg:col-span-3`, etc. in `components/ui/Card.tsx`) already default to full width below `sm` — **no change needed there**, just don't add a new `grid-cols-*` without a mobile override.
- **Wide tables → cardlets.** Applies concretely to Expense Reports history and the Journal table (both above). Any other admin table you port later (Invoices, Cost Centers) should follow the same recipe: a `hidden sm:block` table + a `sm:hidden` cardlet list mapped from the same array.
- **Touch targets ≥ 44px.** The `Button` component is already `h-10` (40px) — bump to `h-11` (44px) at the component level, or pass a mobile-specific className, rather than special-casing every call site. `IconButton` is `h-9 w-9` (36px) — same treatment.

## Interactions & Behavior
- **Apps sheet**: slide up from the bottom nav's Apps button; tap the backdrop or the ✕ to close; "… other" swaps the sheet's inner content (not a second sheet) with a "‹ Back" affordance; selecting an app row navigates and closes the sheet.
- **Settings**: opens full-screen from the Settings nav button; ✕ or "Save changes" closes it; same `saveSettings()` logic as desktop.
- **Edition switcher**: opens a modal from the Edition nav button; selecting a non-current edition calls the existing `selectEdition(id)` (POST to `/api/preferences/edition`, then `router.refresh()`) and closes the modal; the nav button's label updates to the new short code once the page re-renders with the new `selectedEditionId`.
- **Expense Reports tabs**: client-side only, no navigation — `useState<'create' | 'history'>` local to the mobile view.
- **Password reveal**: toggles the same code element's text + swaps the eye/eye-off icon; no extra element.
- **Sign up / Withdraw**: same server actions as desktop (`signUpForShiftAction` / `withdrawFromShiftAction`), just triggered from the full-width mobile button instead of the desktop-sized one.
- **Responsive breakpoint**: use Tailwind's `lg` breakpoint (1024px) as the sidebar/bottom-bar switch point, matching the existing `lg:p-8` / collapse behavior already in `app-shell.tsx`.

## State Management
- `MobileShell` (new): local `useState` for which sheet is open (`'closed' | 'apps-primary' | 'apps-other' | 'settings' | 'edition'`) — a single enum avoids the "two things open at once" bugs a boolean-per-sheet approach invites.
- Settings and edition-switching state/logic already exist in `AppShell` (`selectedLocale`, `refundFirstName` etc., `saveSettings()`, `selectEdition()`) — **pass them down as props to `MobileShell` rather than duplicating them.**
- Expense Reports tab state: new local `useState` in the mobile-only wrapper, not shared with server state.

## Design Tokens
All from the existing `app/globals.css` — no new tokens needed.
| Token | Value | Use |
|---|---|---|
| `--page` | `#0f171f` | app background |
| `--panel` | `#152330` | inputs, nested cards |
| `--panel-strong` | `#1c2d3d` | cards, bottom bar, sheets |
| `--line` | `#2e4256` | borders |
| `--ink` | `#eaf1f8` | primary text |
| `--muted` | `#9cb0c4` | secondary text |
| `--accent` | `#00a68c` | primary actions, active states |
| `--accent-strong` | `#008a74` | hover |
| radius | `5px` (md, buttons/inputs) / `10px` (2xl, cards) / `999px` (pills/dots) | from the tight radius scale in `globals.css` |
| status colors | success `emerald-500/15` + `emerald-300`, error `rose-500/15` + `rose-300`, warning `amber-500/15` + `amber-300` | matches existing `Badge` tones |

## Assets
No new image assets. Icons are simple inline SVGs (grid, layers, sliders, log-out, chevrons, eye/eye-off, copy, pencil, trash, search, home, calendar, book, wallet, receipt, target/bullseye, users, landmark) drawn to match the existing `lucide-react` icon weight (1.6–1.8px stroke) already used throughout the app — swap them for the matching `lucide-react` imports during implementation (e.g. `Grid2x2`, `Layers`, `SlidersHorizontal`, `LogOut`) instead of inline SVG.

## Files
- `admin-mobile.html` — standalone reference, admin role, 6 phones (Tasks/shell, Expense Reports, Events, Passwords, Journal, Calendar).
- `department-mobile.html` — standalone reference, department role, 6 phones (Tasks/shell, Expense Reports, Events, Passwords, Budget, Calendar).
- `reference-source/` — the current, unmodified source files this plan is grounded in, copied from the repo at sync time (see `component-changes.md` for what changes in each).
- `component-changes.md` — file-by-file, line-annotated current → new code for the actual Next.js implementation.
- The original interactive exploration (`Mobile Design Proposal.dc.html` in the parent project) is background/process reference only — these two HTML files supersede it as the handoff artifact.
