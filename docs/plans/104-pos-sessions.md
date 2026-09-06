# 104 — POS sessions and selling

**Read [100-cash-manager-pos.md](100-cash-manager-pos.md) first** — the shared
context, the ground rules, the delegation policy and the release protocol live
there. Then work from that file and this one only. Do not read 101, 102, 103 or
105–107; their context is not yours.

**Needs 102** (cash registers, and `app/lib/cash.ts`) and **103** (templates and
the `/pos` route). What you need to know about them is stated below; you do not
need to read their plans.

## What this builds

The till itself, at **`/pos`**. Open a session on a template, join it from as many
phones as you like, tap tiles, take the money, hand back change. Every sale is
recorded as it happens.

Ships as **`requires-migration`**.

---

## What 102 and 103 left you

- `app/lib/cash.ts` exports `CASH_DENOMINATIONS` (twelve Swiss denominations in
  rappen, largest first), `DenominationCount`, `toRappen`, `fromRappen`,
  `formatDenomination`, `countTotal`, and `POS_PAGE_SLOTS = 8`.
  **All money is integer rappen in code and `Decimal(10,2)` in the database.**
- `CashRegister` is a till opened on a `CASH` money account inside one edition,
  with `openedAt` / `closedAt` and denomination counts attached. An **open**
  register is one with `closedAt: null`.
- `PosTemplate` has `PosTemplateCell`s carrying `position` (0-based slot index),
  `elementId`, `label` and `price` (`Decimal(10,2)`, **negative allowed**).
  `page = Math.floor(position / POS_PAGE_SLOTS)`, `slot = position % POS_PAGE_SLOTS`;
  the ninth tile of every page is a drawn-not-stored "custom sale" button.
- The `pos` dictionary block exists in both `en` and `fr`, and
  `app/app/(app)/pos/page.tsx` is currently a one-line redirect to
  `/pos/templates`. **This plan replaces it.**

## Who may do what

**Any signed-in user may open, join, pause and close a session, and may sell.**
That is the bar staff, and the money they touch is already fenced by the
register somebody with the money-account role had to open first. Templates stay
admin-only; registers stay behind `canManageMoneyAccounts`. Do not tighten
selling — a till nobody can reach is not a till.

Every write still goes through `resolveWritableEditionId()`: a closed edition
sells nothing.

---

## Step 1 — The schema

File: `app/prisma/schema.prisma`

```prisma
enum PosSessionStatus {
  OPEN
  PAUSED
  CLOSED
}

enum PosPaymentMethod {
  CASH
  TWINT
  BANK
}

/// A stretch of selling: one template, one set of accepted payment methods, and
/// at most one cash register behind the CASH one. Several sessions may run at
/// once, and several phones may be in the same session — the session is the
/// till, not the device.
model PosSession {
  id             String           @id @default(cuid())
  editionId      String
  templateId     String
  /// Required exactly when CASH is one of the accepted methods, and never more
  /// than one — the cash a session takes belongs in a single drawer.
  cashRegisterId String?
  name           String
  status         PosSessionStatus @default(OPEN)
  openedById     String?
  openedAt       DateTime         @default(now())
  closedAt       DateTime?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  edition      Edition             @relation(fields: [editionId], references: [id], onDelete: Cascade)
  template     PosTemplate         @relation(fields: [templateId], references: [id], onDelete: Restrict)
  cashRegister CashRegister?       @relation(fields: [cashRegisterId], references: [id], onDelete: Restrict)
  openedBy     User?               @relation("PosSessionOpenedBy", fields: [openedById], references: [id], onDelete: SetNull)
  methods      PosSessionPayment[]
  sales        PosSale[]

  @@index([editionId, status])
  @@index([cashRegisterId])
}

model PosSessionPayment {
  id        String           @id @default(cuid())
  sessionId String
  method    PosPaymentMethod

  session PosSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, method])
}

/// One completed transaction. `total` is what was charged and may be negative —
/// a deposit handed back is a sale like any other.
model PosSale {
  id        String           @id @default(cuid())
  sessionId String
  soldById  String?
  soldAt    DateTime         @default(now())
  method    PosPaymentMethod
  total     Decimal          @db.Decimal(10, 2)
  /// Cash only: what the customer put down, and what the app said to hand back.
  /// Null on every non-cash sale.
  cashGiven Decimal?         @db.Decimal(10, 2)
  changeDue Decimal?         @db.Decimal(10, 2)

  session PosSession      @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  soldBy  User?           @relation("PosSaleSoldBy", fields: [soldById], references: [id], onDelete: SetNull)
  lines   PosSaleLine[]
  change  PosSaleChange[]

  @@index([sessionId, soldAt])
}

/// A line snapshots its label and unit price, so history still reads after the
/// template it came from has been re-priced. `elementId` is null for a custom
/// sale, which has no article behind it.
model PosSaleLine {
  id        String  @id @default(cuid())
  saleId    String
  elementId String?
  label     String
  unitPrice Decimal @db.Decimal(10, 2)
  quantity  Int

  sale    PosSale       @relation(fields: [saleId], references: [id], onDelete: Cascade)
  element StockElement? @relation(fields: [elementId], references: [id], onDelete: SetNull)

  @@index([saleId])
  @@index([elementId])
}

/// The coins and notes the app told the seller to hand back, one row per
/// denomination. Recorded because "what did we say to give?" is a question a
/// short till has to be able to ask.
model PosSaleChange {
  id           String @id @default(cuid())
  saleId       String
  denomination Int
  quantity     Int

  sale PosSale @relation(fields: [saleId], references: [id], onDelete: Cascade)

  @@unique([saleId, denomination])
}
```

