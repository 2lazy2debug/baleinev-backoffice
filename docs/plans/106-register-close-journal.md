# 106 — Closing a register into the journal

**Read [100-cash-manager-pos.md](100-cash-manager-pos.md) first** — the shared
context, the ground rules, the delegation policy and the release protocol live
there. Then work from that file and this one only. Do not read 101–105 or 107;
their context is not yours.

**Needs 102** (cash registers) and **104** (POS sessions and sales). Everything
you need to know about them is stated below.

## What this builds

The last step of a till's life. An admin opens a closed register, checks three
numbers, and presses one button: the app writes **three journal entries** and
marks the register booked.

Ships as **`requires-migration`**.

---

## What 102 and 104 left you

- **`CashRegister`** — `editionId`, `moneyAccountId` (a `CASH` money account),
  `name`, `openedAt`, `closedAt` (null while open), and `counts CashCount[]`.
- **`CashCount`** — `kind` (`OPENING | CLOSING`), `denomination` (rappen),
  `quantity`. **Denominations counted zero are not stored.** Never assume twelve
  rows.
- **`PosSession`** — has an optional `cashRegisterId`, and `sales PosSale[]`.
- **`PosSale`** — `method` (`CASH | TWINT | BANK`) and `total` (`Decimal(10,2)`,
  possibly negative).
- `app/lib/cash.ts` — `toRappen`, `fromRappen`, `countTotal`, `CASH_DENOMINATIONS`.
- The screens are `app/app/(app)/cash/` — `page.tsx`, `client.tsx`, `actions.ts`,
  `denomination-counter.tsx`, and the open/close modals.

Closing a register today writes **nothing** to the journal. That is what this plan
changes.

---

## The three numbers, and the three entries

For one closed register:

```
float     = countTotal(OPENING counts)                          // what went in
cashTaken = Σ total of every CASH PosSale in every session on this register
expected  = float + cashTaken                                   // what should be in the drawer
actual    = countTotal(CLOSING counts)                           // what was counted
gap       = expected - actual                                    // positive means short
```

`cashTaken` is the sale **totals**, not what customers handed over: the customer
gave `cashGiven` and got `changeDue` back, and the drawer moved by the difference,
which is exactly `total`. Do not add `cashGiven` and subtract `changeDue` — same
answer, two more chances to be wrong. Negative-total sales (a deposit handed back)
subtract, which is correct.

The three entries, all on the register's `moneyAccountId`, all dated the
register's `closedAt`:

| # | `accountType` | `amount` | `label` |
|---|---|---|---|
| 1 | `CHARGES` | `float` | `Register float — <register name>` |
| 2 | `PRODUITS` | `expected` | `Register returned — <register name>` |
| 3 | `CHARGES` if `gap > 0`, `PRODUITS` if `gap < 0` | `abs(gap)` | `User correction — <register name>` |

**Entry 3 is skipped entirely when `gap` is zero.** A correction of nothing is not
a record, it is noise in the journal.

The original brief's example, restated in these terms. The twelve
denominations add up to CHF 388.85, so:

```
float     = 5 x each   = CHF 1 944.25     the sheet counted in
expected  = 3 x each   = CHF 1 166.55     float + what the sessions took in cash
actual    = expected minus one 10 note = CHF 1 156.55
gap       = CHF 10.00                     short
```

giving charges 1 944.25, produits 1 166.55, charges 10.00 — and a net movement on
the cash account of −787.70, which is exactly `actual - float`. Do not try to
reverse-engineer a set of sales from those numbers; the rule is the table above,
and the tests in step 7 use figures you can add up in your head.

**Amounts are always positive in `JournalEntry`; the direction is `accountType`.**
Entry 2 with a negative `expected` (a till that gave out more than it took) flips
to `CHARGES` with `abs(expected)`, and entry 1 with a zero float is skipped the
same way entry 3 is. Handle both; a bar that only refunds deposits is a real bar.

Net effect on the account: `-float + expected - gap = actual`. That identity is
the thing to assert in a test.

---

## Step 1 — The schema

File: `app/prisma/schema.prisma`

On `CashRegister`:

```prisma
  /// When the three closing entries were written. Null means the register is
  /// counted but not yet booked; a register is booked exactly once.
  journaledAt   DateTime?
  journaledById String?
  journaledBy   User?     @relation("CashRegisterJournaledBy", fields: [journaledById], references: [id], onDelete: SetNull)

  journalEntries JournalEntry[]
```

On `JournalEntry`:

```prisma
  /// Set on the three entries a closed register produces, so the register can
  /// show what it booked and so "where did this line come from?" has an answer
  /// that survives a re-worded label.
  cashRegisterId String?
  cashRegister   CashRegister? @relation(fields: [cashRegisterId], references: [id], onDelete: SetNull)
```

