# 102 — Cash registers

**Read [100-cash-manager-pos.md](100-cash-manager-pos.md) first** — the shared
context, the ground rules, the delegation policy and the release protocol live
there. Then work from that file and this one only. Do not read 101 or 103–107;
their context is not yours.

## What this builds

A new app at **`/cash`**: open a till against a cash account by counting the
float into it coin by coin, and close it later by counting what is left.

**Nothing is written to the journal by this plan.** Counting is not booking; the
three journal entries a closed till produces are 106's job, and a till counted
today may be booked next week. This plan's only output is a `CashRegister` with
one or two counts attached.

Ships as **`requires-migration`**.

---

## The Swiss denominations

Twelve of them, and the list never varies. There is no 1000 note in this app — the
festival does not accept one.

```
0.05  0.10  0.20  0.50  1.00  2.00  5.00  10.00  20.00  50.00  100.00  200.00
```

**They are stored and computed as integer rappen**, never as decimals or floats.
`5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000`.

---

## Step 1 — `lib/cash.ts`

New file `app/lib/cash.ts`. This is the money vocabulary the whole chain imports;
103–107 add to it but never re-derive it.

```ts
/**
 * The twelve Swiss denominations a till holds, in rappen, largest first. There
 * is no 1000 note here on purpose — the festival does not accept one.
 *
 * Every amount in the cash and POS apps is an integer number of rappen. Prices
 * are `Decimal(10,2)` in the database and rappen everywhere in code: adding
 * francs as floats is how a till ends the night one rappen short.
 */
export const CASH_DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5] as const;

export type DenominationCount = { denomination: number; quantity: number };

/** A `Decimal(10,2)` (or anything with toString) as whole rappen. */
export function toRappen(value: { toString(): string } | number): number;

/** Rappen back to the francs a `Decimal(10,2)` column wants. */
export function fromRappen(rappen: number): number;

/** "CHF 0.05", "CHF 200.00" — one denomination, for a counter label. */
export function formatDenomination(rappen: number): string;

/** Sums a count sheet. Empty sheet is 0, never NaN. */
export function countTotal(counts: DenominationCount[]): number;
```

`toRappen` must round, not truncate: `Math.round(Number(value.toString()) * 100)`.
`fromRappen` is `rappen / 100`. Reuse `formatCurrency` from `@/lib/utils` for
display wherever a whole amount is shown — `formatDenomination` exists only for
the counter's row labels.

Commit.

---

## Step 2 — The schema

File: `app/prisma/schema.prisma`

```prisma
enum CashCountKind {
  OPENING
  CLOSING
}

/// One till, opened on one cash account, for one stretch of work.
///
/// It holds two counts and no amounts of its own: the float that went in and
/// what came back out, each as a sheet of denominations. Counting is not
/// booking — the journal entries a closed register produces are written later,
/// by an admin, from the two counts and what the POS sold.
model CashRegister {
  id             String    @id @default(cuid())
  editionId      String
  moneyAccountId String
  name           String
  openedById     String?
  openedAt       DateTime  @default(now())
  closedById     String?
  closedAt       DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  edition      Edition      @relation(fields: [editionId], references: [id], onDelete: Cascade)
  moneyAccount MoneyAccount @relation(fields: [moneyAccountId], references: [id], onDelete: Restrict)
  openedBy     User?        @relation("CashRegisterOpenedBy", fields: [openedById], references: [id], onDelete: SetNull)
  closedBy     User?        @relation("CashRegisterClosedBy", fields: [closedById], references: [id], onDelete: SetNull)
  counts       CashCount[]

  @@index([editionId, moneyAccountId])
  @@index([editionId, closedAt])
}

/// How many of one denomination were counted, at one end of a register's life.
/// `denomination` is rappen — 5 for a five-centime coin, 20000 for a 200 note.
model CashCount {
  id           String        @id @default(cuid())
  registerId   String
  kind         CashCountKind
  denomination Int
  quantity     Int

  register CashRegister @relation(fields: [registerId], references: [id], onDelete: Cascade)

  @@unique([registerId, kind, denomination])
  @@index([registerId])
}
```

Back-relations: `Edition.cashRegisters CashRegister[]`,
`MoneyAccount.cashRegisters CashRegister[]`,
`User.cashRegistersOpened CashRegister[] @relation("CashRegisterOpenedBy")` and
`User.cashRegistersClosed CashRegister[] @relation("CashRegisterClosedBy")`.

**There is no unique index on the name.** Two bars both called "Bar 1" in two
editions, or two nights, are two registers and the app must not argue about it.

`moneyAccountId` is `Restrict`: a cash account that has held a till cannot be
deleted out from under it.

Run `npx prisma generate` from `app/`, then hand-write
`app/prisma/migrations/<YYYYMMDDHHMMSS>_cash_registers/migration.sql`: the enum
type, both tables, both foreign-key sets, the unique index and the three indexes.
Copy the comment style from
`app/prisma/migrations/20260906090000_drop_department_has_budget/migration.sql`.

Commit.

---

## Step 3 — The counter component