Back-relations: `Edition.posSessions`, `PosTemplate.sessions`,
`CashRegister.posSessions`, `StockElement.posSaleLines`,
`User.posSessionsOpened @relation("PosSessionOpenedBy")` and
`User.posSales @relation("PosSaleSoldBy")`.

Also on `User`, next to the existing `selectedStockPlaceId`:

```prisma
  /// Which session this person is selling in. Same idea as
  /// `selectedStockPlaceId`: asked once, then remembered.
  selectedPosSessionId String?
  selectedPosSession   PosSession? @relation("UserSelectedPosSession", fields: [selectedPosSessionId], references: [id], onDelete: SetNull)
```

and the matching `usersSelecting User[] @relation("UserSelectedPosSession")` on
`PosSession`.

Run `npx prisma generate` from `app/`, then hand-write
`app/prisma/migrations/<YYYYMMDDHHMMSS>_pos_sessions/migration.sql`: two enum
types, four tables, the `User` column and its foreign key, every foreign key,
both unique indexes and the five indexes.

Commit.

---

## Step 2 — Making change

Add to `app/lib/cash.ts`:

```ts
/**
 * The fewest coins and notes that make `rappen`, largest first.
 *
 * Greedy is optimal here and it is not a coincidence: the Swiss set is a
 * 1-2-5 series, which is canonical, so the obvious loop is the right answer.
 * Do not write a dynamic-programming solver.
 *
 * It assumes the drawer holds whatever it needs, because nothing in this app
 * tracks what is physically in it. The seller adjusts; the sheet is advice.
 * Returns [] for zero or negative input.
 */
export function makeChange(rappen: number): DenominationCount[];
```

Loop `CASH_DENOMINATIONS` largest first, `Math.floor(remaining / d)`, push only
non-zero quantities. Integer arithmetic throughout — no division that can leave a
fraction.

Commit.

---

## Step 3 — Session actions

New file `app/app/(app)/pos/session-actions.ts` (a separate file from 103's
`actions.ts`, which is admin-only — keeping them apart keeps the permission story
readable).

```ts
export async function openPosSessionAction(_prevState, formData)   // name, templateId, methods[], cashRegisterId?
export async function joinPosSessionAction(sessionId: string)      // plain async, called from a click
export async function leavePosSessionAction()
export async function setPosSessionStatusAction(_prevState, formData) // sessionId, status
```

`openPosSessionAction`:

