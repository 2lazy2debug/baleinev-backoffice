# 016 — Stock improvement

Two additions to the stock app shipped in
[012-stock-management](done/012-stock-management.md):

1. **Transfer** — move pieces from the stock you are in to another one, in one
   gesture, logged as an exit on one side and an entry on the other.
2. **Search on a phone** — the filter that only exists in the desktop table head
   today becomes one search field that both breakpoints read.

There is **no schema change in this plan**. Everything the transfer needs
(`StockItem`, `StockMovement`, the merge-by-expiry rule) already exists — the work
is one server action, one modal, and a header that moves. Tag it `non-breaking`.

---

## Ground rules

- **Read `CLAUDE.md` first and obey it literally** — the design-system section is
  not advice. No hardcoded colour, radius, pixel size or hand-sized control.
- **Reuse before you write.** Every surface, control and heading already exists in
  `app/components/ui/`. The two-legged move already exists in
  `deleteStockPlaceAction`. The destination list already exists in
  `StockPlaceSwitcher`. Nothing in this plan needs a new recipe.
- **One commit per step.** `git add . && git commit -am "<what you did>"` at the
  end of each numbered step below, exactly as `CLAUDE.md` asks. No branches.
- **Errors thrown from server actions are English sentences**, matching the rest of
  `app/(app)/stock/actions.ts`. Only *UI copy* goes through the dictionary.
- Run `npm run lint`, `npm run check:design` and `npm run build` from `app/`
  before the release step. All three must pass.

---

## Step 1 — The transfer action

File: `app/app/(app)/stock/actions.ts`

Add `transferStockItemAction(_prevState: ActionState, formData: FormData)` in the
"Stock contents" section, after `removeStockItemAction`.

Form fields it reads:

| Field | Meaning |
|---|---|
| `stockItemId` | the row being moved out of |
| `toStockPlaceId` | where it goes |
| `quantity` | how many pieces go — a positive whole number |

What it does, inside one `prisma.$transaction`:

1. `getCurrentUserAccess()` — any signed-in user may transfer. This is stock
   content, not configuration; do **not** call `requireAdmin`.
2. Load the item. Gone → `"That entry no longer exists. Refresh and try again."`
3. `toStockPlaceId === item.stockPlaceId` → `"That is the stock this entry is
   already in. Pick another one."`
4. The destination must exist → `"That destination stock no longer exists.
   Refresh and try again."`
5. `quantity = toPositiveQuantity(...)`, then refuse more than is there:
   `"There are only N pieces here."` — a transfer is not a recount, so unlike the
   +/- buttons it does not silently clamp. Moving stock that is not on the shelf
   would invent it in the destination.
6. The **out** leg: `applyMovement(tx, item, -quantity, access.id)`.
7. The **in** leg: `addToPlace(tx, { stockPlaceId: toStockPlaceId, elementId:
   item.elementId, expireDate: item.expireDate }, quantity, access.id)`.
8. If the transfer emptied the source row (`quantity === item.quantity`), delete
   it — `tx.stockItem.delete({ where: { id: item.id } })`. The movements survive:
   `StockMovement.stockItemId` is `SetNull` and each movement carries its own
   element and expiry date. This mirrors `removeStockItemAction`: a shelf that
   has been deliberately emptied *into another place* is not a shelf here any
   more. A row that still holds pieces is left where it is.
9. `revalidateStock()`, `return { error: null }`.

**Do not re-derive the merge rule.** `addToPlace` is already the answer to "same
item, same expiry date → top up; different expiry date → new entry", including
the NULL-date case Postgres cannot merge with a unique index. Call it. The
precedent for the whole shape of this action is `deleteStockPlaceAction`, which
already moves a whole place's contents with the same two calls — read it before
writing this one.

Commit.

---

## Step 2 — The destination list, shared

File: `app/app/(app)/stock/stock-place-switcher.tsx`

`StockPlaceSwitcher` draws its destination list inline: a column of `<button>`s
with the place name, its entry count, and a `Check` on the current one. The
transfer modal shows the same list. Extract it rather than copying it:

```tsx
export function StockPlaceList({ places, selectedId, disabled, onPick }: {
  places: StockPlaceOption[];
  /** Marked with a check — the place currently open. Omit in the transfer modal. */
  selectedId?: string;
  disabled?: boolean;
  onPick: (stockPlaceId: string) => void;
})
```

Move the existing markup into it verbatim — same classes, same
`rounded-lg border border-[var(--line)] px-3 py-2.5` row, same
`emptyPlace` / `entries` sub-line — and have `StockPlaceSwitcher` render
`<StockPlaceList places={places} selectedId={selectedId} disabled={pending}
onPick={pick} />`. Nothing about the switcher changes visually.

Commit.

---

## Step 3 — The transfer modal

