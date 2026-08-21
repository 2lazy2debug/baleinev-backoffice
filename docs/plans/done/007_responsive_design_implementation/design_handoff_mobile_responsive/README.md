# Handoff: Mobile-Responsive Design (Baleinev Comptes)

## Overview
Baleinev Comptes currently has no mobile layout — the sidebar-driven desktop shell is unusable on a phone. This handoff replaces the sidebar with a bottom bar on small screens and makes four apps fully usable on mobile: **Expense Reports, Tasks, Events, Passwords**. Every other app is ported (readable, no dead links) but reachable only through a secondary "… other" menu — it does not need bespoke mobile layout beyond the general rules below.

---

## Implementation status — updated 2026-08-20

**Done: the mobile top bar (2026-08-20).** The one piece of these mockups nobody had
built: `.phone-topbar`. Every screen still rendered the desktop heading on a phone —
`text-3xl` title, description paragraph, 32px of air — while the mockups have a
sticky, full-bleed, `--panel` strip closed by a rule. `<PageHeader>` now carries both
shapes off one breakpoint, so every app got it at once; nothing on desktop moved. What
came with it:

| What | Why it is not in a screen |
|---|---|
| `<PageHeader controls>` | A screen's own controls (Expense Reports' tab strip) ride *inside* the sticky bar instead of scrolling away from the list they switch. |
| `<SegmentedControl>` | The tab strip was a border-and-background recipe living in `expense-reports/tabs.tsx`; it is a primitive now, 44px segments straight from the control scale. |
| `<EmptyPage>` | The header description is desktop-only now, so the nine "no edition selected" screens — where that line was the *direction*, and the only thing on the page — say it as content in a dashed card. Their copy also stopped naming the sidebar: a phone has an Edition button. |
| `<Card flushOnMobile>` / `<SectionTitle desktopOnly>` | The history card wrapped its cardlets in a second surface and repeated the word the active tab already said. |

`expense-reports/tabs.tsx` renders the page header now, because the tabs belong inside
it — that is the whole reason a server page hands its title down to a client shell.
Verified at 390×844 against the local DB (sticky bar under scroll, both tabs, the
empty state) and at 1440px, where every screen is unchanged.

## Earlier status — updated 2026-08-19