1. `getCurrentUserAccess()`, `resolveWritableEditionId()`.
2. `name` required. `templateId` must belong to the edition **and have at least
   one cell** → `"That template has no tiles yet."`
3. `methods` — read with `formData.getAll("methods")`, filter to the enum,
   dedupe. Empty → `"Pick at least one way to be paid."`
4. If `CASH` is among them, `cashRegisterId` is required and must be an **open**
   register (`closedAt: null`) in the edition →
   `"Pick an open cash register, or drop cash as a payment method."`
   If `CASH` is not among them, force `cashRegisterId` to `null` — do not store a
   register a session cannot put money in.
5. One transaction: create the session, `createMany` its `PosSessionPayment` rows,
   and set `user.selectedPosSessionId` to it. Opening a session joins it; making
   someone pick it again immediately is a step for nothing.
6. `revalidatePath("/pos")`.

`joinPosSessionAction` / `leavePosSessionAction` write only
`User.selectedPosSessionId`. Joining refuses a `CLOSED` session →
`"That session is closed."` Both `revalidatePath("/pos")`.

`setPosSessionStatusAction` moves between `OPEN`, `PAUSED` and `CLOSED`.

- `CLOSED` is terminal: reopening → `"That session is closed. Open a new one."`
- Closing sets `closedAt`. **Closing writes nothing to the journal.** What the
  session took in cash is read later, when the *register* is closed; a session is
  not a booking event. Say so in the confirmation copy.
- Closing also clears `selectedPosSessionId` for **every** user pointing at it
  (`prisma.user.updateMany`), not just the one clicking — two phones were in
  there.

Commit.

---

## Step 4 — The sale action

Still in `app/app/(app)/pos/session-actions.ts`:

```ts
export async function recordPosSaleAction(_prevState, formData): Promise<ActionState>
```

Fields: `sessionId`, `method`, `lines` (a JSON string), `cashGiven` (rappen, cash
only).

`lines` is posted as JSON because a cart is a variable-length list of objects and
`FormData` is a bad shape for that. Parse it, then validate every entry —
**never trust the client's arithmetic**:

```ts
type PostedLine = { elementId: string | null; label: string; unitPrice: number; quantity: number };
```

1. `getCurrentUserAccess()`, `resolveWritableEditionId()`.
2. The session must exist in the edition and be `OPEN` →
   `"That session is not open. Refresh and try again."` A paused session sells
   nothing; that is what pausing is.
3. `method` must be one the session accepts → `"That payment method is not
   enabled for this session."`
4. At least one line, every `quantity` a positive integer, every `unitPrice` a
   finite number in whole rappen. **`unitPrice` may be negative; the sale total
   may be negative.** Malformed → `"That sale could not be read. Start it again."`
5. `total = sum(unitPrice * quantity)`, **recomputed on the server in rappen**.
   Ignore any total the client sent.
6. Cash: `cashGiven` required, an integer, and `>= total` when `total > 0` →
   `"The amount given is less than the total."` `changeDue = cashGiven - total`,
   and `makeChange(changeDue)` is what gets stored. Non-cash: force `cashGiven`
   and `changeDue` to `null`.
   When `total <= 0` (an all-refund sale), cash is allowed with
   `cashGiven = 0` and `changeDue = -total` — money going out of the drawer.
7. One transaction: create the `PosSale`, `createMany` its lines, `createMany` its
   change rows.
8. `revalidatePath("/pos")`. Return `{ error: null }`.

**Do not deduct stock here.** A sale moving stock is 107's job and needs a stock
place this session does not yet have.

Commit.

---

## Step 5 — The screen

Replace `app/app/(app)/pos/page.tsx` (currently a redirect) with the real server
component:

1. `getCurrentUserAccess()`, `resolveEditionIdOrNull()` — null → the standard
   "no edition" `<EmptyPage>`.
2. Load the edition's sessions (`status: { not: CLOSED }`) with their template
   name, methods, register name and `_count.sales`; the user's
   `selectedPosSessionId`; the edition's templates with a cell count; and its open
   registers.