New file: `app/app/(app)/stock/transfer-stock-modal.tsx` (`"use client"`).

```tsx
type Props = {
  locale: Locale;
  /** The row being moved. `null` closes the dialog. */
  row: StockRow | null;
  /** Every stock except the one currently open. */
  destinations: StockPlaceOption[];
  onClose: () => void;
};
```

Shape:

- One `<Modal open={row !== null} onClose={onClose} title={copy.transferTitle}
  size="sm">` — the same size the switcher uses. No `mobileFullScreen`: a number
  field over a short list is not a full-screen form.
- Inside, in order:
  1. A line naming what is moving — the item name, its brand and its expiry when
     it has one, in `text-sm` / `text-2xs text-[var(--muted)]`. Reuse
     `formatPiece` / `formatExpiry` from `@/lib/stock`; do not reformat by hand.
  2. `<Field label={copy.quantity}>` + `<Input type="number" min={1} step={1}
     max={row.quantity} …>` holding local state, **defaulting to the full row
     quantity** so "move all of it" is one tap. Reset that state whenever `row`
     changes (`useEffect` on `row?.id`), or the next dialog opens with the last
     item's count.
  3. A hint line, `copy.transferHint`.
  4. `<StockPlaceList places={destinations} disabled={pending} onPick={…} />`.
- Picking a destination **is** the submit: build a `FormData` with
  `stockItemId`, `toStockPlaceId` and `quantity` and call the action returned by
  `useActionState(transferStockItemAction, initialActionState)`. There is no
  footer button — the destination is the last decision, the way it is in the
  switcher.
- `<FormError message={state.error} />` above the list, so a refused quantity is
  read next to the field that caused it.
- Close on success with `useCloseOnSuccess(state, pending, onClose)` — the same
  hook `create-department-modal.tsx` uses — then `router.refresh()`.

Commit.

---

## Step 4 — The row button

File: `app/app/(app)/stock/client.tsx`

- `StockClient` gains two props: `places: StockPlaceOption[]` (all of them) and
  `currentPlaceId: string`. Derive `destinations = places.filter(p => p.id !==
  currentPlaceId)` once.
- New state `const [transferring, setTransferring] = useState<StockRow | null>(null)`
  — the same shape as the existing `editing` state.
- In `rowActions(row)`, between the edit/save button and the delete form, add:

  ```tsx
  {!draft && destinations.length > 0 ? (
    <IconButton label={copy.transfer} onClick={() => setTransferring(row)}>
      <ArrowRightLeft />
    </IconButton>
  ) : null}
  ```

  `ArrowRightLeft` from `lucide-react`. Default tone, default size — it sits in a
  row of `sm` controls and must not hand-size itself. It is hidden while the row
  is unlocked (a row being recounted is not also being moved) and when there is
  nowhere to move to (a single stock place).
- `rowActions` is shared by the desktop table cell and the mobile cardlet, so
  the phone gets the button for free. **Do not add a second one.**
- Render **one** `<TransferStockModal row={transferring} destinations={destinations}
  onClose={() => setTransferring(null)} locale={locale} />` at the end of the
  component — not one per row.
- The actions column now holds three 32px buttons: widen its `<col>` in the
  `<colgroup>` from `w-28` to `w-36`. A column that shrinks under them clips the
  last one — the comment above the colgroup already says why.

File: `app/app/(app)/stock/page.tsx` — pass `places={options}` and
`currentPlaceId={selected.id}` into `<StockClient>`.

Commit.

---

## Step 5 — The dictionary

File: `app/lib/i18n-dictionaries.ts`, the `stock` block of **both** `en` and `fr`.

| Key | en | fr |
|---|---|---|
| `transfer` | `Transfer to another stock` | `Transférer vers un autre stock` |
| `transferTitle` | `Transfer` | `Transférer` |
| `transferHint` | `Pick where these pieces go. They join the same expiry date there, or start a new entry.` | `Choisis où vont ces pièces. Elles rejoignent la même date de péremption là-bas, ou ouvrent une nouvelle entrée.` |

`transfer` is the icon button's `label`, so it is the accessible name and the
tooltip — it says where, not just "transfer". `copy.quantity` already exists;
reuse it for the field.

Commit.

---

## Step 6 — The search, on both breakpoints

Today the filter is a second `<TR>` inside the table's `<THead>`, and
`<Table desktopOnly>` means a phone never sees it. Do **not** fix that by adding a
second input above the cardlets — `CLAUDE.md` is explicit that a screen's own
controls belong in `<PageHeader controls>`, and that two inputs bound to one
state is the wrong shape.

