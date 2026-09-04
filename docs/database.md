# Database Design

The database uses **PostgreSQL** accessed via **Prisma 6**. The schema is in [`prisma/schema.prisma`](../prisma/schema.prisma).

Dev workflow: `npm run db:generate` (regenerate the Prisma client) then `npm run db:push` (apply schema changes to the database without migrations).

---

## Entity-Relationship Overview

```
Department                        (global, not Edition-scoped)
 ├─> User          (many-to-many)
 ├─> PasswordEntry (many-to-many)
 └─< DepartmentBudget ─< BudgetLine

Edition
 ├─< DepartmentBudget
 ├─< MoneyAccount
 ├─< CostCenter
 ├─< JournalEntry
 ├─< Invoice
 └─< ExpenseReport

JournalEntry ─── Department (optional)
             ─── MoneyAccount
             ─── CostCenter (optional)

ExpenseReport ─── User (submittedBy)
              ─── Department

Task ─── User (createdBy / assignedTo / resolvedBy)
     ─── Department (DEPARTMENT_ACCESS_REQUEST)
     ─── ExpenseReport | StaffAssignment | Todo

Invoice ─── MoneyAccount (bankAccount)

DocumentTemplate  (global, not Edition-scoped)

Address ─< AddressBankAccount     (global, not Edition-scoped)
AddressType ─< Address            (global; the FK is optional and SetNull)
City                              (global lookup table, no relations)

StockUnit ─< StockElement         (global, not Edition-scoped)
StockPlace ─< StockItem >─ StockElement
StockMovement ─ StockPlace / StockElement / StockItem? / User?
```

---

## Models

### `User`
Represents an authenticated application user.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `email` | String | Unique |
| `name` | String? | Display name |
| `passwordHash` | String | bcrypt hash |
| `role` | `Role` enum | `ADMIN` or `DEPARTMENT` |
| `refundFirstName` | String? | For refund tracking |
| `refundLastName` | String? | |
| `refundIban` | String? | |
| `refundZip` | String? | |
| `refundCity` | String? | |
| `twoFactorEnabled` | Boolean | Default `false`. When true, login asks for a TOTP code on top of the password |
| `twoFactorCipher` | String? | Base64 AES-256-GCM ciphertext of the TOTP seed |
| `twoFactorIv` | String? | Base64 nonce |
| `twoFactorTag` | String? | Base64 GCM auth tag |
| `selectedEditionId` | String? | FK → Edition (`onDelete: SetNull`). The edition this user works in — see below |
| `departments` | `Department[]` | Many-to-many: which departments this user belongs to |

**`selectedEditionId` is how edition scoping works.** There is no global active edition; every
request resolves the edition from the signed-in user (`app/lib/edition-context.ts`). The column is
seeded once from `Edition.isDefault` — at account creation, at first login, or on the next request
if it is still null — and only the user's own picker changes it afterwards. The relation is
`SetNull`, not `Cascade` like every other `Edition` relation: deleting an edition must never delete
its users, so their selection is cleared and re-seeds from the default instead.

**The three `twoFactor*` cipher columns hold a seed, not a state.** They are written the
moment the user starts enrolling and `twoFactorEnabled` only flips once a code from that seed
has been verified — so a seed with `twoFactorEnabled = false` is a *pending* enrolment that
login ignores, and a half-finished setup can never lock an account out. The seed is sealed with
the same `PASSWORD_VAULT_KEY` as the Passwords vault (`app/lib/secret-crypto.ts`), so rotating
that key makes every enrolled account's 2FA unverifiable — see [`auth.md`](./auth.md).

**Role enum:** `ADMIN` can access all routes and all admin actions. `DEPARTMENT` is blocked by
middleware from admin routes (editions, journal, cost centers, invoices, templates, departments,
users) and redirected to `/budget`; budget, tasks, calendar, events, and expense reports remain
accessible. Money accounts are a special case: `DEPARTMENT` users in the `"Comptabilité"`
department can access and manage them like an `ADMIN` would — see [`auth.md`](./auth.md).

---

### `PasswordEntry`
Shared, department-scoped credential store (the Passwords tab). **Not** edition-scoped — entries persist across editions. Secret fields are encrypted at rest with AES-256-GCM; see [passwords.md](passwords.md).

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | Display name (e.g. "Canva") |
| `login` | String | Email / login — plaintext, so entries stay searchable |
| `website` | String? | Link to the page that uses the login |
| `passwordCipher` / `passwordIv` / `passwordTag` | String | AES-256-GCM sealed password (base64) |
| `totpCipher` / `totpIv` / `totpTag` | String? | AES-256-GCM sealed 2FA seed (base32 or `otpauth://` URI); null when no 2FA |
| `createdById` | String? | FK → User (`onDelete: SetNull`) |
| `departments` | `Department[]` | Many-to-many: which departments can see this entry |