3. **No session joined** → a picker screen: the list of running sessions with a
   "Join" button each, plus the open-session button. Follow
   `app/app/(app)/stock/stock-place-switcher.tsx`'s `StockPlacePicker` — the same
   "asked once, then remembered" shape, and the same visual recipe. No templates
   at all → `<EmptyPage>` telling an admin to build one.
4. **A session joined** → load that session's template cells ordered by
   `position`, and render the till.

`<PageHeader eyebrow={copy.pos.title} title={session.name} actions>` where actions
holds, in this order, `<Button icon compactOnMobile>`-shaped controls:
a `List` icon-button opening the **sessions manager** (the "list icon top right"
from the brief) and, for admins only, a link to `/pos/templates`.

New client files under `app/app/(app)/pos/`:

- `sessions-modal.tsx` — every running session: name, template, methods as
  `<Badge>`s, register, sale count, and buttons to join, pause/resume and close.
  Closing asks for confirmation and its copy says plainly that nothing is booked
  to the journal by it. It also holds the "Open a session" `<Modal>`: name,
  template `<Select>`, methods `<MultiSelect>`, and a register `<Select>` that
  **appears only when CASH is ticked**.
- `till.tsx` — the selling screen, described in step 6.

Commit.

---

## Step 6 — The till

File: `app/app/(app)/pos/till.tsx` (`"use client"`).

**The cart lives in React state and nowhere else.** Nothing is written until
checkout succeeds; a browser refresh loses an unfinished sale, and that is
correct — an unfinished sale is not a sale.

```tsx
type CartLine = { key: string; elementId: string | null; label: string; unitPrice: number; quantity: number };
```

`unitPrice` is **rappen**, converted once from the cell's `Decimal` when the page
builds its props. The client never sees a franc float.

Layout, top to bottom:

1. A running total, large and unmissable: `formatCurrency(fromRappen(total))`.
   It is the number the customer is told, so it is the biggest thing on screen.
2. The `grid grid-cols-3 gap-2` of nine tiles for the current page — the same 3×3
   at every width, never collapsed to a column. Tapping a tile appends or
   increments its line. Slots 0–7 are cells; the ninth is **Custom sale**, which
   opens a small `<Modal>` asking for a label (defaulting to
   `copy.pos.customSale`) and an amount, negatives allowed.
3. A pager row, identical in behaviour to the template editor's, when the
   template has more than one page.
4. Two full-width buttons side by side: **List** and **Checkout**. Checkout is
   `variant="primary"` and is disabled while the cart is empty.

The **List** `<Modal>`: one row per cart line — label, unit price, quantity,
line total, and three `<IconButton>`s: `Minus`, `Plus`, `Trash2`. `Minus` at
quantity 1 removes the line. A "Clear the sale" button at the bottom, and nothing
else; the cart is not editable in place on the grid.

The **Checkout** `<Modal>`:

- The total again, then the session's payment methods as a `<SegmentedControl>` or
  a `<Radio>` group — only the ones the session accepts.
- **Non-cash**: a "Sold" / "Cancel" pair and nothing more. Cancel closes the
  dialog and leaves the cart alone; Sold calls the action.
- **Cash**: an `<Input inputMode="decimal">` for the amount handed over, and under
  it — live, before anything is submitted — the change: the amount, then the
  denominations from `makeChange()`, each as "3 × CHF 2.00". This is the sheet the
  seller reads while counting, so it is the loudest thing in the dialog after the
  amount. Below the total it shows nothing at all until the field has a value.
  Quick-fill buttons for the exact total and for the next round 10/20/50/100 above
  it save the most common taps; they are a nicety, not a requirement.
- On success: clear the cart, close both dialogs, `router.refresh()`.
  On failure: `<FormError>` inside the dialog, cart untouched.

The till is the one screen in this app that is used standing up, in the dark, on a
phone. Every tap target is a `<Button>` or `<IconButton>` at the standard size —
which is already 44px below `lg` — and nothing here hand-sizes a control.

Commit.

---

## Step 7 — Guards elsewhere

