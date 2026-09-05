# 016b — Search on a phone

**Read [016-stock-improvement.md](016-stock-improvement.md) first** — the shared
context, the ground rules, the delegation policy and the release protocol live
there. Then work from that file and this one only. Do not read 016a; it is
independent and its context is not yours.

## What this fixes

The stock contents screen has a filter, and a phone never sees it: it is a second
`<TR>` inside the table's `<THead>`, and that table is `<Table desktopOnly>`.

The fix is **not** a second input above the cardlets. `CLAUDE.md` is explicit that
a screen's own controls belong in `<PageHeader controls>` — "a search that scrolls
away from the list it filters is a control in the wrong place" — and two inputs
bound to one piece of state is the wrong shape either way. One search field, in
the header, read by both breakpoints.

No schema change.

---

## The pattern to copy

`app/app/(app)/passwords/` already does exactly this. **Read `passwords/page.tsx`
and `passwords/client.tsx` before you start** — in particular the `controls` prop
around `client.tsx:96`. This subplan is that pattern applied to stock.

---

## Step 1 — Hoist the header into the client

`PageHeader` moves from `app/app/(app)/stock/page.tsx` into `StockClient`, which
becomes the component that owns both the search field and the list it filters.

- `StockClient` gains `eyebrow`, `title`, `description` and
  `actions: React.ReactNode`.
- The page builds the actions node exactly as it does now — `<AddStockModal>`,
  `<StockPlaceSwitcher>`, the Items and History links, and the admin-only Settings
  link — and hands it down as a prop. Server-rendered nodes pass through a client
  component's props fine.
- **The permission gating stays in the page, unchanged.** `isAdmin(access)` still
  decides the Settings link, in one place, for both breakpoints. Never gate on the
  viewport.
- The page then returns
  `<div className="space-y-4 lg:space-y-8"><StockClient …/></div>`, and
  `StockClient` renders `<PageHeader>` as its first element. **`PageHeader` must
  stay the first thing on the page** or its `-mx-3 -mt-3` bleed has nothing to
  cancel and the bar sticks to the wrong edge.
- The `EmptyPage` branch (no stock places yet) and the `StockPlacePicker` branch
  of the page are untouched.

Commit.

---

## Step 2 — The search field

In `StockClient`, pass to `<PageHeader controls>` the field copied from
`app/(app)/passwords/client.tsx`:

- a `relative` wrapper, `min-w-0 flex-1 sm:max-w-sm`;
- the lucide `Search` icon, `pointer-events-none absolute left-3 top-1/2 h-4 w-4
  -translate-y-1/2 text-[var(--muted)]`;
- `<Input type="search" className="pl-9">` bound to the **existing** `filter`
  state, with `placeholder` and `aria-label` from `copy.filter`;
- the count beside it, `shrink-0 text-sm text-[var(--muted)]`.

No new state and no second filtering pass: `visible` is already derived from
`filter`, and the table and the cardlets already render that same array. Keep it
that way — the two views must never be able to disagree about what is on the
shelf.

Commit.

---

## Step 3 — Remove what it replaces

- Delete the filter `<TR>` from the table's `<THead>`. The `filter` state stays;
  it is now fed from the header.
- Move the `showing N of M` line out of `<PanelHeader>` and next to the search in
  the header, as passwords does — then delete the now-empty `<PanelHeader>`.
  That strip is pure chrome on a phone, and it is the same complaint
  [013-fine-tune-features](done/013-fine-tune-features.md) raised about this exact
  screen ("the container wrapping the *affichage 2/2* just eats space").
- The `<Panel flushOnMobile>` stays: it frames the table on a desktop and drops
  its border and fill below `sm`, which is what it is for.

No new dictionary keys — `copy.filter`, `copy.showing` and `copy.of` all exist.

Commit.

---

## Step 4 — Docs

- `docs/file-structure.md` — note that `StockClient` now owns the page header, the
  way the passwords client does.
- `docs/business-processes.md` §10 — if it describes where the filter lives,
  correct it. If it does not mention it, leave it alone.

Commit.

---

## Step 5 — Verify

**Delegate the mechanical half** (see the master's delegation section): an agent
running `npm run lint`, `npm run check:design` and `npm run build` from `app/`,
reporting pass/fail and the exact failure lines.

Check the rest yourself:

- 390px viewport: the search sits in the sticky top bar, filters the cardlets
  live, and stays put while the list scrolls under it.
- Desktop: one search, in the header. The table head is back to a single row.
- The count next to the search updates with the filter and reads the same on both
  breakpoints.
- The place picker screen and the "no stock yet" screen still render — they take
  the early-return branches and must not have been dragged into the client.

Commit anything this changed.

---

## Step 6 — Release

Follow **Release protocol** in [016-stock-improvement.md](016-stock-improvement.md).
Directive: `non-breaking`. Do not monitor the deployment.