Visibility: a user sees an entry if they share at least one `Department` with it; admins see all. Secret columns never leave the server except through the authorized reveal actions.

---

### `Edition`
Top-level scoping unit for a fiscal year / accounting period.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | Unique — e.g. "2024-2025" |
| `startDate` / `endDate` | DateTime? | Optional bounds of the fiscal year |
| `drivingRatePerKm` | Decimal | CHF per km for driving expense reports |
| `isDefault` | Boolean | At most one. Seeds `User.selectedEditionId` for accounts that have none; never a runtime fallback |
| `closedAt` | DateTime? | Set when the year is closed. Non-null makes the edition read-only — `requireWritableEdition()` refuses every write against it, while reads, exports and PDFs keep working. Clearing it (`reopenEditionAction`) makes the edition writable again |
| `usersSelecting` | `User[]` | Users currently working in this edition |

There is no carry-forward balance on the edition itself: a previous year's closing balance arrives
as a locked opening `JournalEntry` per money account, written by `carryOverEdition()`.

The global `isActive` flag this model used to carry was replaced by `isDefault` in
`20260817230613_user_selected_edition` and dropped in `20260818071444_drop_edition_is_active` —
additive first, destructive second, one release apart, as `production.md` requires.

All transactional data (journal entries, invoices, expense reports, budget lines, department budgets, money accounts, cost centers) is tied to one Edition. Departments themselves are not — see `Department` below.

Flipping `isDefault` moves nobody — every existing user keeps the edition already written to their
`selectedEditionId`. That is deliberate: it is a seed for new accounts, not a switch for everyone.

---

### `Department`
An organisational unit of the association (committee, section, team). **Not** edition-scoped: the
same PROGRAMMATION carries from one edition to the next, and it is what a user belongs to, what a
password entry is shared with, and what an appointment invites. Managed at `/departments` by
`ADMIN` users only.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | Unique |
| `abbreviation` | String? | Short code for dense rows; optional |
| `hasBudget` | Boolean | Default `false`. Whether the department budgets at all |
| `budgets` | `DepartmentBudget[]` | One per edition it has planned anything in |
| `users` / `passwordEntries` | many-to-many | Membership, and vault visibility |
| `journalEntries` | `JournalEntry[]` | Entries attributed to this department, across editions |
| `expenseReports` | `ExpenseReport[]` | Expenses filed under it |
| `appointmentInvites` | `AppointmentInviteDepartment[]` | Calendar invitations addressed to it |

**`hasBudget` is the guarded field.** Turning it on costs nothing — no `DepartmentBudget` row is
written until a line is actually planned. Turning it off is refused while any edition's budget
still holds budget lines, or while any journal entry points at the department
(`lib/departments.ts#departmentBudgetUsage`); empty budgets are deleted with it.

Deleting a department is refused while people, budget lines, journal entries, expense reports,
password entries or appointment invitations still point at it.

---

### `DepartmentBudget`
One department's budget inside one edition. It exists so a budget can be per-edition while the
department is not; it carries no name and no settings of its own, only the lines. Journal entries
do **not** hang off it — they carry their own `editionId` and point straight at the department,
which is what lets a department be compared to its budget without going through this row.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `editionId` | String | FK → Edition (onDelete: Cascade) |
| `departmentId` | String | FK → Department (onDelete: Cascade) |
| `budgetLines` | `BudgetLine[]` | |

`(editionId, departmentId)` is unique. Rows are created on first use
(`lib/departments.ts#resolveDepartmentBudgetId`) or by `carryOverEdition`, never in bulk when an
edition is created: an edition a department took no part in should not carry an empty budget for it
forever.

---

### `MoneyAccount`
A bank, cash or other account used as the debit/credit side of journal entries and also as the
sender account for invoices. Created, edited and deleted from `/money-accounts` (menu entry under
"Editions") by `ADMIN` users and by `DEPARTMENT` users in the `"Comptabilité"` department — see
[`auth.md`](./auth.md). Deletion is blocked while the account still has journal entries or
invoices attached.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `editionId` | String | FK → Edition (onDelete: Cascade) |
| `name` | String | Unique per edition |
| `type` | `MoneyAccountType` | `BANK` \| `CASH` \| `OTHER` — only `BANK` shows/needs IBAN and beneficiary fields |
| `openingBalance` | Decimal | Carried forward from the prior edition's closing balance |
| `iban` | String? | Needed for Swiss QR invoices (BANK only) |
| `beneficiaryName` | String? | Sender name for invoice header (BANK only) |
| `beneficiaryAddress` | String? | Sender address for invoice header (BANK only) |
| `beneficiaryPostalCode` | String? | (BANK only) |
| `beneficiaryCity` | String? | (BANK only) |
| `beneficiaryCountry` | String | Defaults to `"CH"` |