1. **Hoist the header into the client.** `PageHeader` moves from
   `app/app/(app)/stock/page.tsx` into `StockClient`, which becomes the component
   that owns both the search field and the list it filters. This is the pattern
   `app/(app)/passwords/` already uses — read `passwords/page.tsx` and
   `passwords/client.tsx` before starting.
   - `StockClient` gains `eyebrow`, `title`, `description` and
     `actions: React.ReactNode` props. The page builds the actions node exactly as
     it does now — `<AddStockModal>`, `<StockPlaceSwitcher>`, the Items/History
     links and the admin-only Settings link — and hands it down. Server-rendered
     nodes pass through a client component's props fine; the gating logic
     (`isAdmin(access)`) stays in the page, unchanged, for both breakpoints.
   - The page then returns `<div className="space-y-4 lg:space-y-8"><StockClient
     …/></div>` and `StockClient` renders `<PageHeader>` as its first element.
     **`PageHeader` must stay the first thing on the page** or its `-mx-3 -mt-3`
     bleed has nothing to cancel.
   - The `EmptyPage` branch and the `StockPlacePicker` branch of the page are
     untouched.
2. **The search field** goes in `<PageHeader controls>`, copied from
   `app/(app)/passwords/client.tsx` (the `controls` prop, around line 96): a
   `relative` wrapper, the lucide `Search` icon absolutely positioned at
   `left-3 top-1/2`, `<Input type="search" className="pl-9">` bound to the
   existing `filter` state, `placeholder` and `aria-label` from `copy.filter`,
   and the count beside it.
3. **Delete the filter `<TR>`** from the table `<THead>`. The `filter` state stays
   — it is now fed from the header.
4. **Move the count.** `showing N of M` currently lives in `<PanelHeader>`. Put it
   next to the search in the header row, as passwords does, and delete the now
   empty `<PanelHeader>`. That strip is pure chrome on a phone — the same
   complaint [013-fine-tune-features](done/013-fine-tune-features.md) raised about
   this exact screen.

Commit.

---

## Step 7 — Docs

`CLAUDE.md`: *"Update /docs when you change a core flow. Never let docs diverge
from the actual implementation."* Both changes here are core flows.

- `docs/business-processes.md`, **§10 Stock** — add the transfer: who may do it,
  that the quantity is chosen, that it merges by expiry date in the destination,
  that the source row disappears when it is emptied, and that it reads in the
  history as two ordinary movements (an *Out* at the source and an *In* at the
  destination) rather than as a third kind of movement. Note there is no
  "transfer" direction — `StockMovement.isIn` still has exactly two values.
- `docs/file-structure.md` — add `transfer-stock-modal.tsx` to the `/stock` route
  listing, and note that `StockClient` now owns the page header.
- `docs/database.md` — no schema change. Check the `StockMovement` description
  still reads true (it already mentions "both legs of a move between places") and
  leave it alone if it does.

Commit.

---

## Step 8 — Verify

From `app/`:

```bash
npm run lint
npm run check:design
npm run build
```

Then exercise it against the local database (`CLAUDE.md`: there is no production
data in it — use it):

- Transfer part of a row → source keeps the remainder, destination gains a row or
  tops one up, `/stock/history` shows one Out and one In with the same quantity.
- Transfer all of a row → the source row is gone, both movements are still in the
  history and still name the item and its expiry date.
- Transfer into a stock that already holds the same item **with the same expiry
  date** → the quantities add up, no second row.
- Transfer into a stock that holds the same item with a **different** expiry date
  → a second row appears there. This is the rule from
  [012](done/012-stock-management.md) and it must not bend.
- Transfer more than is on the shelf → refused with a sentence, nothing moved.
- On a 390px viewport: the search sits in the sticky top bar, filters the
  cardlets, and the transfer button is reachable in the cardlet's action row.

Commit anything the verification changed.

---

## Step 9 — Release

Do **not** hardcode a version. Read the latest tag and go one minor step up —
this is a feature release:

```bash
cd /home/mcabras/Developer/baleinev-backoffice
git tag --sort=-v:refname | head -1        # e.g. v0.28.4
```

Then, with `NEXT` computed from that (patch → 0, minor + 1: `v0.28.4` → `v0.29.0`):

1. Set `app/package.json` `"version"` to `NEXT` without the leading `v`.
2. `git commit -am "chore(release): bump version to <NEXT without v>"`
3. `git tag -a <NEXT> -m "non-breaking"` — **`non-breaking`, not
   `requires-migration`**: this plan adds no migration, and a message that claims
   one makes the box run `prisma migrate deploy` for nothing.
4. `git push origin main --follow-tags`

**Do not monitor the deployment.** The updater timer picks the tag up within about
two minutes on its own. Do not poll `journalctl`, do not ssh to the box, do not
loop on `/api/health`. Push the tag and report what you shipped.

---

## When it is done

Move this file to `docs/plans/done/016-stock-improvement.md` in the same release
commit, the way every finished plan in that folder was.
