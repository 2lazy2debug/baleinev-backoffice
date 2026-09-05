# 016a — Stock transfer

**Read [016-stock-improvement.md](016-stock-improvement.md) first** — the shared
context, the ground rules, the delegation policy and the release protocol live
there. Then work from that file and this one only. Do not read 016b; it is
independent and its context is not yours.

## What this builds

A row in a stock gains an icon-only button that opens a modal: how many pieces,
and which stock they go to. The move is logged as two ordinary movements — an
**Out** at the source and an **In** at the destination — so the history reads it
without a third kind of movement existing.

The destination rule is the one from
[012](done/012-stock-management.md) and it does not bend: **same item, same expiry
date → the quantities add up; different expiry date → a new entry there.**

No schema change.

---

## Step 1 — The action

File: `app/app/(app)/stock/actions.ts`, in the "Stock contents" section, after
`removeStockItemAction`.

```ts
export async function transferStockItemAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState>
```

Form fields: `stockItemId`, `toStockPlaceId`, `quantity`.

Inside one `prisma.$transaction`:

1. `getCurrentUserAccess()` — any signed-in user may transfer. This is stock
   content, not configuration; do **not** call `requireAdmin`.
2. Load the item. Gone → `"That entry no longer exists. Refresh and try again."`
3. `toStockPlaceId === item.stockPlaceId` → `"That is the stock this entry is
   already in. Pick another one."`
4. The destination must exist → `"That destination stock no longer exists.
   Refresh and try again."`
5. `quantity = toPositiveQuantity(...)`, then refuse more than is there:
   `"There are only N pieces here."` Unlike the +/- buttons, a transfer does
   **not** silently clamp — moving stock that is not on the shelf would invent it
   at the destination.
6. The **out** leg: `applyMovement(tx, item, -quantity, access.id)`.
7. The **in** leg: `addToPlace(tx, { stockPlaceId: toStockPlaceId, elementId:
   item.elementId, expireDate: item.expireDate }, quantity, access.id)`.
8. If the transfer emptied the source row (`quantity === item.quantity`), delete
   it: `tx.stockItem.delete({ where: { id: item.id } })`. The movements survive —
   `StockMovement.stockItemId` is `SetNull` and each movement carries its own
   element and expiry date. This mirrors `removeStockItemAction`: a shelf
   deliberately emptied *into another place* is not a shelf here any more. A row
   that still holds pieces is left where it is.
9. `revalidateStock()`, `return { error: null }`.

**Do not re-derive the merge rule.** `addToPlace` already is it, including the
undated case that Postgres cannot merge with a unique index because it counts two
NULLs as different values. Call it.

**The precedent for this whole action is `deleteStockPlaceAction`** in the same
file — it already moves a place's contents with these same two calls. Read it
before writing this one.

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

Move the existing markup into it **verbatim** — same classes, same
`rounded-lg border border-[var(--line)] px-3 py-2.5` row, same
`emptyPlace` / `entries` sub-line — and have `StockPlaceSwitcher` render
`<StockPlaceList places={places} selectedId={selectedId} disabled={pending}
onPick={pick} />`. Nothing about the switcher changes visually.

Commit.

---

## Step 3 — The modal

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

- One `<Modal open={row !== null} onClose={onClose} title={copy.transferTitle}
  size="sm">` — the size the switcher uses. No `mobileFullScreen`: a number field
  over a short list is not a full-screen form.
- Inside, in order:
  1. A line naming what is moving — the item name, its brand, and its expiry when
     it has one, in `text-sm` over `text-2xs text-[var(--muted)]`. Use
     `formatPiece` / `formatExpiry` from `@/lib/stock`; do not reformat by hand.
  2. `<Field label={copy.quantity}>` + `<Input type="number" min={1} step={1}
     max={row.quantity}>` holding local state, **defaulting to the full row
     quantity** so "move all of it" is one tap. Reset that state whenever `row`
     changes (`useEffect` on `row?.id`), or the next dialog opens carrying the
     previous item's count.
  3. A hint line, `copy.transferHint`.
  4. `<StockPlaceList places={destinations} disabled={pending} onPick={…} />`.
- **Picking a destination is the submit.** Build a `FormData` with `stockItemId`,
  `toStockPlaceId` and `quantity` and call the action from
  `useActionState(transferStockItemAction, initialActionState)`. There is no
  footer button — the destination is the last decision, exactly as it is in the
  switcher.
- `<FormError message={state.error} />` above the list, so a refused quantity is
  read next to the field that caused it.