plus `@@index([cashRegisterId])`, and
`User.cashRegistersJournaled CashRegister[] @relation("CashRegisterJournaledBy")`.

`SetNull` on both sides on purpose: deleting an edition cascades registers *and*
entries, and a `Restrict` in the middle of that cascade is a deploy that fails at
two in the morning.

Run `npx prisma generate` from `app/`, then hand-write
`app/prisma/migrations/<YYYYMMDDHHMMSS>_cash_register_journal/migration.sql` —
three nullable columns, two foreign keys, one index. No backfill: every existing
register is unbooked, which is true.

Commit.

---

## Step 2 — The figures, computed once

New file `app/lib/cash-register.ts`:

```ts
export type RegisterFigures = {
  /** All rappen. */
  float: number;
  cashTaken: number;
  expected: number;
  actual: number;
  gap: number;
  /** How many sessions fed `cashTaken`, for the screen to name. */
  sessionCount: number;
};

export async function registerFigures(
  db: Prisma.TransactionClient | PrismaClient,
  registerId: string,
): Promise<RegisterFigures>;
```

One function, taking a client so the action can call it **inside its
transaction** and the screen can call it outside. Both the screen that shows the
numbers and the action that books them must read the same code — two
implementations of `expected` is the bug this whole file exists to prevent.

Integer rappen throughout. `cashTaken` is one
`aggregate({ _sum: { total: true }, where: { session: { cashRegisterId }, method: "CASH" } })`
on `PosSale`, converted with `toRappen`; a null sum is 0, not `NaN`.

Commit.

---

## Step 3 — The action

File: `app/app/(app)/cash/actions.ts`

```ts
export async function journalCashRegisterAction(_prevState: ActionState, formData: FormData): Promise<ActionState>
```

Fields: `registerId`, `budgetId`, `costCenterId` (optional), `date` (optional —
defaults to `closedAt`).

1. `const admin = await requireAdmin()`. **Admin only**, unlike opening and
   closing: this writes to the journal, and the journal is admin territory
   everywhere else in the app.
2. `const editionId = await resolveWritableEditionId()`.
3. The register must exist in the edition → `"That register no longer exists.
   Refresh and try again."`
4. `closedAt` null → `"Count the register back in before booking it."`
5. `journaledAt` not null → `"This register has already been booked."` Booking is
   once and only once; a second press must not double the journal.
6. Every session on this register must be `CLOSED` → `"A point-of-sale session on
   this register is still running. Close it first."`
7. `budgetId` required, and `assertBudgetInEdition(budgetId, editionId)` from
   `@/lib/budgets` — the same guard `journal/actions.ts` uses.
8. `const figures = await registerFigures(prisma, registerId)`.
9. One `prisma.$transaction`:
   - **Copy the sequence-number discipline from `createJournalEntryAction` in
     `app/app/(app)/journal/actions.ts` and read that function before writing
     this one.** It takes `pg_advisory_xact_lock(hashtext(editionId)::bigint)`
     first, then reads the max `sequenceNumber` where `sequenceNumber > 0`. Take
     the lock **once** and allocate all three numbers under it — three separate
     creates that each read the max will collide on
     `@@unique([editionId, sequenceNumber])`.
   - Create the entries from the table above, skipping any whose amount is zero,
     each with `moneyAccountId` from the register, `budgetId`, `costCenterId`,
     `cashRegisterId: registerId`, `date`, `enteredById: admin.id`,
     `isOpeningEntry: false`.
   - Update the register with `journaledAt: new Date()`, `journaledById: admin.id`.
10. `revalidatePath("/cash")`, `revalidatePath("/journal")`, `revalidatePath("/")`,
    `revalidatePath("/money-accounts")`, `revalidatePath("/cost-centers")` — the
    same set `createJournalEntryAction` revalidates.

Commit.

---

## Step 4 — The screen

New file `app/app/(app)/cash/journal-register-modal.tsx` (`"use client"`), opened
from the row action on a **closed, unbooked** register in
`app/app/(app)/cash/client.tsx`.

The modal shows, before anything is written, a small table of the five figures —
float, taken in cash, expected, counted, and the gap — each with
`formatCurrency(fromRappen(...))`, the gap coloured with the rose utilities when
it is non-zero (`text-rose-200`, per `CLAUDE.md`; destructive states use Tailwind
rose directly and never a new token).

Under it, a preview of exactly the entries that will be written: two or three
rows of "Charges / Produits · amount · label". **A one-press irreversible write
shows what it is about to write.** Then the fields it needs: a budget `<Select>`,
an optional cost-centre `<Select>`, and a date `<Input type="date">` defaulting to
`closedAt`.