New file `app/app/(app)/cash/denomination-counter.tsx` (`"use client"`). Both
modals in this plan use it, and 106 reads what it produced.

```tsx
type Props = {
  locale: Locale;
  /** Field name prefix; each row posts `${name}-${denomination}`. */
  name: string;
  value: Record<number, number>;
  onChange: (next: Record<number, number>) => void;
  disabled?: boolean;
};
```

- One row per entry of `CASH_DENOMINATIONS`, largest first: the denomination
  label on the left, an `<Input type="number" min={0} step={1} size="sm">` on the
  right, and the row's subtotal (`formatCurrency(fromRappen(d * q))`) after it,
  muted, only when the quantity is non-zero.
- Empty means zero. Do not force a `0` into every field — twelve pre-filled zeros
  is twelve fields to clear.
- A footer row inside the same surface: `copy.cash.total` and
  `formatCurrency(fromRappen(countTotal(...)))`, updating as you type. **This
  total is the whole point of the component** — the person counting checks it
  against the cash in their hand before they submit.
- Twelve rows do not fit a phone comfortably as a table. Use a plain
  `space-y-1` column of `flex items-center gap-2` rows inside
  `nestedSurfaceClasses` — a `<Panel nested>` at desktop widths, and nothing
  hand-sized. Controls are `sm`, which is `h-11` below `lg` for free.

Commit.

---

## Step 4 — Opening a register

New file `app/app/(app)/cash/actions.ts`:

```ts
export async function openCashRegisterAction(_prevState: ActionState, formData: FormData): Promise<ActionState>
```

Fields: `moneyAccountId`, `name`, and `opening-<denomination>` for each of the
twelve.

1. `const access = await getCurrentUserAccess()`; refuse unless
   `canManageMoneyAccounts(access)` (from `@/lib/access`) —
   `"Only an admin or the accounting team can open a register."` A till is money
   leaving an account, and that is already this app's rule for who touches money
   accounts. Do not invent a new role.
2. `const editionId = await resolveWritableEditionId()`.
3. The money account must exist, belong to `editionId`, and have
   `type === MoneyAccountType.CASH` → `"Pick a cash account. A register cannot be
   opened on a bank account."`
4. Parse the twelve quantities. Anything not a non-negative integer →
   `"Counts must be whole numbers of coins and notes."` A sheet that totals zero
   is refused: `"Count the float before opening the register."`
5. One `prisma.$transaction`: create the `CashRegister`, then
   `createMany` the `CashCount` rows with `kind: OPENING`, **skipping
   denominations counted zero**. A zero row means "counted, none" and a missing
   row means the same thing; storing twelve rows per register for no reason makes
   106's reads longer.
6. `revalidatePath("/cash")`, `return { error: null }`.

New file `app/app/(app)/cash/open-register-modal.tsx` (`"use client"`) — a
`Button` in `PageHeader actions` plus a `<Modal mobileFullScreen title=…>` with
the submit in the modal `footer` reaching the form by `form="open-register"`, as
`app/app/(app)/expense-reports/create-expense-report-modal.tsx` does. Inside:
`<Field>` + `<Select name="moneyAccountId">` over the edition's cash accounts,
`<Field>` + `<Input name="name">`, then `<DenominationCounter name="opening">`.
`useActionState`, `<FormError message={state.error} />`, and
`useCloseOnSuccess(state, pending, onClose)` from
`@/components/use-close-on-success`, then `router.refresh()`.

Commit.

---

## Step 5 — The screen

New file `app/app/(app)/cash/page.tsx` (server component).

- `resolveEditionIdOrNull()`; null → the standard "no edition" `<EmptyPage>` the
  other edition-scoped pages render.
- Load the edition's `MoneyAccount`s with `type: MoneyAccountType.CASH`. **None →
  `<EmptyPage eyebrow={copy.cash.title} title={copy.cash.noCashAccounts}>` with
  a link to `/money-accounts`.** Direction, not mood: a till needs a cash account
  and the screen says where to make one.