- Close on success with `useCloseOnSuccess(state, pending, onClose)` — the hook
  `app/(app)/departments/create-department-modal.tsx` uses — then
  `router.refresh()`.

Commit.

---

## Step 4 — The row button

File: `app/app/(app)/stock/client.tsx`

- `StockClient` gains `places: StockPlaceOption[]` and `currentPlaceId: string`.
  Derive `destinations = places.filter((p) => p.id !== currentPlaceId)` once.
- New state `const [transferring, setTransferring] = useState<StockRow | null>(null)`
  — the same shape as the existing `editing` state.
- In `rowActions(row)`, between the edit/save button and the delete form:

  ```tsx
  {!draft && destinations.length > 0 ? (
    <IconButton label={copy.transfer} onClick={() => setTransferring(row)}>
      <ArrowRightLeft />
    </IconButton>
  ) : null}
  ```

  `ArrowRightLeft` from `lucide-react`. Default tone, default size — it sits in a
  row of `sm` controls and must not hand-size itself. Hidden while the row is
  unlocked (a row being recounted is not also being moved) and when there is
  nowhere to move to (a single stock place).
- `rowActions` is shared by the desktop table cell and the mobile cardlet, so the
  phone gets the button for free. **Do not add a second one.**
- Render **one** `<TransferStockModal row={transferring} destinations={destinations}
  onClose={() => setTransferring(null)} locale={locale} />` at the end of the
  component — not one per row.
- The actions column now holds three 32px buttons: widen its `<col>` in the
  `<colgroup>` from `w-28` to `w-36`. A column that shrinks under them clips the
  last one; the comment above the colgroup already says so.

File: `app/app/(app)/stock/page.tsx` — pass `places={options}` (already computed
there) and `currentPlaceId={selected.id}` into `<StockClient>`.

Commit.

---

## Step 5 — Copy

File: `app/lib/i18n-dictionaries.ts`, the `stock` block of **both** `en` and `fr`.

| Key | en | fr |
|---|---|---|
| `transfer` | `Transfer to another stock` | `Transférer vers un autre stock` |
| `transferTitle` | `Transfer` | `Transférer` |
| `transferHint` | `Pick where these pieces go. They join the same expiry date there, or start a new entry.` | `Choisis où vont ces pièces. Elles rejoignent la même date de péremption là-bas, ou ouvrent une nouvelle entrée.` |

`transfer` is the icon button's `label`, so it is both the tooltip and the
accessible name — it says *where*, not just "transfer". `copy.quantity` already
exists; reuse it for the field.

Commit.

---

## Step 6 — Docs

- `docs/business-processes.md` **§10 Stock** — add the transfer: who may do it,
  that the quantity is chosen, that it merges by expiry date at the destination,
  that the source row disappears when emptied, and that the history shows it as
  two ordinary movements (an Out and an In) rather than a third kind. Say plainly
  that `StockMovement.isIn` still has exactly two values.
- `docs/file-structure.md` — add `transfer-stock-modal.tsx` to the `/stock` route
  listing.
- `docs/database.md` — no schema change. The `StockMovement` description already
  mentions "both legs of a move between places"; check it still reads true and
  leave it alone if it does.

Commit.

---

## Step 7 — Verify

**Delegate the mechanical half** (see the master's delegation section). In one
message, spawn:

- an agent running `npm run lint`, `npm run check:design` and `npm run build` from
  `app/`, reporting pass/fail and exact failure lines;
- an agent comparing the `stock` block of `en` against the `stock` block of `fr`
  in `app/lib/i18n-dictionaries.ts` and listing any key present in one and missing
  from the other.

Do the behavioural pass yourself, against the local database (`CLAUDE.md`: it
holds no production data):

- Transfer part of a row → the source keeps the remainder, the destination gains a
  row or tops one up, `/stock/history` shows one Out and one In of the same
  quantity.
- Transfer all of a row → the source row is gone, both movements survive and still
  name the item and its expiry date.
- Transfer into a stock already holding the same item **with the same expiry
  date** → the quantities add up, no second row.
- Transfer into a stock holding the same item with a **different** expiry date →
  a second row appears there.
- Transfer more than is on the shelf → refused with a sentence, nothing moved.
- 390px viewport: the transfer button is reachable in the cardlet's action row and
  the modal is usable.

Commit anything this changed.

---

## Step 8 — Release

Follow **Release protocol** in [016-stock-improvement.md](016-stock-improvement.md).
Directive: `non-breaking`. Do not monitor the deployment.
