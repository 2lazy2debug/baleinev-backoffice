# 107 — A sale moves stock

**Read [100-cash-manager-pos.md](100-cash-manager-pos.md) first** — the shared
context, the ground rules, the delegation policy and the release protocol live
there. Then work from that file and this one only. Do not read 101–106; their
context is not yours.

**Needs 101** (the `tracksStock` flag) and **104** (POS sessions and sales).
Everything you need to know about them is stated below.

## What this builds

Selling a tracked article takes it off a shelf. A session gains an optional
**stock place**; while it is set, every sale writes an ordinary `StockMovement`
out of it, one per line whose article is counted in stock.

Ships as **`requires-migration`** — one nullable column.

---

## What 101 and 104 left you

- **`StockElement.tracksStock`** (`Boolean @default(true)`) — off means the
  article is sold but never shelved. A poured glass of beer has it off; the barrel
  behind it has it on.
- **`StockPlace`** is a shelf location, global and not edition-scoped.
  **`StockItem`** is one element, in one place, at one expiry date.
- **`PosSession`** — `editionId`, `templateId`, `status`, optional
  `cashRegisterId`. **`PosSale`** has `lines PosSaleLine[]`, each with a nullable
  `elementId` (null on a custom sale), a `label`, a `unitPrice` and a `quantity`.
- `recordPosSaleAction` in `app/app/(app)/pos/session-actions.ts` writes the sale
  in one `prisma.$transaction`. That transaction is where this plan hooks in.
- The session is opened by a modal in `app/app/(app)/pos/sessions-modal.tsx`.

## The rule this plan does not get to change

`applyMovement()` in `app/app/(app)/stock/actions.ts` is the only thing in this
app that changes a quantity, and it already decides what happens when you take out
more than is there:

> Taking out more than is there is a miscount, not an error worth blocking on:
> the shelf goes to zero and the movement records what actually left it.

**A sale is never refused because a shelf is short.** A till that stops selling
beer because somebody forgot to file a delivery is worse than a stock count that
reads zero and says so. Follow the existing behaviour exactly; do not add negative
quantities and do not add a "not enough stock" error.

---

## Step 1 — The column

File: `app/prisma/schema.prisma`, on `PosSession`:

```prisma
  /// Which shelf this session sells out of. Null means the session moves no
  /// stock at all — a bar that is not counted, or one whose stock is filed by
  /// hand at the end of the night.
  stockPlaceId String?
  stockPlace   StockPlace? @relation(fields: [stockPlaceId], references: [id], onDelete: SetNull)
```

plus `@@index([stockPlaceId])` and `StockPlace.posSessions PosSession[]`.

`SetNull`: deleting a stock place must not take a night's sales with it, and the
sales themselves record what was sold regardless.

Run `npx prisma generate` from `app/`, then hand-write
`app/prisma/migrations/<YYYYMMDDHHMMSS>_pos_session_stock_place/migration.sql` —
one nullable column, one foreign key, one index. Existing sessions get null, which
is correct: they moved no stock and this does not retro-file them.

Commit.

---

## Step 2 — Selling out of a place

File: `app/app/(app)/stock/actions.ts`.

`addToPlace()` is private and has a private sibling this plan needs. Add it next
to `addToPlace`, and **export both** `applyMovement` and the new function so the
POS can call them inside its own transaction:

```ts
/**
 * Takes pieces off a shelf, oldest expiry date first.
 *
 * Undated rows are last: something with a date on it is the thing to sell before
 * it turns, and a row with no date has nothing to be late for.
 *
 * Returns how many pieces were actually taken, which is less than `quantity`
 * when the shelf was short. It never refuses and never goes negative —
 * `applyMovement` already clamps, and a miscount is a count to fix, not a sale to
 * block.
 */
export async function removeFromPlace(
  tx: Prisma.TransactionClient,
  where: { stockPlaceId: string; elementId: string },
  quantity: number,
  userId: string,
): Promise<number>
```

