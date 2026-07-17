# Database Design

The database uses **PostgreSQL** accessed via **Prisma 6**. The schema is in [`prisma/schema.prisma`](../prisma/schema.prisma).

Dev workflow: `npm run db:generate` (regenerate the Prisma client) then `npm run db:push` (apply schema changes to the database without migrations).

---

## Entity-Relationship Overview

```
User
 └─< DepartmentRole >─ Department
                            └─< BudgetLine

Edition
 ├─< Department
 ├─< MoneyAccount
 ├─< CostCenter
 ├─< JournalEntry
 ├─< Invoice
 └─< ExpenseReport

JournalEntry ─── Department
             ─── MoneyAccount
             ─── CostCenter (optional)

ExpenseReport ─── User (submittedBy)

Invoice ─── MoneyAccount (bankAccount)

DocumentTemplate  (global, not Edition-scoped)
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
| `departmentRoles` | `DepartmentRole[]` | Which departments this user belongs to |

**Role enum:** `ADMIN` can access all routes and all admin actions. `DEPARTMENT` is blocked by
middleware from admin routes (editions, journal, money accounts, cost centers, invoices, templates,
departments, users) and redirected to `/budget`; budget, tasks, calendar, events, and expense reports
remain accessible.

---

### `DepartmentRole`
Join model linking a User to a Department. A user may belong to multiple departments. Only meaningful for `DEPARTMENT` role users.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `userId` | String | FK → User |
| `departmentId` | String | FK → Department |
| `name` | String | Snapshot of the department name at assignment time |

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
| `departmentRoles` | `DepartmentRole[]` | Many-to-many: which departments can see this entry |

Visibility: a user sees an entry if they share at least one `DepartmentRole` with it; admins see all. Secret columns never leave the server except through the authorized reveal actions.

---

### `Edition`
Top-level scoping unit for a fiscal year / accounting period.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | Unique — e.g. "2024-2025" |
| `isActive` | Boolean | At most one edition is active at a time |
| `openingBalance` | Decimal | Carry-forward from previous edition |

All transactional data (journal entries, invoices, expense reports, budget lines, departments, money accounts, cost centers) is tied to one Edition.

---

### `Department`
Represents an organisational unit (committee, section, team).

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | |
| `editionId` | String | FK → Edition (onDelete: Cascade) |
| `budgetLines` | `BudgetLine[]` | Budget allocations for this department |
| `journalEntries` | `JournalEntry[]` | Charges attributed to this department |

`(name, editionId)` has a unique constraint — no duplicate department names within an edition.

---

### `MoneyAccount`
A bank or cash account used as the debit/credit side of journal entries and also as the sender account for invoices.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | |
| `iban` | String? | Needed for Swiss QR invoices |
| `address` | String? | Sender address for invoice header |
| `editionId` | String | FK → Edition (onDelete: Cascade) |

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
A budget allocation for a department within an edition.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `name` | String | Description of the allocation |
| `amount` | Decimal | Budgeted amount |
| `departmentId` | String | FK → Department (onDelete: Cascade) |
| `editionId` | String | FK → Edition (onDelete: Cascade) |

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
| `departmentId` | String | FK → Department |
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

## Key Patterns

### Edition-scoping
Every transactional model has an `editionId` FK with `onDelete: Cascade`. When an Edition is deleted, all its data is removed. Only one Edition can be `isActive = true` — this is the edition used for all new data writes. All read queries filter by `edition: { isActive: true }`.

### Cascade vs Restrict
- Edition delete cascades to all its records.
- Department delete cascades to its BudgetLine records.
- User delete cascades to their DepartmentRole records.

### Decimal precision
Monetary amounts use `Prisma.Decimal` / PostgreSQL `DECIMAL` to avoid floating-point rounding. The helper `decimalToNumber()` in `lib/utils.ts` converts for display.