---

### `CostCenter`
Optional free-form label that can be attached to a journal entry for sub-categorisation.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | |
| `editionId` | String | FK → Edition (onDelete: Cascade) |

---

### `BudgetLine`
One planned spending or earning inside a department's budget for an edition.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `label` | String | Description of the allocation |
| `amount` | Decimal | Budgeted amount |
| `departmentBudgetId` | String | FK → DepartmentBudget (onDelete: Cascade) |

---

### `JournalEntry`
A single accounting entry (debit or credit) in the general ledger.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `sequenceNumber` | Int | Auto-increment within edition via `autoincrement()` |
| `date` | DateTime | Entry date |
| `description` | String | Free-text description |
| `debit` | Decimal | Amount debited (can be 0) |
| `credit` | Decimal | Amount credited (can be 0) |
| `isOpeningEntry` | Boolean | If true, the entry is locked (opening balance import, cannot be edited or deleted) |
| `departmentId` | String? | FK → Department (onDelete: SetNull); the department must have `hasBudget` |
| `moneyAccountId` | String | FK → MoneyAccount |
| `costCenterId` | String? | FK → CostCenter (optional) |
| `editionId` | String | FK → Edition (onDelete: Cascade) |

---

### `DocumentTemplate`
HTML template stored in the database for generating PDFs. Not edition-scoped — templates are global.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | Human-readable name |
| `content` | String | Full HTML with `[[field]]` placeholders |
| `isDefault` | Boolean | If true, used for invoice PDF generation |
| `isBuiltIn` | Boolean | If true, cannot be deleted |

Only one template may have `isDefault = true` at a time (enforced in server actions).

---