Implementation: `findMany` the rows for that place and element with
`quantity: { gt: 0 }`, ordered `expireDate: "asc"` with
`nulls: "last"` (Prisma's `{ sort: "asc", nulls: "last" }`), then loop calling
`applyMovement(tx, row, -take, userId)` until the requested quantity is met or the
rows run out. Do **not** delete rows that reach zero — the stock screens already
show a zero row, and a sale is not the moment to tidy the shelf.

`npm run build` green. Commit.

---

## Step 3 — The sale writes movements

File: `app/app/(app)/pos/session-actions.ts`, inside `recordPosSaleAction`'s
existing `prisma.$transaction`, **after** the sale and its lines are created.

```ts
if (session.stockPlaceId) {
  for (const line of trackedLines) {
    await removeFromPlace(tx, { stockPlaceId: session.stockPlaceId, elementId: line.elementId }, line.quantity, access.id);
  }
}
```

`trackedLines` is the posted lines filtered to those with a non-null `elementId`
whose article has `tracksStock: true`. Resolve that with **one** query before the
loop —
`tx.stockElement.findMany({ where: { id: { in: elementIds }, tracksStock: true }, select: { id: true } })`
— not one lookup per line. A round of drinks is ten lines and a bar makes hundreds
of sales a night.

Three things this must **not** do:

- **Not fail the sale.** If `removeFromPlace` throws for any reason the money is
  still real. Keep it inside the transaction (a genuine database failure should
  roll the whole thing back), but add no validation of your own that could
  refuse: no minimum stock check, no "unknown article" refusal beyond the one
  `recordPosSaleAction` already does.
- **Not move stock for a custom sale.** `elementId` is null there; the filter
  already handles it.
- **Not move stock for an untracked article.** That is the entire point of the
  flag.

Also `revalidatePath("/stock")` alongside the existing revalidations, so the stock
screen is not stale after a night of selling.

Commit.

---

## Step 4 — Picking the place

File: `app/app/(app)/pos/sessions-modal.tsx` — the "Open a session" form gains an
optional `<Select name="stockPlaceId">` over every `StockPlace`, with an empty
first option labelled `copy.pos.noStockPlace`, and
`copy.pos.stockPlaceHint` under it. **Optional, and empty by default**: a session
that moves no stock is the behaviour every existing session has, and turning it on
is a choice.

`app/app/(app)/pos/page.tsx` loads `prisma.stockPlace.findMany({ orderBy: { name:
"asc" } })` and passes it down.

`openPosSessionAction` in `session-actions.ts`: accept `stockPlaceId`, treat empty
string as null, and verify it exists when set → `"That stock no longer exists."`

The stock place is **fixed at open**. It is not editable afterwards — moving a
running session to another shelf would make its earlier sales lie about where the
stock came from. Say so in the hint copy.

Show it wherever a session is described: the sessions manager row and, if the
session-history screens exist in this repo, their session header. If they do not
exist, skip that — do not build a screen this plan does not own.

Commit.

---

## Step 5 — Copy

File: `app/lib/i18n-dictionaries.ts`, the `pos` block of **both** `en` and `fr`.

| Key | en | fr |
|---|---|---|
| `stockPlace` | `Sell out of` | `Vendre depuis` |
| `noStockPlace` | `Don't move stock` | `Ne pas décompter le stock` |
| `stockPlaceHint` | `Every tracked article sold comes off this stock. It cannot be changed once the session is open.` | `Chaque article suivi vendu est décompté de ce stock. Ce choix est définitif une fois la session ouverte.` |

Commit.

---

## Step 6 — Docs

- `docs/business-processes.md` — extend the **Point of sale** section: that a
  session may name a stock, that selling a tracked article takes it off that stock
  oldest-expiry-first, that a custom sale and an untracked article move nothing,
  that the choice is fixed at open, and — plainly — **that a short shelf never
  refuses a sale**, it goes to zero and the movement records what actually left.
  Extend the **Stock** section with one line saying the POS is now a source of
  movements, so `/stock/history` showing entries nobody typed is expected.
- `docs/database.md` — `PosSession.stockPlaceId` and the `StockPlace`
  back-relation.
- `docs/file-structure.md` — no new files; check the `/pos` and `/stock` listings
  still read true.

Commit.

---

## Step 7 — Verify

**Delegate the mechanical half** (see the master's delegation section): one agent
on `npm run lint`, `npm run check:design`, `npm run build`; one agent on `en`/`fr`
parity for the `pos` block.

Do the behavioural pass yourself against the local database:

- Open a session **without** a stock place, sell a tracked article → no
  `StockMovement` exists. This is the regression that matters most.
- Open a session **with** a stock place, sell 3 of a tracked article that has 10
  on the shelf → the row reads 7 and `/stock/history` shows one Out of 3 with the
  seller's name.
- The same article stocked twice with different expiry dates → the **earlier**
  date is drawn down first, and a quantity spanning both rows empties the first
  and dips into the second, as two movements.
- An undated row and a dated row → the dated one goes first.
- Sell 5 when 2 are on the shelf → the sale succeeds, the row reads 0, the
  movement records 2. Nothing is refused and nothing goes negative.
- Sell an article with `tracksStock` off → no movement.
- A custom sale → no movement.
- Sell an article that is on the template but has never been stocked → the sale
  succeeds and no movement is written.
- Ten lines in one sale → check the query count did not become one lookup per
  line.
- The stock screen is up to date without a manual refresh after a sale.

Commit anything this changed.

---

## Step 8 — Release

Follow **Release protocol** in [100-cash-manager-pos.md](100-cash-manager-pos.md).
Directive: **`requires-migration`**. Do not monitor the deployment.