- Load the edition's registers with their counts, `orderBy: [{ closedAt: "asc" },
  { openedAt: "desc" }]` so open tills sit at the top.
- `<PageHeader eyebrow title description actions>` with the open-register button,
  wrapped in `<WritableEditionOnly>` (from `@/components/edition-read-only`).
- The list is a `<Panel flushOnMobile>` + `<PanelHeader flushOnMobile>` around a
  `<Table desktopOnly dense>` with a `<CardletList>` below `sm`, **both fed by one
  array built in the page** — never a second mapping. Columns: name, cash account,
  opened (date + who), float total, closing total (or `—`), status
  `<Badge tone>` (open / closed).
- The row action on an **open** register is a `<Button size="sm">`
  "Count and close"; on a **closed** one it is an `<IconButton>` opening a
  read-only view of both sheets side by side. Both live in one
  `app/app/(app)/cash/client.tsx` (`"use client"`) that owns the two dialogs and
  is rendered once — one modal for the whole list, driven by a
  `useState<Row | null>`, not one per row.

Commit.

---

## Step 6 — Closing a register

In `app/app/(app)/cash/actions.ts`:

```ts
export async function closeCashRegisterAction(_prevState: ActionState, formData: FormData): Promise<ActionState>
```

Fields: `registerId` and `closing-<denomination>` for each of the twelve.

Same permission and edition guards as opening. Then:

- The register must exist and belong to the current edition →
  `"That register no longer exists. Refresh and try again."`
- Already closed → `"That register is already closed."` Closing is not
  idempotent; a second count would silently replace the first.
- Parse the twelve quantities the same way. **A closing sheet totalling zero is
  allowed** — a till can genuinely come back empty — but a sheet where every field
  was left blank and a genuinely empty till are indistinguishable, so the modal
  requires an explicit confirmation checkbox in that case
  (`copy.cash.confirmEmpty`), posted as `confirmEmpty`. Missing it →
  `"Tick the box to confirm the register came back empty."`
- One transaction: `createMany` the `CLOSING` counts (skipping zeros) and
  `update` the register with `closedAt: new Date()` and `closedById: access.id`.
- `revalidatePath("/cash")`.

New file `app/app/(app)/cash/close-register-modal.tsx` — the same shape as the
open modal, plus a line above the counter naming the register and its float total
so the person counting can see what went in. **Do not show them a computed
expected amount.** They are counting, and a number to match is a number they will
match.

Commit.

---

## Step 7 — Navigation and copy

File: `app/components/app-shell.tsx` — import `Coins` from `lucide-react` and add
`{ type: "item", href: "/cash", label: copy.cash, icon: Coins },` to
`adminNavigation` right after the `/cost-centers` item; a till is financial. Add
the same item to `departmentNavigation` **only** behind the existing
`canManageMoneyAccounts` flag the shell already receives, next to
`moneyAccountsItem` — the same rule that gates the action gates the link.
`/cash` is edition-scoped, so it does **not** go into `GLOBAL_ROUTES`.
`BAR_HREFS` is not touched.

File: `app/lib/i18n-dictionaries.ts`, both `en` and `fr`: `shell.cash`
(`Cash manager` / `Caisse`) and a new `cash` block:

| Key | en | fr |
|---|---|---|
| `title` | `Cash manager` | `Caisse` |
| `subtitle` | `Open a till with a counted float and close it with a counted count.` | `Ouvre une caisse avec un fond compté et ferme-la avec un comptage.` |
| `noCashAccounts` | `No cash account in this edition yet` | `Aucun compte espèces dans cette édition` |
| `noCashAccountsHint` | `A register is opened on a cash account. Create one in Money accounts first.` | `Une caisse s'ouvre sur un compte espèces. Crée-en un dans Comptes d'argent.` |
| `open` | `Open a register` | `Ouvrir une caisse` |
| `close` | `Count and close` | `Compter et fermer` |
| `registerName` | `Name` | `Nom` |
| `cashAccount` | `Cash account` | `Compte espèces` |
| `float` | `Float` | `Fond de caisse` |
| `counted` | `Counted back` | `Compté au retour` |
| `openedBy` | `Opened by` | `Ouverte par` |
| `statusOpen` | `Open` | `Ouverte` |
| `statusClosed` | `Closed` | `Fermée` |
| `total` | `Total` | `Total` |
| `confirmEmpty` | `The register came back empty` | `La caisse est revenue vide` |
| `sheets` | `Counts` | `Comptages` |

Commit.

---

## Step 8 — Docs

- `docs/business-processes.md` — append a new numbered section **Cash manager**:
  what a register is, that it hangs off a `CASH` money account inside one edition,
  who may open and close one, that both ends are counted by denomination, that a
  closing count cannot be redone, and — stated plainly — **that closing writes
  nothing to the journal yet**, with a forward pointer to the closing entries.
- `docs/database.md` — `CashRegister`, `CashCount`, `CashCountKind`, and the new
  back-relations on `Edition`, `MoneyAccount` and `User`.
- `docs/file-structure.md` — the `/cash` route with its six files, and
  `lib/cash.ts`.

Commit.

---

## Step 9 — Verify

**Delegate the mechanical half** (see the master's delegation section): one agent
on `npm run lint`, `npm run check:design`, `npm run build`; one agent on `en`/`fr`
parity for the `cash` block and `shell.cash`.

Do the behavioural pass yourself against the local database:

- No cash account in the edition → the empty screen points at `/money-accounts`.
- Open a register: the counter's live total matches the sheet, the register
  appears at the top of the list with that float.
- Try to open one on a `BANK` account → refused with a sentence.
- Open with every field blank → refused.
- Close a register with a partial count → both sheets are visible afterwards, the
  status badge flips, the row moves down the list.
- Close it again → refused.
- Close with everything blank and no confirmation → refused; with the box ticked →
  accepted with a zero total.
- Switch to a closed edition → the "Open a register" button is gone and the
  action refuses.
- A non-admin, non-accounting user → `/cash` is not in the sidebar or the drawer.
- 390px viewport: the twelve counter rows and the modal are usable one-handed.

Commit anything this changed.

---

## Step 10 — Release

Follow **Release protocol** in [100-cash-manager-pos.md](100-cash-manager-pos.md).
Directive: **`requires-migration`**. Do not monitor the deployment.