### `Invoice`
A persisted invoice record generated from the invoice builder.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `invoiceNumber` | String | Unique — e.g. "2025-001" |
| `recipientName` | String | |
| `recipientAddress` | String | |
| `lineItems` | Json | Line items array of `{ description, quantity, unitPrice }` |
| `totalAmount` | Decimal | Derived server-side as the sum of `quantity × unitPrice`; not trusted from the client |
| `currency` | String | e.g. "CHF" |
| `date` | DateTime | |
| `dueDate` | DateTime? | |
| `reference` | String? | QR reference number |
| `moneyAccountId` | String | FK → MoneyAccount (the sender's bank account) |
| `editionId` | String | FK → Edition (onDelete: Cascade) |

---

### `ExpenseReport`
An expense submitted by a department user for approval and reimbursement.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `title` | String | Short description |
| `amount` | Decimal | |
| `date` | DateTime | |
| `proof` | Bytes? | Raw file bytes of the attached proof |
| `proofMimeType` | String? | MIME type of the proof file |
| `status` | `ExpenseStatus` | `PENDING`, `APPROVED`, or `REJECTED` |
| `rejectionReason` | String? | Admin-filled when rejecting |
| `submittedById` | String | FK → User |
| `editionId` | String | FK → Edition (onDelete: Cascade) |

**ExpenseStatus enum:** `PENDING` (just submitted), `APPROVED` (admin approved — links to journal), `REJECTED` (admin rejected with reason).

---

### `Task`
One thing waiting to be done. A task is addressed either to **one user** (`assignedToUserId`) or to
a **role** (`assignedToRole`) — a role-assigned task is shared: every user with that role sees it,
and the first to resolve it clears it for all of them.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `type` | `TaskType` | See below |
| `status` | `TaskStatus` | `PENDING` or `DONE` |
| `title` | String | Written server-side in English, displayed as-is |
| `createdById` | String? | FK → User (onDelete: SetNull — tasks outlive their creator) |
| `editionId` | String? | FK → Edition; null for global tasks, which stay writable in a closed edition |
| `assignedToUserId` | String? | FK → User (onDelete: Cascade) |
| `assignedToRole` | `UserRole?` | Shared task: every user of that role sees it |
| `resolvedById` / `resolvedAt` | String? / DateTime? | Who marked it done, and when |
| `expenseReportId` | String? | `REVIEW_EXPENSE_REPORT` / `RECORD_JOURNAL` |
| `staffAssignmentId` | String? | `STAFF_SHIFT`, unique |
| `departmentId` | String? | `DEPARTMENT_ACCESS_REQUEST`: the department asked for (onDelete: Cascade) |
| `todoId` | String? | `GENERAL` tasks grouped under a `Todo` |
| `dueDate` | DateTime? | |

**TaskType enum:** `GENERAL` (hand-written), `REVIEW_EXPENSE_REPORT`, `RECORD_JOURNAL`,
`STAFF_SHIFT`, `DEPARTMENT_ACCESS_REQUEST` (a user asked to join a department — see
[business-processes.md](./business-processes.md)). Resolving a task never performs the underlying
action: it records that somebody dealt with it.

### `Address`
One person or organisation the festival deals with. **Global, not edition-scoped:** a supplier does
not stop existing when an edition closes, so the book carries across years and stays writable in a
closed one.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `firstName` | String? | One of `firstName` / `companyName` is required — see below |
| `lastName` | String? | |
| `companyName` | String? | |
| `street` | String? | |
| `country` | String | ISO 3166-1 alpha-2, default `"CH"` |
| `postalCode` / `city` | String? | Proposed from `City`, never constrained by it |
| `phonePrefix` | String? | International dialling prefix with its `+` (`"+41"`), kept apart from the number so a list can filter on either |
| `phoneNumber` | String? | |
| `email` | String? | |
| `note` | String? | The contact's description — labelled **Description** on every screen |
| `addressTypeId` | String? | The contact type. Optional, `onDelete: SetNull` — see `AddressType` |
| `bankAccounts` | `AddressBankAccount[]` | |

**"A first name or a company name" is enforced in the server action, not the database.** Postgres
cannot express "one of these two columns is NOT NULL" as a constraint, so
`app/(app)/addresses/actions.ts` is the single place that decides it — a row with neither has no
name to be found by.

**Access is deliberately wide.** Any signed-in user may add and edit an address, because the book is
only useful when whoever has the address in front of them can file it. Deleting is the one exception
and is admin-only (`isAdmin()`), since an address is referenced by invoices by the time it matters.

### `AddressType`
What an address *is* to the festival — the contact type shown on every address:
sponsor, supplier, partner, artist, staff. A table rather than an enum, so an
admin adds one from `/addresses/settings` without shipping a migration; the five
starting rows are inserted by the migration that creates the table, the same way
the stock units are.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | Unique |
| `addresses` | `Address[]` | |

**Blank is a valid answer**, so the FK on `Address` is nullable and `SetNull`:
deleting a type leaves its addresses untyped rather than taking them with it. The
settings screen says how many that is before it happens.

### `AddressBankAccount`
One IBAN belonging to an address — an address can hold several, because the same supplier invoices
from more than one account often enough.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `addressId` | String | FK → Address (onDelete: Cascade) |
| `displayName` | String | Required |
| `street` | String? | |
| `postalCode` / `city` / `country` | String | All required; country defaults to `"CH"` |
| `iban` | String | Required. Stored normalised — no spaces, upper case — the way `lib/swiss-qr.ts` reads it |

### `City`
The postal-code ↔ locality lookup that feeds the address fields' proposals.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `country` | String | Default `"CH"` |
| `postalCode` | String | |
| `name` | String | |

Unique on `(country, postalCode, name)`, indexed on `(country, postalCode)` and `(country, name)` —
the two directions the fields query it in.

**Cities are proposals, never constraints.** An address keeps whatever locality was typed, so a
foreign or brand-new one is still writable. Two things follow:

- The Swiss list (geonames.org, CC BY 4.0 — ~4,300 pairs, distribution-district suffixes like
  "Lausanne 10" folded into the locality) ships as a **data migration**, not as seed data.
  `prisma migrate deploy` is the only step the deploy pipeline runs on its own; `npm run db:seed` is
  a first-install command, so anything left to it would never reach a running box.
- Every pair a user actually saves is written back by `rememberCity()` (`lib/city-book.ts`), so the
  second person to write to a foreign supplier gets the proposal the first one had to type out.

---

### `StockPlace`
A place stock is held in — a cellar, a container, a van. Global: a shelf does not empty when an
edition closes.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | Unique |

`User.selectedStockPlaceId` points here (`SetNull`) — which stock a user works in is a preference on
the user, exactly like `selectedEditionId`.

### `StockUnit`
The unit an item is measured in. A table rather than an enum, so an admin adds one without shipping
a migration; the seven starting values (`pce`, `l`, `ml`, `kg`, `g`, `m`, `m2`) are inserted by the
migration that creates the table, for the same reason the Swiss city list is
(see [`City`](#city)). `StockElement.unitId` is `Restrict`: a unit in use cannot vanish under the
items measured in it.

### `StockUnitConversion`
"One `from` is `factor` `to`" — the table the item dialogs offer a unit swap from.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `fromUnitId` | String | FK → StockUnit, `Cascade` |
| `toUnitId` | String | FK → StockUnit, `Cascade` |
| `factor` | Decimal(18,9) | How many `to` one `from` is: one ml is `0.001` l |

Unique on `(fromUnitId, toUnitId)`, and one row is one **direction** — ml → l and l → ml are two
rows, so an admin keeps only the direction the shelves use. `Cascade` both ways: a conversion whose
unit is gone has nothing left to describe.

Nothing here converts stored data. A factor fills in a form field before it is saved, so correcting
one never moves stock, and items saved earlier keep the numbers they were saved with.

### `StockElement`
The catalogue entry — what *can* be stocked, not the stock itself.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | |
| `brand` | String? | |
| `barcode` | String? | Unique. The EAN/GTIN printed on the packaging, digits only — what the scanner looks an item up by |
| `unitId` | String | FK → StockUnit, `Restrict` |
| `unitQty` | Decimal(12,3) | The size of **one piece**: a 1.5 l bottle is unit `l`, unitQty `1.5` |
| `expireable` | Boolean | Whether a piece carries an expiry date. False hides the field entirely |

Deleting one is refused while any `StockItem` references it (`Restrict`), and takes its movements
with it when it is allowed (`Cascade`) — a log of an item that no longer exists has nothing left to
name it by.

### `StockItem`
One element, in one place, at one expiry date, counted in **pieces**.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `stockPlaceId` | String | FK → StockPlace, `Cascade` |
| `elementId` | String | FK → StockElement, `Restrict` |
| `quantity` | Int | Pieces. The total is `quantity × element.unitQty` |
| `expireDate` | Date? | NULL when the element does not expire, or the date is unknown |

Unique on `(stockPlaceId, elementId, expireDate)`: two rows of the same item in the same place exist
precisely when their expiry dates differ. Postgres counts two NULLs as different values, so the
undated case is merged in the action (`addToPlace()`), not by the index.

`expireDate` is editable on a row that already exists (`setStockItemQuantityAction()` saves it
alongside the recount). Re-dating a row onto a date the place already holds for that item would
break the unique index, so the action merges instead: everything leaves the corrected row, lands on
the row that was already there — both legs logged — and the empty row is deleted.

### `StockMovement`
Every quantity change, in the order it happened.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `stockPlaceId` | String | FK → StockPlace, `Cascade` |
| `elementId` | String | FK → StockElement, `Cascade` |
| `stockItemId` | String? | FK → StockItem, **`SetNull`** |
| `expireDate` | Date? | The dated shelf this was against, kept after the row is gone |
| `delta` | Int | A magnitude, never signed |
| `isIn` | Boolean | Which way it went |
| `createdById` | String? | FK → User, `SetNull` |

`delta` + `isIn` rather than a signed number, so a movement reads the same after the row it changed
is deleted — which is the point of `stockItemId` being `SetNull`. The place is the one thing it
cannot outlive: deleting a `StockPlace` cascades its movements, because there is no place left for
them to describe (and a place can only be deleted once its contents have been moved out).

---

## Key Patterns

### Edition-scoping
Every transactional model has an `editionId` FK with `onDelete: Cascade`. When an Edition is deleted, all its data is removed.

Reads and writes alike scope to the **signed-in user's** edition, resolved through
`app/lib/edition-context.ts`:

- `resolveEditionIdOrNull()` — nullable, for pages, which render a "pick an edition" state rather than throwing.
- `resolveEditionId()` — throws, for write paths, where "no edition" is an error to report back to the form.
- `resolveEdition()` — the edition record itself, for headers and the sidebar picker.
- `ensureUserEdition(userId)` — the only writer of the seed.

`User.selectedEditionId` is the one exception to the Cascade rule: it is `SetNull`, because deleting
an edition must not delete the users who were looking at it.

### Cascade vs Restrict
- Edition delete cascades to all its records.
- Department delete cascades to its DepartmentBudget records, and those to their BudgetLine
  records — but a department with any of them is refused deletion before it gets there.
- StockPlace delete cascades to its items and movements; StockElement delete is *refused* while it
  is stocked anywhere.

### Decimal precision
Monetary amounts use `Prisma.Decimal` / PostgreSQL `DECIMAL` to avoid floating-point rounding. The helper `decimalToNumber()` in `lib/utils.ts` converts for display.
