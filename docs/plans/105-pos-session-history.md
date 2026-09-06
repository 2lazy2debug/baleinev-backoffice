# 105 — POS session history

**Read [100-cash-manager-pos.md](100-cash-manager-pos.md) first** — the shared
context, the ground rules, the delegation policy and the release protocol live
there. Then work from that file and this one only. Do not read 101–104, 106 or
107; their context is not yours.

**Needs 104**, which already records everything this plan draws. **This plan adds
no schema and no write action.** It is the read side, and if you find yourself
reaching for a migration you have misread it.

Ships as **`non-breaking`**.

---

## What 104 left you

Four models, all in `app/prisma/schema.prisma`. Read them there; this is the
shape:

- **`PosSession`** — `name`, `status` (`OPEN | PAUSED | CLOSED`), `openedAt`,
  `closedAt`, `openedBy`, `template`, optional `cashRegister`, and `methods`
  (`PosSessionPayment[]`, one row per accepted `PosPaymentMethod`).
- **`PosSale`** — `soldAt`, `soldBy`, `method`, `total` (`Decimal(10,2)`, may be
  negative), and for cash sales `cashGiven` and `changeDue`.
- **`PosSaleLine`** — `label`, `unitPrice`, `quantity`, and a nullable
  `elementId` (null on a custom sale). Label and price are **snapshots**: a
  template re-priced afterwards does not rewrite history, and this screen must
  never "correct" a line by looking the article up again.
- **`PosSaleChange`** — `denomination` (rappen) and `quantity`: the sheet the app
  told the seller to hand back.

`app/lib/cash.ts` has `fromRappen` and `formatCurrency` lives in `@/lib/utils`.
The `pos` dictionary block exists in both `en` and `fr`.

## What this builds

Two read-only screens, admin-only:

- **`/pos/sessions`** — every session in the current edition, closed ones
  included, with what each took and by which means.
- **`/pos/sessions/[sessionId]`** — one session's transactions, in order, with
  their lines and the change handed back.

---

## Step 1 — The totals helper

New file `app/lib/pos.ts`. Both screens need the same roll-up and neither may
compute it twice.

```ts
export type PosTotals = {
  /** Rappen, per method. Every method the session accepts is present, at 0 if unused. */
  byMethod: Record<PosPaymentMethod, number>;
  /** Rappen. The sum, which may be negative. */
  total: number;
  saleCount: number;
  /** Rappen. The sum of `changeDue` across cash sales — what left the drawer as change. */
  changeGiven: number;
};

export function totalsFor(sales: SaleForTotals[], methods: PosPaymentMethod[]): PosTotals;
```

Sum in **integer rappen** (`toRappen` on each `Decimal`), never by adding francs
as floats. A method the session accepts but never used shows as `CHF 0.00`, not as
a missing row — "Twint took nothing tonight" is an answer, and a blank is not.

Commit.

---

## Step 2 — The session list

New files:

- `app/app/(app)/pos/sessions/page.tsx` (server) — `requireAdmin()`,
  `resolveEditionIdOrNull()` (null → the standard "no edition" `<EmptyPage>`).
  Load every session in the edition ordered `openedAt` desc, with `template`,
  `cashRegister`, `openedBy`, `methods`, and the sales it needs for totals —
  **`select` only `method` and `total` from the sales**, not their lines. A
  festival night is thousands of lines and this screen draws none of them.
  No sessions → `<EmptyPage>` with direction.
- `app/app/(app)/pos/sessions/client.tsx` (`"use client"`) — a
  `<Panel flushOnMobile>` + `<PanelHeader flushOnMobile>` around a
  `<Table desktopOnly dense>` with a `<CardletList>` below `sm`, both fed by one
  array. Columns: session name, template, register, opened (date + who), status
  `<Badge>`, sale count, cash / Twint / bank subtotals, total. The row links to
  the detail screen.
- A `<TFoot>` on the desktop table with the column sums across every session
  shown. That row is the reason an admin opens this screen at all.

