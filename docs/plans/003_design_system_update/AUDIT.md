# Graphics Design Audit — Baleinev Backoffice

Scope: every screen under `app/app/(app)/`, `app/app/(auth)/`, and shared components in
`app/components/`. Findings are cited as `file:line` against `main`.

## What's already working

- `app/app/globals.css` defines real design tokens (`--page`, `--panel`, `--panel-strong`,
  `--line`, `--ink`, `--muted`, `--accent`, `--accent-strong`) and a tight radius scale via
  `@theme`. Nobody hardcodes hex — that discipline holds app-wide.
- `app/lib/button-classes.ts` centralizes 6 button treatments, and `npm run check:design`
  blocks hardcoded hex / arbitrary `rounded-[Npx]` / raw `var(--space-…)`.
- `h1` (`text-3xl font-semibold tracking-tight`) and modal/section `h2`
  (`text-xl font-semibold`) are consistent almost everywhere — good baseline typography
  discipline emerged from copy-paste even without a shared component.

The problem isn't a lack of intent — it's that the system covers colors and radii, but
stops before it reaches buttons, cards, fields, and modals as *components*. Those are all
hand-copied Tailwind strings, so they drift every time someone writes a new screen.

## Findings by element

### 1. Buttons & action icons
`buttonClasses` is imported in **2 of ~20 screen files** (`passwords/client.tsx`,
`tasks/client.tsx`). Everywhere else, buttons are written inline and disagree:

- `budget/client.tsx:139` — "Add department" button has no `rounded-*` class at all
  (square corners), the only button in the app without one.
- `invoices/client.tsx` create-invoice action is a bare `+` glyph in a `h-10 w-10
  rounded-md` square button — a third distinct "primary add" treatment, next to budget's
  bordered icon+label button and `buttonClasses.primary`'s filled pill.
- Row actions in `invoices/client.tsx` hand-roll colors that aren't in `button-classes.ts`
  at all: amber-300 for "mark unpaid", emerald-300 for "mark paid", rose-300 for delete.
  The instinct (action type → color) is exactly right, it's just never been captured as a
  shared tone.
- Icon sizes have no rule: `h-3 w-3` (budget inline row actions), `h-3.5 w-3.5` (budget/
  invoices row actions), `h-4 w-4` (nav, header actions — the majority), `h-5 w-5` (modal
  close only). Four sizes for what should be one or two.

### 2. Cards
The dominant pattern, `rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)]
p-5`, repeats identically about 15 times (departments, cost-centers, editions, money-
accounts, templates, users, budget) — consistent today only because everyone copy-pasted
the same line, with zero enforcement.

- **Visible break:** `app/app/(app)/page.tsx:120` — the dashboard's money-account cards
  use `rounded-3xl bg-[var(--panel-strong)] p-5` with **no border** — a different radius
  token and missing border versus every other card in the app. `rounded-3xl` isn't an
  "arbitrary radius" so `check:design` doesn't catch it.
- The dashed empty-state card (`rounded-2xl border-dashed … p-6`) is its own repeated
  literal, used ~6 times, also with no shared component.

### 3. Text fields, dropdowns, textareas
Most fields do use one identical literal: `w-full rounded-2xl border border-[var(--line)]
bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]` —
50+ occurrences across budget, cost-centers, departments, editions, expense-reports,
invoices, money-accounts, templates, users. That's good visual consistency purchased at
the cost of 50 copies of the same string with no single place to change it.

Real breaks:
- `app/components/app-shell.tsx` settings-modal inputs use `rounded-xl … px-3 py-2
  text-sm` — different radius, padding and font size than the canonical field.
- The sidebar edition-picker (`app-shell.tsx`) uses a third, denser recipe: `rounded-md …
  px-2 py-1.5 text-sm`. Reasonable for a compact context, but never named as an
  intentional variant — just another one-off.
- `budget/client.tsx:118` defines a local `inp` constant for inline table-cell editing:
  `rounded border … px-2 py-1 text-xs`. `rounded` (bare) is Tailwind's *default* 4px
  radius, not one of this app's token utilities (`rounded-sm/md/lg/xl/2xl`) — it silently
  bypasses the radius scale, and `check:design` doesn't catch it because the rule only
  flags `rounded-[…]`.
- Every native `<select>` (15+ instances) uses the browser's default arrow — no visual
  affordance ties it to the rest of the field system.