The submit button lives in the modal `footer`, reaches the form by `form=…`, and
its label says what happens: `copy.cash.bookEntries`.

`app/app/(app)/cash/page.tsx` loads the edition's budgets and cost centres for
those selects, and calls `registerFigures` for every closed unbooked register —
in parallel, not in a loop with an `await` in it.

The list gains a **booked** state: a closed register that has been journalled
shows a third `<Badge>` and, instead of the button, a link to
`/journal` filtered to nothing in particular — or simply the booked date and who
booked it. Do not build a journal filter for this; naming the date and the person
is enough and the entries carry the register's name in their labels.

Commit.

---

## Step 5 — Copy

File: `app/lib/i18n-dictionaries.ts`, the `cash` block of **both** `en` and `fr`.

| Key | en | fr |
|---|---|---|
| `book` | `Book to the journal` | `Comptabiliser` |
| `bookEntries` | `Write the entries` | `Écrire les écritures` |
| `bookTitle` | `Book this register` | `Comptabiliser cette caisse` |
| `statusBooked` | `Booked` | `Comptabilisée` |
| `bookedOn` | `Booked {date} by {name}` | `Comptabilisée le {date} par {name}` |
| `figureFloat` | `Float` | `Fond de caisse` |
| `figureTaken` | `Taken in cash` | `Encaissé en espèces` |
| `figureExpected` | `Expected` | `Attendu` |
| `figureActual` | `Counted` | `Compté` |
| `figureGap` | `Difference` | `Écart` |
| `gapShort` | `short` | `manquant` |
| `gapOver` | `over` | `en trop` |
| `preview` | `What will be written` | `Ce qui sera écrit` |
| `budget` | `Budget` | `Budget` |
| `costCenter` | `Cost center` | `Centre de coûts` |
| `date` | `Date` | `Date` |
| `labelFloat` | `Register float` | `Fond de caisse` |
| `labelReturn` | `Register returned` | `Retour de caisse` |
| `labelCorrection` | `User correction` | `Correction utilisateur` |

The three `label*` keys are **not** used for the journal labels themselves —
server actions write English sentences, per the master's ground rules, and a
journal entry's label must not change when a reader switches language. They label
the *preview rows* in the modal. Write the stored labels in English in
`actions.ts`, formatted as `` `Register float — ${register.name}` ``.

Commit.

---

## Step 6 — Docs

- `docs/business-processes.md` — extend the **Cash manager** section with
  "Booking a register": the five figures and how each is derived, the three
  entries and their directions, that a zero amount is skipped, that booking is
  admin-only and happens once, that every session on the register must be closed
  first, and that the net effect on the cash account is exactly what was counted
  back. Remove or amend the sentence 102 wrote saying closing writes nothing to
  the journal — it is still true of *closing*, and the forward pointer it made now
  points here.
- `docs/database.md` — `CashRegister.journaledAt` / `journaledById`,
  `JournalEntry.cashRegisterId`, and the new back-relations.
- `docs/file-structure.md` — `lib/cash-register.ts` and
  `journal-register-modal.tsx`.

Commit.

---

## Step 7 — Verify

**Delegate the mechanical half** (see the master's delegation section): one agent
on `npm run lint`, `npm run check:design`, `npm run build`; one agent on `en`/`fr`
parity for the `cash` block.

Do the behavioural pass yourself against the local database, with numbers you can
add up by hand:

- Float CHF 100.00, no sales, counted back CHF 100.00 → two entries
  (charges 100, produits 100), **no correction entry**.
- Float CHF 100.00, cash sales totalling CHF 250.00, counted back CHF 340.00 →
  charges 100, produits 350, produits 10 (over). The cash account's balance moves
  by exactly +240.00.
- Same but counted back CHF 330.00 → charges 100, produits 350, charges 20
  (short).
- A Twint sale in the session does **not** move any of these figures.
- A negative-total cash sale lowers `expected`.
- Press the button twice → the second press is refused and the journal still has
  three entries.
- A register with a session still open → refused.
- A register not yet counted back → the button is not offered and the action
  refuses.
- The three entries carry consecutive `sequenceNumber`s with no gap and no
  collision; create an ordinary journal entry immediately after and check it gets
  the next one.
- Closed edition → the action refuses.
- A non-admin with the money-account role can still open and close a register and
  cannot book one.
- 390px viewport: the figures table and the preview are readable in the modal.

Commit anything this changed.

---

## Step 8 — Release

Follow **Release protocol** in [100-cash-manager-pos.md](100-cash-manager-pos.md).
Directive: **`requires-migration`**. Do not monitor the deployment.