Reach it from the app: add a link to `/pos/sessions` in the `PageHeader actions`
of `/pos` (admin only, next to the existing templates link) and in
`/pos/templates`. Do **not** add a fourth sidebar entry for it — `/pos` is the
app, and this is a screen inside it.

Commit.

---

## Step 3 — The session detail

New files:

- `app/app/(app)/pos/sessions/[sessionId]/page.tsx` (server) — `requireAdmin()`,
  load the session with its methods, template name, register name, and its sales
  ordered `soldAt` desc **with their lines and change rows**. Not in the current
  edition, or not found → `notFound()`.
  `<PageHeader eyebrow={copy.pos.sessionsTitle} title={session.name}>` with a back
  link to `/pos/sessions` in `actions`.
- A summary band above the list: a `<CardGrid>` of `<Card>`s — total taken, sale
  count, change handed back, and one card per accepted payment method. Remember
  the rule from `CLAUDE.md`: cards in a row are the height of the tallest, and you
  never reach for `items-start` to escape it.
- `app/app/(app)/pos/sessions/[sessionId]/client.tsx` (`"use client"`) — the
  transaction list. One row per sale: time, seller, method `<Badge>`, total. A row
  expands (or opens a `<Modal>` below `sm` — pick one and use it at both widths if
  you can) to show its lines as `label · quantity × unitPrice = lineTotal`, and,
  for a cash sale, `amount given`, `change due`, and the change sheet as
  "2 × CHF 5.00" rows.
  A custom-sale line has no article behind it — mark it with a muted
  `copy.pos.customSale` note rather than leaving the reader guessing.

Commit.

---

## Step 4 — Copy

File: `app/lib/i18n-dictionaries.ts`, the `pos` block of **both** `en` and `fr`.

Add: `sessionsTitle` (`Sessions` / `Sessions`), `sessionsSubtitle`,
`noSessionsYet`, `noSessionsYetHint`, `opened`, `closed`, `seller`, `time`,
`saleCount`, `takenTotal`, `changeGiven`, `perMethod`, `lines`, `lineTotal`,
`backToSessions`, `viewSessions`.

Reuse `methodCash` / `methodTwint` / `methodBank`, `statusOpen` / `statusPaused` /
`statusClosed`, `total`, `amountGiven`, `changeDue`, `changeSheet` and
`customSale`, which 104 already added. Every key goes into both locales.

Commit.

---

## Step 5 — Docs

- `docs/business-processes.md` — extend the **Point of sale** section with a
  "History" subsection: that every sale is kept with its lines, its payment
  method and its change sheet; that labels and prices are snapshots and are never
  re-derived from the template; that the screens are admin-only and read-only;
  and that nothing here books anything.
- `docs/file-structure.md` — the `/pos/sessions` route and `lib/pos.ts`.
- `docs/database.md` — **no change.** Check the POS models still read true and
  leave them alone if they do.

Commit.

---

## Step 6 — Verify

**Delegate the mechanical half** (see the master's delegation section): one agent
on `npm run lint`, `npm run check:design`, `npm run build`; one agent on `en`/`fr`
parity for the `pos` block.

Do the behavioural pass yourself against the local database, on a session with a
mix of cash, Twint and negative-total sales:

- The list's per-method subtotals add up to its total, and the footer row adds up
  the sessions.
- A method the session accepts but never used shows `CHF 0.00`.
- A session with no sales renders without dividing by zero or printing `NaN`.
- The detail screen's change sheet matches the `PosSaleChange` rows in the
  database, coin for coin.
- Re-price the template afterwards → the recorded lines do **not** change.
- Delete an article that was sold → its line survives with the label it was sold
  under, and the screen does not crash on the null `elementId`.
- A `DEPARTMENT` user hitting `/pos/sessions` gets "Unauthorized."
- 390px viewport: the cardlets are readable and the totals are not truncated.

Commit anything this changed.

---

## Step 7 — Release

Follow **Release protocol** in [100-cash-manager-pos.md](100-cash-manager-pos.md).
Directive: **`non-breaking`** — this plan adds no migration, and a tag that claims
one makes the box run `prisma migrate deploy` for nothing. Do not monitor the
deployment.