### 4. Checkboxes
Only 5 checkboxes exist in the whole app (`calendar/create-appointment-form.tsx` ×3,
`editions/client.tsx`, `passwords/client.tsx`). Only one has any styling
(`editions/client.tsx:219`: `size-4 rounded border-[var(--line)]`) — the other four render
as bare, unstyled browser checkboxes. Smallest element, biggest visible gap.

### 5. Modals
Three structurally different implementations of "modal," each reinvented per screen:

- **Two-div pattern** (separate fixed backdrop + separately positioned/translated panel):
  `app-shell.tsx` settings, `budget/client.tsx` (×3), `passwords/client.tsx` (×2),
  `add-journal-entry-modal.tsx`.
- **Single flex-centered wrapper** (backdrop and panel in one flex container): `invoices/
  client.tsx` (paid modal), `tasks-create-modal.tsx`, `calendar/client.tsx`.
- Sizes are ad hoc per screen: `max-w-md` / `max-w-lg` / `max-w-xl` / `max-w-2xl` /
  `max-w-3xl` / a bespoke `w-[95vw] h-[90vh]` (budget department details) — no shared
  size scale.
- `shadow-lg` appears on some modals (app-shell, budget, passwords) and not others
  (invoices, tasks-create-modal, calendar) — inconsistent elevation for the same kind of
  surface.

### 6. Status badges / pills
Seven independent one-off implementations of what is clearly the same "status chip"
concept, each with its own size, tracking and padding:

| Location | Recipe |
|---|---|
| `calendar/client.tsx:438,443` | `rounded-full bg-emerald/rose-500/20 px-2 py-0.5 text-[10px]` |
| `editions/client.tsx:60,65` | `rounded-full bg-emerald-900/40 / slate-700/60 px-3 py-1 text-xs uppercase tracking-[0.18em]` |
| `events/client.tsx:341` | `rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase` |
| `expense-reports/client.tsx:170` | `h-4 w-4 rounded-full border text-[10px]` (numbered circle) |
| `passwords/client.tsx:321` | `rounded-full border bg-[var(--panel)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em]` |
| `templates/client.tsx:65` | `rounded-full bg-[var(--panel)] px-2 py-1 text-[10px]` |
| `login-form.tsx:49` | `rounded-full border bg-[var(--panel-strong)] px-3 py-1 text-[11px] uppercase tracking-[0.24em]` |

### 7. Tables
No shared table component — `journal-table.tsx`, `budget/client.tsx` (4 inline tables),
`invoices/client.tsx`, `expense-reports/client.tsx` and `page.tsx` each rebuild `<table>`
from scratch. Header treatment alone has two variants: `bg-[var(--panel-strong)]`
(budget, dashboard, journal-table) vs `bg-[var(--panel)]` (invoices, expense-reports), and
invoices additionally adds `text-xs uppercase tracking-[0.08em]` that nowhere else uses.

## Root cause

Every element above is a Tailwind *string*, not a *component*. The design-token layer
(`globals.css`) is real and enforced; the component layer never got built, so each screen
re-derives buttons, cards, fields, modals and badges from the tokens independently —
close enough to look intentional, different enough to be visibly inconsistent (the
dashboard cards, the budget "Add department" button, the unstyled checkboxes).

## Recommendations

1. **Adopt the component library in `design-system/components/`** (delivered alongside
   this audit) in place of hand-written classNames: `Button`, `IconButton`, `Card`,
   `Field`/`Input`/`Textarea`/`Select`, `Checkbox`, `Modal`, `Badge`, `Table`. See
   `DESIGN-SYSTEM.md` for the full spec and usage.
2. **Retire `app/lib/button-classes.ts`** once screens migrate to `<Button>`/
   `<IconButton>` — a typed component catches misuse (e.g. a 5th color) that a string
   map can't.
3. **Extend `check:design`** to flag bare `rounded` (not just `rounded-[…]`), and to warn
   on the specific literal field/card strings this audit found duplicated 15–50 times, so
   new duplicates fail CI once the shared components exist.
4. **Migration order** (highest visible impact first): dashboard cards (1-line fix) →
   checkboxes (5 instances, cheap) → modals (consolidates the most duplicated, riskiest
   code) → buttons/icon actions → cards → fields/selects → badges → tables.