- `app/app/(app)/pos/actions.ts` (from 103), `deletePosTemplateAction`: refuse
  when sessions reference the template —
  `"A session has used this template. It cannot be deleted."`
- `app/app/(app)/cash/actions.ts` (from 102), `closeCashRegisterAction`: refuse
  while a session on that register is `OPEN` or `PAUSED` —
  `"A point-of-sale session is still using this register. Close it first."`
  Closing the drawer under a running till is how money goes missing.
- `app/components/app-shell.tsx`: add the `/pos` item to `departmentNavigation`
  too — selling is no longer admin-only. `BAR_HREFS` is still not touched; which
  four apps get a phone bar slot is the user's call.

Commit.

---

## Step 8 — Copy

File: `app/lib/i18n-dictionaries.ts`, the `pos` block of **both** `en` and `fr`.

Add at least: `sessions`, `openSession`, `sessionName`, `joinSession`,
`leaveSession`, `pauseSession`, `resumeSession`, `closeSession`,
`closeSessionConfirm` (*"Closing stops the selling. Nothing is booked to the
journal — that happens when the cash register is closed."* /
*"Fermer arrête la vente. Rien n'est écrit au journal — cela se fait à la
fermeture de la caisse."*), `noSessions`, `noSessionsHint`, `noTemplatesHintUser`,
`paymentMethods`, `methodCash`, `methodTwint`, `methodBank`, `register`,
`statusOpen`, `statusPaused`, `statusClosed`, `list`, `checkout`, `total`,
`amountGiven`, `changeDue`, `changeSheet`, `sold`, `cancel`, `clearSale`,
`customSaleAmount`, `sales`.

Reuse `customSale`, `price` and `pageOf`, which 103 already added. Every key goes
into both locales.

Commit.

---

## Step 9 — Docs

- `docs/business-processes.md` — extend the **Point of sale** section with
  "Sessions" and "Selling": what a session is, that several run at once and
  several phones share one, who may open and sell, that the payment methods are
  fixed at open, that a cash session needs an open register, that the cart is
  client-side until checkout, that the server recomputes the total, that change is
  greedy over the Swiss denominations and is advice rather than a drawer count,
  and — plainly — **that closing a session writes nothing to the journal.**
- `docs/database.md` — the two enums, the four models, `User.selectedPosSessionId`
  and every back-relation.
- `docs/file-structure.md` — every file added to `/pos`.

Commit.

---

## Step 10 — Verify

**Delegate the mechanical half** (see the master's delegation section): one agent
on `npm run lint`, `npm run check:design`, `npm run build`; one agent on `en`/`fr`
parity for the `pos` block.

Do the behavioural pass yourself against the local database:

- Open a session with Twint only → the register field never appears and the
  session stores no register.
- Open a cash session with no open register available → refused with a sentence.
- Two browser profiles join the same session; a sale made in one shows in the
  other's sale count after a refresh.
- Tap tiles, page across, use the List modal's +/−/bin, clear the sale.
- Cash sale: CHF 13.45 total, CHF 20.00 given → change CHF 6.55 as
  1×5.00, 1×1.00, 1×0.50, 1×0.05. Check the stored `PosSaleChange` rows match.
- Cash sale with less than the total given → refused, cart intact.
- A custom sale with a negative amount → the total drops, the sale records, the
  line has `elementId = null`.
- A tile with a negative price behaves the same way.
- Pause the session → selling refuses; resume → it works again.
- Close the session → both profiles land back on the picker; the session cannot
  be reopened; **no journal entry was created** (check the journal).
- Try to close the register the session was on while it is still open → refused.
- A `DEPARTMENT` user can reach `/pos`, join and sell, and cannot reach
  `/pos/templates`.
- Closed edition → every session and sale action refuses.
- 390px viewport, one-handed: the total is readable at arm's length, the 3×3 grid
  is 3×3, the checkout change sheet is legible.

Commit anything this changed.

---

## Step 11 — Release

Follow **Release protocol** in [100-cash-manager-pos.md](100-cash-manager-pos.md).
Directive: **`requires-migration`**. Do not monitor the deployment.