**Done: the foundation.** The three cross-cutting sections of this handoff —
[General rules](#general-rules-apply-everywhere), [State Management](#state-management),
[Design Tokens](#design-tokens) — are implemented and on `main`. The mobile shell is
live, the design system carries the responsive rules, and every remaining screen is now
a *rendering* change against primitives that already exist.

**Done: Expense Reports (§2).** The first per-screen port is on `main` — the
History/New report tabs and the history cardlets. It is the worked example for every
remaining screen: read `expense-reports/tabs.tsx` and `expense-reports/client.tsx`
before starting one.

**Done: Events (§4).** Shift cards, the assign-staff row and the icon actions are on
`main` — see the section below for what shipped.

**Done: Journal (§6).** The 10-column table now renders as cardlets below `sm` — see
the section below for what shipped.

**Done: Calendar (§7).** The month grid is a dot calendar and the day timeline is an
agenda list below `sm` — see the section below for what shipped.

**Done: Budget (§8).** The department card's two four-column tables become a
read-only planned-vs-actual roll-up plus cardlets below `sm` — see the section below,
including where the data model forced a deviation from the mockup.

**Every *written* section of this handoff is now implemented** (the top bar the
mockups draw was not one of them — see the 2026-08-20 entry above), and
[Interactions & Behavior](#interactions--behavior-verified) has been walked bullet by
bullet against the shipped code — all seven behave as specified, in both locales, with
no gap to close. What is left is the per-screen
work this handoff never scoped: the admin-only tables (Invoices, Cost Centers, Money
Accounts, Users) are readable on a phone but still render as desktop tables, and the
Budget details modal is desktop-only. Follow the same recipe if you port them.

### What is on `main`

| Commit | What it added |
|---|---|
| `feat(ui): 44px touch targets below the lg breakpoint` | `components/ui/control.ts` is responsive: `md` and `sm` are both `h-11` below `lg`, `h-10`/`h-8` above. Button, IconButton, Input and Select inherit it. `Chip`'s remove button and `Modal`'s close button got real tap boxes. `Modal` gained `mobileFullScreen`. |
| `feat(ui): cardlets, the mobile stand-in for a wide table` | `components/ui/Cardlet.tsx` (`CardletList`, `Cardlet`, `CardletHeader`, `CardletFields`, `CardletField`, `CardletActions`) and `<Table desktopOnly>`. |
| `feat(shell): mobile bottom bar replaces the sidebar below lg` | `components/mobile/` (`mobile-shell.tsx`, `mobile-sheet.tsx`, `mobile-nav-button.tsx`), `components/navigation.ts`, the `hidden lg:flex` sidebar, `pb-24` on `<main>`, `SignOutButton nav`, four new `shell` dictionary keys, two sheet animation tokens in `globals.css`. |
| `docs: record the responsive rules in the design system` | `CLAUDE.md` and `docs/file-structure.md`. |
| `feat(expense-reports): tabs and cardlets on a phone` | `expense-reports/tabs.tsx` (the History/New report toggle), the history cardlets in `expense-reports/client.tsx`, and the `newReport` dictionary key. |
| `feat(events): shift cards and icon actions on a phone` | `events/client.tsx` (shift cards below `sm`, stacked event header, `Plus`/`Trash2` `IconButton`s for assign/delete-shift), `events/add-shift-form.tsx`, `events/create-event-form.tsx`, and the `deleteShift` dictionary key. |
| `feat(journal): cardlets on a phone` | `components/journal-table.tsx` (one shared `rows` array, `<Table desktopOnly>`, the cardlet list), the `deleteEntry` dictionary key, `mobileFullScreen` on the add-entry modal, a wrapping `Modal` footer, and a save-then-return on the `[journalEntryId]` edit form. |
| `feat(calendar): dot month grid and a day agenda on a phone` | `calendar/client.tsx` (day cells with dots below `sm`, the agenda list that replaces the hour timeline, one shared `kindClasses` colour map, `startLabel`/`rangeLabel`/`appointment` on the timeline items). No new dictionary key, no new component. |
| `feat(budget): planned vs. actual roll-up and cardlets on a phone` | `budget/client.tsx` (one `summaries` memo feeding the tables, the cardlets and the details modal; the `BudgetRollup` block; `<Table desktopOnly>`; the two duplicated account-type tables collapsed into one `sections.map`), and the `stillToEarn`/`aboveTarget` dictionary keys. No new component. |

Verified in the real app at 390×844 (admin role, local DB): bottom bar, apps sheet,
"… other apps" with Back, edition modal, full-screen Settings. Desktop at 1440px is
pixel-identical to before the change.

### Where the design deviated from the mockups, and why

The mockups are static HTML with their own CSS; the app has a token-enforced design
system (`npm run check:design` fails the build on drift). Where they disagreed, the
design system won:

> **Not the rule any more (2026-08-20).** Resolving these disagreements in the app's
> favour was never asked for. A mockup under `docs/plans/` is the approved target, so a
> radius or a type size it asks for is a change to the scale, not a violation — see the
> mockup rule in `CLAUDE.md`. Every radius below has since been reconciled with the
> mockups; the list is kept as a record of what shipped, not as a precedent.

- ~~**Sheet corners**~~ — reconciled 2026-08-21. The sheet is `rounded-t-4xl` (18px),
  as the mockup asked. 18px went into `@theme` as `--radius-4xl` rather than into
  `--radius-2xl`, so cards, panels and modals keep their 10px: the mockups give the
  mobile surfaces a hierarchy (card 10px, modal 14px, sheet 18px), and the sheet is the
  only thing at the top of it.
- ~~**Modals**~~ — reconciled 2026-08-21. `rounded-3xl` (14px); `--radius-3xl` was
  retuned from an unused 12px.
- ~~**Fields**~~ — reconciled 2026-08-21. Inputs, selects and textareas are `rounded-lg`
  (8px) while buttons stay `rounded-md` (5px), as the mockup has it. One line in
  `inputBaseClasses` — every field in the app shares that recipe.
- **Type** stays as it is — `text-3xs`/`text-sm` from the scale, not the mockup's
  `10px`/`13.5px`/`15px`. Decided 2026-08-21, not an oversight: `text-3xs` already *is*
  10px, and 13.5px/15px are close enough to `text-sm` (14px) that two more type tokens
  would cost more than they buy.
- **The sheet's close button** is a real `<IconButton>`, not a hand-rolled `h-9 w-9` box.
- **`SignOutButton`** got a `nav` prop (stacked icon + label) rather than the
  `iconOnly`/`className` passthrough `component-changes.md` guessed at; the shared
  recipe lives in `mobile-nav-button.tsx` so the bar's four buttons are identical.
- **`MobileShell` takes `locale` and `pendingTaskCount`**, not a `signOutLabel` string:
  every label comes from `dictionaries[locale].shell` (new keys: `apps`, `otherApps`,
  `switchEdition`, `back`, `close`), and the Tasks row carries the same pending-count
  bubble the sidebar shows. The app is bilingual — no hardcoded English in the shell.
- **Two animation tokens were added** to `globals.css` (`--animate-sheet-up`,
  `--animate-fade-in`) despite this doc's "no new tokens needed". The sheet is specified
  to slide up; Tailwind has no built-in for that, and a keyframe belongs in the token
  file rather than in a component.
- **`reference-source/`**, referenced under [Files](#files), was never delivered with
  this bundle. Read the live files instead — they are the current source of truth.

### Picking this up: what to do next

Everything below is per-screen work. The pattern is always the same, and the pieces are
already built — **do not add new primitives, and do not touch `components/mobile/`**:

1. **Wide table → cardlets** (Expense Reports history §2, Journal §6, Budget §8 — all
   done; use them as the pattern for the tables this handoff never scoped): wrap the
   existing `<Table>` in `desktopOnly`, then render the *same array* through
   `<CardletList>`. Never recompute a status label or a running balance for the mobile
   branch — lift the computation above both.
2. **Touch sizing** is already handled by the control scale. If a screen looks cramped
   on a phone, the fix is a layout class on that screen, not a height on a control.
3. ~~**Events (§4)**~~ — done. A screen whose rows are already cards needs no new
   primitive: the row becomes `flex-col … sm:flex-row`, the action cluster stacks, and
   the sub-44px `+`/`×` text buttons become `<IconButton>`s.
4. ~~**Journal (§6)**~~ — done. The pattern for a screen whose desktop row editor
   cannot fit in a card: link the cardlet's edit action to the existing full-page form
   route instead of rebuilding the editor inside the cardlet.
5. ~~**Expense Reports tabs (§2)**~~ — done. `expense-reports/tabs.tsx` is the pattern
   for any other screen that has to choose between two panels on a phone: a client
   wrapper that takes both halves as ReactNode props and keeps the toggle in local
   `useState`, never in server state.
6. ~~**Calendar (§7)**~~ — done. The pattern for a screen that is neither a table nor a
   list of cards: the same items, drawn a second way. Both views read one array whose
   labels and colours are computed once; the mobile branch adds no data of its own.
7. ~~**Budget (§8)**~~ — done. The pattern for a screen whose mockup asks for a number
   the data model does not carry: put the figure at the level that is true (here, the
   account type), say so in the code, and record the deviation here rather than
   inventing a per-row value.
8. Run `npm run check:design`, `npm run lint` and `npm run build` before committing;
   the design guard catches hardcoded hex, arbitrary radii, hand-sized controls and
   hand-rolled copies of existing components.

The two mockup HTML files remain the visual target for the screens that are still to do.

---

## About the Design Files
The two HTML files in this bundle (`admin-mobile.html`, `department-mobile.html`) are **design references built as static HTML/CSS/JS** — they are not production code and must not be copied into the Next.js app verbatim. They exist so you can open them in a browser, click through the interactions (bottom bar → apps sheet → other apps → back, settings, edition switcher, expense tabs, password reveal, sign up/withdraw), and see the exact spacing/type/color to target. The task is to **recreate this behavior inside the existing Next.js + Tailwind + `components/ui` system**, using the patterns already established in the codebase (server components, `"use client"` islands, the shared `Button`/`Modal`/`Badge`/`IconButton` primitives) — not to introduce a new framework or a new design system.

## Fidelity
**High-fidelity.** Colors, spacing, radii and type all use the app's real design tokens (`--page`, `--panel`, `--panel-strong`, `--line`, `--ink`, `--muted`, `--accent`, `--accent-strong`, and the existing radius scale). Recreate pixel-close, but treat exact copy/data in the mockups as placeholder — wire real data through the existing page/client/actions pattern.

## Why two files
The desktop sidebar already renders two different navigations for `role === "ADMIN"` vs `"DEPARTMENT"` (see `components/app-shell.tsx` lines 93–121). The mobile "… other" menu inherits that same split, so the two roles need to be reviewed as separate flows:
- **`admin-mobile.html`** — all 4 priority apps, plus an 8-item "other" menu (Dashboard, Calendar, Journal, Budget, Invoices, Cost Centers, Money Accounts, Users) and admin-only controls in Expense Reports (Approve/Reject, Record in journal) and Events (assign staff, delete shift/event).
- **`department-mobile.html`** — the same 4 priority apps, but "other" only has Calendar, Budget (and Money Accounts when `canManageMoneyAccounts` is true). Expense Reports history has no review actions (a department user submits, they don't approve). Events has no management controls, sign up/withdraw only. Adds a read-only Budget screen (department's own budget lines, planned vs. actual).

## Screens / Views

### 1. Mobile shell (bottom bar + sheets) — both roles ✅ DONE
*Built as `app/components/mobile/`. The spec below is what shipped; read it as documentation, not as work to do.*
- **Purpose**: replace the sidebar as the primary navigation surface below the `lg` breakpoint.
- **Layout**: a `position: fixed` bar pinned to the bottom of the viewport, `lg:hidden`, height ≈ 64px content + safe-area padding, 4 evenly-spaced buttons (`justify-around`), background `var(--panel-strong)`, `border-top: 1px solid var(--line)`.
- **Buttons** (left→right): **Apps** (grid icon), **Edition** (layers icon + short code like "25–26"), **Settings** (sliders icon), **Sign out** (existing `SignOutButton`, icon-only on mobile).
- **Apps sheet**: tapping Apps slides up a bottom sheet (`border-radius: 18px` top corners, `var(--panel-strong)`, drag handle, dimmed backdrop that closes on tap-outside). Primary view lists the 4 priority apps as 56px rows (icon box + label + chevron) plus a 5th "… other" row. Tapping "… other" swaps the sheet's content to a second list with a "‹ Back" button in the header — it does not stack a second sheet.
- **Settings**: tapping Settings opens the *existing* Settings `Modal` (language + refund details) but full-screen on mobile — see the `Modal.tsx` change below. It stays conceptually a modal (dismissible, no route change), just edge-to-edge.
- **Edition switcher**: tapping Edition opens a `Modal` containing the *same* edition `<Select>` already in the sidebar (reuse `selectEdition()`), so there is no duplicated switching logic — just a different container.

### 2. Expense Reports (priority) — both roles, admin sees more actions ✅ DONE
- **Layout**: the desktop `xl:grid-cols-[420px_1fr]` split (create form beside history) collapses to a single column below `xl`, and on mobile becomes two tabs — **Create** / **History** — in a segmented control under the page title, so the user isn't scrolling past a long create form to reach their history.
- **Create tab**: existing `<Field>` + `<Select>`/`<Input>` stack, unchanged fields, but every control is a fixed `44px` tall (`box-sizing: border-box`) — the current `Input`/`Select` recipe (`rounded-2xl px-4 py-3`) computes taller than 44px with `min-height` because padding adds on top of it; use `height` + `box-sizing: border-box` instead of `min-height` for the mobile stack, or give mobile inputs their own compact height token.
- **History tab → cardlets**: replace the `<table>` with one card per report. Each cardlet: description + status badge on top, a 2-column field grid (Date/Type, Department/Amount), a muted line for driving-route or "Submitted by", then full-width stacked actions (Approve primary, Reject destructive) for pending rows on admin, "Record in journal" outline button for approved rows on admin, nothing but the status + rejection reason for department users or resolved rows.

**How this shipped** — and what a later screen should copy:
- **The tabs are a layout wrapper, not a page rewrite.** `tabs.tsx` is a `"use client"`
  component that takes the two halves as `create` / `history` **ReactNode props** from
  the server page, so neither half became a client component to get a tab. It owns the
  `xl:grid-cols-[420px_1fr]` grid that used to live in `page.tsx`; the segmented control
  is `lg:hidden` and both panels stay **mounted** (`hidden lg:block`, not unmounted) so a
  half-typed report survives a tab switch.
- **The segmented control is two `<Button>`s** (`primary` when active, `ghost` when not)
  in a `rounded-lg bg-[var(--panel-strong)] p-1` strip — no new primitive, and the 44px
  height comes from the control scale for free.
- **A closed edition renders no tab bar at all.** `WritableEditionOnly` already empties
  the create half, so `tabs.tsx` reads the same `useEditionReadOnly()` context and falls
  back to the history alone rather than offering a tab that leads nowhere.
- **One array, one set of derived values.** `client.tsx` computes `statusLabel`,
  `statusTone`, `typeLabel`, `paymentLabel`, `amountLabel`, `drivingSummary`,
  `bankInfoTitle`, `canReview` and `canRecord` **once**, above both views; the
  `<Table desktopOnly>` and the `<CardletList>` only render them. Do exactly this in §6
  and §8 — no second status mapping, no second running-balance pass.
- **The cardlet carries every column the table does**, so a phone user is never shown
  less: six `<CardletField>`s (Date/Type, Department/Amount, Payment method/Proof) plus
  the driving route, the submitted-by/reviewed-by line and the rejection reason.
- **Deviations from the mockup**: dates stay `YYYY-MM-DD` (the desktop table's format —
  a second date format would be drift, not fidelity), and the admin bank-info `i` badge
  is desktop-only because its content lives in a `title` tooltip, which a touch device
  cannot open. Payouts happen on desktop; approving does not need the IBAN.
- **The submit button is `w-full lg:w-auto`** — the one layout class this section added
  to a screen. Control *heights* still come only from the scale.
- **Tab labels needed one new dictionary key.** `expenseReports.create` is "Create
  expense report" / "Créer une note de frais" — too long for half a 390px strip — so the
  tabs use `history` plus a new `newReport` ("New report" / "Nouvelle note").

Verified at 390×844 against the local DB in both roles: admin sees Approve + reason +
Reject on pending rows and Record in journal on approved ones; a department user sees
their own rows with the status and rejection reason and no review actions. Desktop at
1440px and tablet at 768px are unchanged apart from the tab strip appearing below `lg`.

### 3. Tasks (priority) — both roles ✅ DONE
*Needed nothing beyond the global 44px control floor, which is now in `components/ui/control.ts`.*
- Already a single column of cards on desktop (todo cards + standalone task cards) — no structural change needed below `lg`, this screen mainly validates the bottom-bar overlay pattern. Bump the "Mark done" / status buttons to full-width 44px.

### 4. Events (priority) — admin sees management controls, department sees sign up only ✅ DONE
- Event header card → day sections (unchanged structure) → shift cards. On mobile, each shift is a full-width card: role/time/spots info, then a full-width Sign up/Withdraw button. Admin-only: an "Assign staff" row (`Select` + 44×44 icon button) and a 44×44 delete-shift `IconButton` (replacing today's inline `×` text buttons, which are well under the 44px minimum) — gate all of it behind `canManageEvents` exactly as today.

**How this shipped:**
- **No new component, no new state.** The shift row is the same markup with a
  direction switch: `flex flex-col gap-3 … sm:flex-row sm:flex-wrap sm:items-center
  sm:justify-between`. The action cluster does the same, so on a phone the info block
  is followed by stacked, full-width actions and from `sm` it is one dense line again.
- **The breakpoint is `sm`, not `lg`.** Below `lg` the sidebar is gone, so at 768px the
  row has *more* room than it does on desktop — a full-width 660px "Sign up" would be a
  worse design, not a more touchable one. The 44px control floor still applies below
  `lg` either way, so the tablet row is touch-sized without being stretched. Same
  breakpoint the table→cardlet split uses.
- **`+` and `×` are gone.** Assign staff is `<IconButton tone="accent">` with a `Plus`,
  delete shift is `<IconButton tone="delete">` with a `Trash2` — both `type="submit"`
  inside the form they already lived in, so the server actions are untouched. They come
  out of `controlSquare` at 44×44 on a phone and 32×32 on desktop, which is the whole
  reason the scale exists. The delete sits `self-end` on a phone, as in the mockup.
- **Delete event stays a labelled `<Button>`**, not the mockup's bare trash icon: it is
  destructive and irreversible, and desktop should not change. It just goes full-width
  next to Export PDF below `sm`.
- **One new dictionary key**: `deleteShift` ("Delete shift" / "Supprimer le shift") —
  the `×` button had no accessible name at all before, and `IconButton` requires one.
- **The two admin forms on this screen got a mobile width, nothing else**: the event-type
  name/description inputs and the add-shift description field are `w-full` /
  `grow` on a phone and go back to their fixed widths at `sm`.

Verified at 390×844, 768 and 1440 in both roles against the local DB: a department user
sees the event header, the day sections and a full-width Sign up/Withdraw and nothing
else; an admin additionally gets the assign row, the delete-shift icon, the day-off
toggle and Add shift. Sign up, assign-staff and delete-shift were each submitted from
the phone layout and checked in the database. Desktop at 1440px is unchanged apart from
the two icon buttons replacing the `+`/`×` text buttons.

### 5. Passwords (priority) — both roles ✅ DONE
*Same: the `IconButton` floor covers it. Re-check on a device once §2 and §4 land.*
- Already fairly responsive (`flex-col lg:flex-row` in `EntryRow`) — the main mobile change is sizing: bump `IconButton` touch targets and make the reveal/copy/2FA row wrap onto its own line under the password code on narrow screens. Reveal toggles the same `<code>` element's text between `••••••••••` and the plaintext value — do **not** render a second element for the revealed value.

### 6. Journal (secondary, admin only) — cardlets ✅ DONE
- The desktop table is 10 columns (`Date, Department, Type, Amount, Label, Beneficiary, Account, CC, Balance, Actions`) — far too wide for a phone. Below `sm`, replace it with the same cardlet pattern as Expense Reports: header (label + amount, colored by Charges/Produits), a 2×2 field grid (Department/Account, Cost center/Beneficiary), a running-balance line, then Edit/Delete `IconButton`s (or a "Locked" note for opening/linked entries).

**How this shipped:**
- **One array, one set of derived values** — as in §2. `journal-table.tsx` builds a
  `rows` array once (date, department, type, amount, beneficiary, cost center, the
  running balance, the invoice href, `isLocked`, `deleteDisabled`) and *both* the table
  and the cardlets render it. The running balance in particular is computed exactly
  once, from the opening balances and the journal sequence, as it always was.
- **Filtering and sorting stay desktop-only.** They live in the table's `<THead>`, which
  `desktopOnly` hides below `sm`; a phone gets the entries in journal order. The panel
  header's "Showing N of M" is fed by the same filtered array, so it stays truthful.
- **Editing on a phone is the full-page form that already existed** at
  `/journal/[journalEntryId]` — until now nothing linked to it. Seven controls do not
  fit inside a card, and rebuilding the inline row editor as a cardlet form would have
  been a second editor to keep in sync. The cardlet's `Pencil` is a `<Link>` styled with
  `iconButtonClasses("accent")`; the desktop table keeps its inline editor untouched.
  The form got the one thing it was missing: on a successful save it `router.push`es
  back to `/journal`, the way closing the inline editor does. Cancel already did.
- **Locked states match desktop exactly**: an opening entry or a closed edition renders
  a muted `LOCKED` line and no actions at all; an invoice-linked entry can still be
  edited but its delete is disabled and labelled "locked".
- **Two extras the screen needed to be usable, not just readable**: the add-entry modal
  is `mobileFullScreen` (eight fields in a centered box on a 390px phone is not a form),
  and `Modal`'s footer is now `flex-wrap` — the three-button journal footer
  ("Fermer / Enregistrer et fermer / Enregistrer et nouveau") overflowed 390px in
  French. Neither changes any desktop layout.
- **One new dictionary key**: `deleteEntry` ("Delete entry" / "Supprimer l'écriture").
  The delete `IconButton` was previously labelled `copy.actions` ("Actions") in both its
  tooltip and its accessible name — wrong on desktop too, so both views now use the new key.
- **A type fix in the primitive**: `CardletHeader`'s `title` is documented as a
  `ReactNode` but intersected with `HTMLAttributes`' `title: string`, so it only ever
  accepted a string. It is `Omit`ted now — the journal header stacks `#seq · date` above
  the label, which is exactly the case the prop was written for.
- **Deviations from the mockup**: dates stay `YYYY-MM-DD` (the desktop format, as in §2);
  the running-balance line is labelled with the existing `balance` key ("Balance" /
  "Solde") rather than a new "Running balance" string; and an invoice-linked entry shows
  its **label** as the link to the PDF, where the desktop cell shows the raw URL as the
  link text — a truncated `/api/invoices/<cuid>/pdf` tells a phone user nothing. The
  desktop cell was left exactly as it was.

Verified at 390×844, 768 and 1440 against the local DB, in both locales: the phone shows
four cardlets (opening entry, invoice-linked, earnings, charges) with no horizontal
overflow and no sub-44px tap target; editing an entry from a cardlet and deleting one
were both submitted from the phone layout and checked in the database; a closed edition
renders three `LOCKED` cardlets with no actions and no Add button. Desktop at 1440px is
pixel-identical to before the change apart from the delete tooltip now reading "Delete
entry" — the pre-existing column overlap in the desktop table (Label/Beneficiary) was
there before this change and is untouched.

### 7. Calendar (secondary, both roles) ✅ DONE
- The desktop `xl:grid-cols-[1.2fr_0.8fr]` (month grid beside a hour-by-hour day timeline) collapses to one column: month grid on top (7-col grid of day cells, task/appointment dot indicators), then a simple agenda list for the selected day below (not the absolute-positioned hour timeline — too fine-grained for touch) — colored by task (green) vs. appointment (rose), same as the existing color coding.

**How this shipped** — the whole port is `calendar/client.tsx`; no new component, no new
dictionary key, no change to `page.tsx`, `actions.ts` or the create form:
- **The one-column collapse was already there.** `xl:grid-cols-[1.2fr_0.8fr]` stacks on
  its own below `xl`, so nothing in the section wrapper changed. What did not fit was the
  *content* of the two cards, and that is all this section touches.
- **The day cell has two shapes, one behaviour.** Below `sm` it is a centred number with
  a dot per kind (green task, rose appointment) in a `gap-1` grid — seven columns leave
  ~42px each on a 390px phone, which is room for a number and two 4px dots and nothing
  else. The badges (`1 task(s)`, `2 appointments`) are wrapped in a `hidden … sm:flex`
  div, so they come back untouched at `sm`. The counts behind both are the same
  `taskCountsByDay` / `appointmentCountsByDay` maps as before.
- **`sm:block` is load-bearing.** A `<button>` vertically centres its own content, which
  is what put the desktop day number in the middle of its cell. The mobile branch makes
  the cell a flex column, so the `sm` branch has to hand the layout *back* to the button
  (`sm:block`) rather than restating it as `sm:items-stretch sm:justify-start` — that
  version was one pixel row off, and the screenshot diff caught it.
- **The agenda replaces the timeline below `sm`, and reads the same array.** The existing
  `timelineItems` memo now also carries `startLabel` (`HH:MM`), `rangeLabel`
  (`HH:MM–HH:MM`, and **null** unless the appointment has a real `endAt` — a task's end
  is a synthetic +45min and must not be printed as fact) and the source `appointment`.
  The agenda maps that array in start order; the timeline maps the same objects with the
  same overlap/column maths it always did.
- **One colour mapping.** `kindClasses` is a module-level constant (`task` → emerald,
  `appointment` → rose) read by both views, and `kindLabel` maps the kind to the existing
  `copy.tasks` / `copy.appointments` keys once per render. Neither view owns a colour.
- **Actions are the same actions.** A task row is an `<a>` to the same `/tasks` or
  `/events` href the timeline block uses; an appointment row opens the same
  `openAppointmentDetails()` modal, so edit/delete stay the one implementation with the
  same `createdById === currentUserId` guard. The timeline no longer needs
  `dayAppointments.find(...)` — it reads `item.appointment`.
- **Not done, deliberately**: the month header keeps its three text buttons
  (Previous / Next / Today) rather than the mockup's chevron `IconButton`s. They already
  fit on one line at 390px in both locales and are already 44px tall from the control
  scale, so swapping them would have changed desktop for no mobile gain. The weekday
  strip stays `Mon…Sun` (hardcoded English before this change, unchanged by it) and the
  day heading keeps `toLocaleDateString`'s browser locale, exactly as desktop does.

Verified at 390×844, 768 and 1440 against the local DB, admin and department roles, in
both locales: no horizontal overflow at 390 (there was 3px of it before this change) and
no tap target under 40×44 anywhere on the page; the dots, the agenda order (09:00 task,
09:30 appointment with no end, 14:00–15:00 appointment), tapping a day cell to move the
agenda, and opening an appointment's details from an agenda row were all exercised on the
phone layout. The 1440px and 768px screenshots are **byte-identical** before and after.
Test appointments and the test task were removed from the local DB afterwards.

### 8. Budget (secondary, department-only in this handoff) ✅ DONE
- New read-only mobile view: one cardlet per budget line (label, Charges/Produits badge, planned amount, actual amount rolled up from journal entries, a thin progress bar, and a remaining/over-budget line). No create/edit affordances on mobile for either role in this pass — budget management stays desktop-only for now.

**How this shipped** — the whole port is `budget/client.tsx` plus two dictionary keys;
no new component, no change to `page.tsx` or `actions.ts`:
- **The mockup asks for a number the data model does not carry.** A `JournalEntry`
  carries a `departmentId` and a `CHARGES`/`PRODUITS` type — never a `budgetLineId`
  (`prisma/schema.prisma`), which is also why the dashboard compares budget to actuals
  per department, not per line. There is no honest per-line actual to print, and
  matching journal labels to budget labels would have invented one, so **planned vs.
  actual, the progress bar and the gap line sit on the account-type section** — the
  level at which the number is true — and the per-line cardlet carries what the table
  row it replaces carries: label, amount, notes.
- **The section roll-up is `BudgetRollup`**, a file-local block, not a new primitive:
  `nestedSurfaceClasses` for the surface, `CardletFields`/`CardletField` for the two
  figures (so the label recipe is not rewritten), a `h-1.5 rounded-full` track and a
  `role="progressbar"` fill whose only inline style is its width percentage.
- **The gap is worded per account type.** Charges reuse the details modal's existing
  `available`/`overexpense` wording, so the same quantity reads the same in both places.
  Earnings needed the opposite reading — money left to earn is not good news — hence the
  two new keys, `stillToEarn` and `aboveTarget`. Four states are reachable and all were
  exercised: over budget (rose, full bar), under budget (accent), still to earn (empty
  bar), above target (emerald, full bar).
- **One computation, three readers.** `summaries` (a `useMemo` over `departments`) is
  now the only place a budget or actual total is summed; the desktop tables, the phone
  cardlets and the details modal all read it. The modal used to re-filter and re-sum the
  same department, and now takes `detailsDepartmentId` instead of a snapshot of the
  department object, so it cannot show stale figures after a `router.refresh()`.
- **The two account-type tables became one `sections.map`.** They were duplicated
  verbatim — ~110 lines that had to be edited twice — and the mobile branch would have
  made it three. Both tables render from the same JSX; 1440px and 768px are
  byte-identical to before the change.
- **No badge on the cardlet.** The mockup's flat list needs a Charges/Produits badge on
  every card; here the cards sit under the section heading that already names the type,
  so repeating it on every card is the "explanatory label that states the obvious" the
  design rules forbid. The line's amount takes the header's trailing slot instead, the
  way the journal cardlets carry theirs, and `Notes` renders full-width only when the
  line has any.
- **Not done, deliberately**: every management affordance is `hidden sm:flex` — Add
  department, Add budget entry, Delete department, and the per-line edit/delete that
  live inside the desktop-only table. **View details goes with them**: the modal behind
  it is three wide tables, and its headline figures (charges availability, budgeted and
  actual result) are exactly what the phone roll-up now shows inline. Porting that modal
  is a separate job; the phone loses only the journal-entry list.

Verified at 390×844, 768 and 1440 against the local DB, admin and department roles: no
horizontal overflow at any width, no tap target under 44px on the phone, and the 768px
and 1440px screenshots — page and details modal — are **byte-identical** before and
after. Test departments, budget lines and journal entries were removed from the local DB
afterwards.

## General rules (apply everywhere) ✅ DONE
- **Cards in a row → one column.** The existing `Card`/`CardGrid` span classes (`col-span-12 sm:col-span-6 lg:col-span-3`, etc. in `components/ui/Card.tsx`) already default to full width below `sm` — **no change needed there**, just don't add a new `grid-cols-*` without a mobile override.
- **Wide tables → cardlets.** Applies concretely to Expense Reports history and the Journal table (both above). Any other admin table you port later (Invoices, Cost Centers) should follow the same recipe: a `hidden sm:block` table + a `sm:hidden` cardlet list mapped from the same array.
- **Touch targets ≥ 44px.** The `Button` component is already `h-10` (40px) — bump to `h-11` (44px) at the component level, or pass a mobile-specific className, rather than special-casing every call site. `IconButton` is `h-9 w-9` (36px) — same treatment.

**How this shipped:**
- *Cards → one column*: confirmed, no change. `Card`'s span classes all start at `col-span-12`.
- *Wide tables → cardlets*: both halves of the recipe are components now — `<Table desktopOnly>` (hides the table below `sm`) and `components/ui/Cardlet.tsx`. Screens compose them; they do not re-write the recipe.
- *Touch targets*: solved once, in the scale. `controlHeight`/`controlSquare` in `components/ui/control.ts` resolve to `h-11` below `lg` and to `h-10`/`h-8` above it, so `Button`, `IconButton`, `Input` and `Select` are all 44px on a phone and unchanged on desktop. **Do not add `h-11` at a call site** — `npm run check:design` rejects hand-sized controls outside `components/ui/`. The two tap targets that live outside the scale, `ChipRemoveButton` and `Modal`'s close button, were sized in their own components.


## State Management ✅ DONE
- `MobileShell` (new): local `useState` for which sheet is open (`'closed' | 'apps-primary' | 'apps-other' | 'settings' | 'edition'`) — a single enum avoids the "two things open at once" bugs a boolean-per-sheet approach invites.
- Settings and edition-switching state/logic already exist in `AppShell` (`selectedLocale`, `refundFirstName` etc., `saveSettings()`, `selectEdition()`) — **pass them down as props to `MobileShell` rather than duplicating them.**
- Expense Reports tab state: new local `useState` in the mobile-only wrapper, not shared with server state.

**How this shipped:** `MobileShell` holds `useState<Sheet>` with `Sheet = "closed" | "apps-primary" | "apps-other" | "edition"`, exactly as specified. Settings is *not* in the enum: it opens `AppShell`'s existing modal through an `onOpenSettings` prop, so there is one settings implementation rather than two. `selectEdition`, `switchingEdition`, the `editions` array and the `navigation` array are all passed down from `AppShell` — `MobileShell` duplicates no state and owns no fetch. The Expense Reports tab state shipped as specified: `useState<'history' | 'create'>` local to `expense-reports/tabs.tsx`, defaulting to `history` (the mockup's active tab).

## Design Tokens ✅ VERIFIED
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

**Verified** against `app/app/globals.css` and `components/ui/Badge.tsx`: all eight color tokens, the radius scale and the three status tones are present and match the values above exactly. Nothing was added except the two sheet animations noted in the status section — reach for a token, never a literal, and let `npm run check:design` prove it.

## Interactions & Behavior ✅ VERIFIED
- **Apps sheet**: slide up from the bottom nav's Apps button; tap the backdrop or the ✕ to close; "… other" swaps the sheet's inner content (not a second sheet) with a "‹ Back" affordance; selecting an app row navigates and closes the sheet.
- **Settings**: opens full-screen from the Settings nav button; ✕ or "Save changes" closes it; same `saveSettings()` logic as desktop.
- **Edition switcher**: opens a modal from the Edition nav button; selecting a non-current edition calls the existing `selectEdition(id)` (POST to `/api/preferences/edition`, then `router.refresh()`) and closes the modal; the nav button's label updates to the new short code once the page re-renders with the new `selectedEditionId`.
- **Expense Reports tabs**: client-side only, no navigation — `useState<'create' | 'history'>` local to the mobile view.
- **Password reveal**: toggles the same code element's text + swaps the eye/eye-off icon; no extra element.
- **Sign up / Withdraw**: same server actions as desktop (`signUpForShiftAction` / `withdrawFromShiftAction`), just triggered from the full-width mobile button instead of the desktop-sized one.
- **Responsive breakpoint**: use Tailwind's `lg` breakpoint (1024px) as the sidebar/bottom-bar switch point, matching the existing `lg:p-8` / collapse behavior already in `app-shell.tsx`.

**Verified** bullet by bullet against the shipped code — every behaviour above is
implemented, in both locales, and nothing here needs new work:

| Behaviour | Where it lives |
|---|---|
| Apps sheet slides up; backdrop or ✕ closes | `mobile-sheet.tsx` — `animate-sheet-up`, `onClick={onClose}` on the backdrop with `stopPropagation` on the panel; the ✕ is a real `<IconButton>` in `mobile-shell.tsx` |
| "… other" swaps the sheet's content, with "‹ Back" | `mobile-shell.tsx` — one `<MobileSheet>` open for both `apps-primary` and `apps-other`; the back control is a `ChevronLeft` + `copy.back` button that sets the state back. The sheet never stacks. |
| Selecting an app navigates and closes | each row is a `<Link>` with `onClick={() => setSheet("closed")}` |
| Settings opens full-screen; ✕ or Save closes | `onOpenSettings` opens `AppShell`'s own `<Modal … mobileFullScreen>` (`h-full rounded-none sm:h-auto`); `saveSettings()` sets `isSettingsOpen` false on success. One implementation, shared with desktop. |
| Edition switcher calls `selectEdition(id)` and closes | `mobile-shell.tsx`'s `<Modal>` calls the `onSelectEdition` prop — `AppShell.selectEdition`, POST `/api/preferences/edition` + `router.refresh()` — then `setSheet("closed")`. The bar's label is `shortEditionLabel(selectedEdition.name)`, so it follows the refreshed `selectedEditionId` prop. |
| Expense Reports tabs are client-side only | `expense-reports/tabs.tsx` — `useState<Tab>` where `Tab = "history" \| "create"`, no navigation, both panels stay mounted |
| Password reveal toggles one element + swaps the icon | `passwords/client.tsx` — the same `<code>` renders `{revealed ?? "••••••••••"}` and the button renders `revealed ? <EyeOff /> : <Eye />`. No second element. |
| Sign up / Withdraw use the desktop server actions | `events/client.tsx` — `useActionState(signUpForShiftAction …)` / `(withdrawFromShiftAction …)`, submitted from a `w-full sm:w-auto` button |
| `lg` is the sidebar/bottom-bar switch | `app-shell.tsx`'s `<aside>` is `hidden … lg:flex`; `MobileShell`'s bar and sheet are `lg:hidden` |

Three places do slightly more than specified, all supersets — none is a deviation to
undo:
- **Dismissal is wider than "backdrop or ✕".** `MobileSheet` also closes on Escape, and
  the settings modal keeps a Cancel button beside Save. A phone never sees Escape; both
  cost nothing and match `Modal`'s existing contract.
- **The Apps sheet carries the Tasks pending-count bubble**, the same one the sidebar
  shows — the bar is the only nav on a phone, so the count has to be reachable there.
- **Full-width buttons switch at `sm`, not `lg`.** The bullet's `lg` governs the
  shell; inside a screen, a control goes full-width when its own layout stacks, which
  the design system fixes at `sm` (`CLAUDE.md`, "Responsive"). The shell switch point
  is untouched.


## Assets
No new image assets. Icons are simple inline SVGs (grid, layers, sliders, log-out, chevrons, eye/eye-off, copy, pencil, trash, search, home, calendar, book, wallet, receipt, target/bullseye, users, landmark) drawn to match the existing `lucide-react` icon weight (1.6–1.8px stroke) already used throughout the app — swap them for the matching `lucide-react` imports during implementation (e.g. `Grid2x2`, `Layers`, `SlidersHorizontal`, `LogOut`) instead of inline SVG.

## Files
- `admin-mobile.html` — standalone reference, admin role, 6 phones (Tasks/shell, Expense Reports, Events, Passwords, Journal, Calendar).
- `department-mobile.html` — standalone reference, department role, 6 phones (Tasks/shell, Expense Reports, Events, Passwords, Budget, Calendar).
- ~~`reference-source/`~~ — never delivered with this bundle. Read the live files in `app/` instead; they are ahead of anything a snapshot would show.
- `component-changes.md` — file-by-file, line-annotated current → new code for the actual Next.js implementation. **Its §1–§3 (Modal, app-shell, mobile-shell) are implemented — the real files differ from the snippets there and are the source of truth. §4–§7 are still the plan.**
- The original interactive exploration (`Mobile Design Proposal.dc.html` in the parent project) is background/process reference only — these two HTML files supersede it as the handoff artifact.
