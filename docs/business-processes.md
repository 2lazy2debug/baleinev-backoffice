# Business Processes

This document describes the main workflows in the application from a functional perspective.

---

## 1. Editions (Fiscal Years)

An Edition represents a fiscal year or accounting period. All data is scoped to an edition.

**Each user picks their own edition.** There is no global "active edition": the answer to "which
edition is this request in" lives on the user, in `User.selectedEditionId`, and is resolved by
`app/lib/edition-context.ts`. Two people can work in two different editions at the same time.

### Lifecycle

```
Admin creates a new edition
        │
        ▼
It is one edition among several — all of them stay selectable
        │
        ▼
Each user picks their edition from the sidebar picker
  → POST /api/preferences/edition writes User.selectedEditionId
  → Only that user moves
        │
        ▼
Work proceeds in whichever edition each user selected
        │
        ▼
At year end, admin creates the next edition (optionally bringing data over)
and closes the old one — two separate, explicit actions
        │
        ▼
A closed edition is read-only: still selectable, browsable, exportable, printable
        │
        ▼
Reopening it clears closedAt and writes work again
```

- `Edition.isDefault` marks the edition that **seeds accounts with no edition yet**. It is written
  into `User.selectedEditionId` once — at account creation, or at that user's first login — and
  never consulted again. Changing the default therefore affects **new accounts only**; everyone
  already using the app keeps the edition they are in.
- Deleting an edition does not delete its users: the relation is `onDelete: SetNull`, so anyone
  pointing at it has their selection cleared and re-seeds from the default on their next request.
- **Closing means read-only, not gone.** A closed edition stays in the picker (marked "closed"),
  its pages render with their data, and exports and invoice PDFs keep working. Every *write*
  against it is refused with "This edition is closed. Reopen it to make changes."
- **Closing stamps `closedAt` and nothing else.** It creates no successor and copies nothing —
  creating the next edition and bringing data into it is the separate, explicit action below, so
  several editions can be open at once.
- **Closing the default hands the default to the newest open edition** (names are `YYYY-YYYY`, so
  newest is by name). Otherwise new accounts would be seeded straight into a frozen year. When no
  open edition is left, the app simply has no default and a new account lands in the "pick an
  edition" state.
- **Closing is reversible.** "Reopen year" (`reopenEditionAction`, admin only) clears `closedAt`
  and writes work again, so a mis-click needs no database access. Reopening does not restore the
  default — that is set explicitly.
- The enforcement is `requireWritableEdition()` in `app/lib/edition-context.ts`, called by every
  write path that touches edition-scoped data — the action files, and
  `app/app/api/invoices/route.ts`, which guards the `editionId` from its request body rather than
  the caller's own edition. The UI additionally hides create/edit/delete affordances and shows a
  banner, but that is a courtesy; the server guard is the control.
- **Passwords, users, templates and event types are global** — they carry no `editionId` and stay
  writable whatever edition the user is in.
- Creating a new edition does NOT delete old data — historical editions remain fully readable.
- **Bringing data into a new edition is an explicit choice.** The new-edition dialog has an
  optional "Bring over from" select; leaving it empty creates a blank edition.
  `carryOverEdition()` in `app/lib/edition-carry-over.ts` copies **departments with their budget
  lines**, **cost centers** and **money accounts** (bank identity included, so a carried account can
  still produce a Swiss QR invoice), then writes one locked `isOpeningEntry = true` journal entry per
  account that does not close at zero, labelled `Report édition précédente`. Each opening entry takes
  its own sequence number, because `JournalEntry` is unique on `(editionId, sequenceNumber)`.
- The carried amount lives in the opening entry, **not** in `MoneyAccount.openingBalance`, which
  stays 0 — a balance is `openingBalance + entries`, so writing it in both places would double it.
- **Budget lines come over verbatim**, amounts included — a year's budget is mostly last year's with
  different numbers, so the admin edits them instead of retyping every line. Each copied line keeps
  its source `createdAt`, which is what preserves the order the budget was planned in.
- The whole thing runs in the create transaction, so a failed copy leaves no half-populated edition.

---

## 2. Budget Management

### Who does what
- **Admin:** creates Departments and BudgetLines, sets amounts.
- **Department user:** views their own department's budget vs. actual spending (read-only).

Create, update, and delete of budget lines (`app/(app)/budget/actions.ts`) are all scoped to the
user's selected edition: the mutation first confirms the target line's department belongs to the
edition `resolveEditionId()` returns, so a stale page from another edition cannot mutate its data.

### Setup flow
```
Admin creates Departments (e.g. "Communication", "Events")
        │
        ▼
Admin creates BudgetLines under each department
  (e.g. "Printing: 500 CHF", "Venue rental: 2000 CHF")
        │
        ▼
Department users are assigned to departments via DepartmentRoles
        │
        ▼
As journal entries accumulate, the dashboard shows budget vs. actuals
```

### Budget vs. actuals calculation
The dashboard (`app/(app)/page.tsx`) sums `JournalEntry.debit` for entries belonging to each department and compares to the sum of `BudgetLine.amount` for that department. The difference is the remaining (or overspent) budget.

---

## 3. Journal Entries

The journal is the core accounting ledger. Every financial movement is recorded as a journal entry.

### Entry fields
- **Date**, **Description**, **Debit** or **Credit** amount
- **Department** — which budget is affected
- **MoneyAccount** — which bank/cash account is involved
- **CostCenter** (optional) — for sub-categorisation

### Sequence numbers
Each entry gets an auto-incrementing `sequenceNumber` within the edition. This provides an audit-friendly ordered log.

### Locked entries
Entries with `isOpeningEntry = true` were imported from a previous edition's closing balance. They cannot be edited or deleted — they are permanent anchor points for the ledger.

### Journal entry creation
The journal page reads `?fromExpenseReport=<id>` from the URL. If present, the add-entry modal is pre-filled with the expense report's title, amount, date, and submitter's department — making it easy for an admin to record reimbursement after approving an expense report.

### Importing a bank statement
`scripts/import-bank-statement.ts` (`npm run db:import:bank`) replays a BCV
*Extraction transactionnelle* onto an edition. The statement is the truth for the bank
account, so the import **replaces** every entry on it rather than merging — re-run it
with a fresher export and the account is rebuilt.

- **Direction decides the side.** `Entrée` is a `PRODUITS` entry whose beneficiary is
  BLV; `Sortie` is a `CHARGES` entry whose beneficiary is the counterparty the bank
  names.
- **A bank/cash transfer is two entries.** The export only sees the bank's leg, so
  paying cash in is booked as income on the bank *and* a charge on the cash box, and
  drawing cash the other way round. `VERSEMENT` and `PRELEVEMENT` are what mark them.
- **Nothing is guessed.** Department and cost centre are left empty for a human to
  assign; the label is the *Communication* column, blank when there is none and blank
  for TWINT payouts, whose communication is a machine reference.
- **The control is the point.** The run refuses to write unless the account lands
  exactly on `--expect`. The export lists third-party movements only — `FRAIS`, `TAXE`,
  `COMMISSION` and `INTERET` appear nowhere in it — while BCV debits its charges all
  year, so the statement alone always lands *above* the real balance. The difference is
  booked as one dated, named charge (`Frais bancaires BCV (cumul)`), which can be split
  once the fee advices are at hand. A statement landing *below* `--expect` means
  movements are missing and the run aborts instead of inventing an entry.
- **Next year is kept in step.** The following edition's *solde à nouveau* entries are
  rewritten to the balances the import produced, so the two editions cannot drift apart.

---

## 4. Invoices (Swiss QR)

The invoice system generates ISO 20022 Swiss QR invoices.

### Flow
```
Admin opens the invoice builder
        │
        ▼
Fills in:
  - Invoice number, date, due date
  - Recipient name and address
  - Line items (description + amount each)
  - Selects which MoneyAccount (bank account) to use as sender
        │
        ▼
App generates a Swiss QR payload string (lib/swiss-qr.ts)
  → SPC format: header, version, coding, amount, currency, creditor IBAN + address, reference
        │
        ▼
QR code image is rendered live via GET /api/qr/swiss
  → qrcode library generates a PNG data URL
        │
        ▼
Admin clicks "Download PDF"
  → POST /api/documents/invoice/pdf
  → lib/document-templates.ts fetches the default DocumentTemplate
  → [[field]] placeholders are replaced with invoice data
  → Puppeteer renders the HTML and exports a PDF
  → PDF is streamed back to the browser
        │
        ▼
Invoice record is saved to the database (POST /api/invoices)
  → Appears in the invoice history table
```

### Invoice line items
Line items are stored as JSON in `Invoice.lineItems`. Each item has `{ description, quantity, unitPrice }`.
`Invoice.totalAmount` is **not** trusted from the client — the API (`POST`/`PUT /api/invoices`)
recomputes it server-side as the sum of `quantity × unitPrice` rounded to cents, so the stored total
can never disagree with the printed lines.

---

## 5. Expense Reports

Any authenticated user can submit an expense report for reimbursement.

### Submission flow (department user)
```
User fills in: title, amount, date, optional proof file (upload)
        │
        ▼
Server action: createExpenseReport()
  → Reads proof file bytes + MIME type
  → Creates ExpenseReport with status = PENDING
  → Proof is stored as bytes in the database (ExpenseReport.proof)
        │
        ▼
Admin sees the pending report in the admin section of the expense-reports page
  → Can view who submitted it and their bank details (refund profile)
  → Can click the ⓘ icon to see submitter's IBAN, name, address
```

### Approval flow (admin)
```
Admin clicks "Approve"
  → approveExpenseReport() server action
  → Sets status = APPROVED
  → Redirects admin to /journal?fromExpenseReport=<id>
  → Journal page opens with add-entry modal pre-filled
        │
        ▼
Admin finalises the journal entry (edits if needed, confirms)
  → Entry is saved to the ledger
  → Reimbursement is recorded as an accounting transaction
```

### Rejection flow (admin)
```
Admin fills in a rejection reason and clicks "Reject"
  → rejectExpenseReport() server action
  → Sets status = REJECTED, saves rejectionReason
  → User sees the rejection reason in their history
```

### Proof file serving
Proof files are stored as raw bytes in the DB (`ExpenseReport.proof`). They are served via an authenticated API route: `GET /api/expense-reports/[expenseReportId]/proof`. Only the submitter or an admin can access a proof file — the route checks the session before responding.

---

## 6. Document Templates

Document templates allow the admin to customise the HTML layout used for PDF generation (currently used for invoices).

### Template mechanics
- Templates are stored in the `DocumentTemplate` table as raw HTML strings.
- Placeholders use the `[[fieldName]]` syntax (e.g. `[[recipientName]]`, `[[totalAmount]]`, `[[qrCode]]`).
- `lib/document-templates.ts` defines `renderInvoiceTemplate(template, payload)` which replaces all placeholders with real values.
- The `[[qrCode]]` placeholder is replaced with a base64-encoded PNG of the Swiss QR code.

### Default template
- Exactly one template has `isDefault = true`.
- `lib/document-templates.ts` includes a built-in fallback template (`isBuiltIn = true`) that is created automatically on first run via `ensureDefaultInvoiceTemplate()`.
- Admins can create new templates, preview them, and promote any template to default.
- The built-in template cannot be deleted.

---

## 7. User Management

- All user accounts are created by an **admin** — there is no self-service signup.
- Admin can: create users, change name/email/password/role, assign departments, delete users.
- `DEPARTMENT` users are assigned to one or more departments via `DepartmentRole` records.
- When departments are renamed, `syncDepartmentRolesFromDepartments()` updates `DepartmentRole.name` to keep display names current.

### Asking to join a department
Users cannot grant themselves access. From the **Department access** card on `/account` a user picks
a department and requests it; `requestDepartmentAccessAction` files a `DEPARTMENT_ACCESS_REQUEST`
task assigned to the `ADMIN` role, titled "&lt;user&gt; asked to join &lt;department&gt;" and carrying
`Task.departmentRoleId`.

- Every admin sees the task on `/tasks` and on the dashboard, with a link to `/users`.
- The first admin to **Mark done** clears it for all of them (role-assigned tasks are shared).
- **Marking it done grants nothing.** The membership is still assigned by hand in `/users`, and the
  two are deliberately independent — an admin can refuse a request by simply clearing the task.
- One pending request per user per department: the card shows the ones waiting and leaves them out
  of the picker, and the action refuses a duplicate. Once a request is cleared the user may ask again.
- Deleting the `DepartmentRole` cascades the request away; deleting the requesting user deletes their
  pending requests (`deleteUserAction`), since nobody is left to grant them to.

### Refund profile
Each user can fill in their own bank details (first name, last name, IBAN, ZIP, city) on the Account screen (`/account`). The Bank details card saves them through `updateBankDetailsAction`, which normalises the IBAN (upper-case, no spaces) and stores the five fields on the `User` record. Admins can see these details when reviewing expense reports to know where to send reimbursements.

---

## 8. Money Accounts & Cost Centers

### Money Accounts
Represent real bank, cash, or other accounts. Each journal entry must be linked to a money account. Bank accounts also serve as the sender account for invoice generation (providing IBAN and address for the QR payload); cash and other accounts don't carry IBAN/beneficiary details. The dashboard shows the running balance of each money account (sum of debits minus sum of credits).

Managed from `/money-accounts` (menu entry under "Editions") by admins and by members of the
"Comptabilité" department, who can create, edit, and delete accounts. Deleting an account is only
allowed once it has no journal entries or invoices attached.

### Cost Centers
Optional labels that can be attached to journal entries for finer-grained reporting (e.g. a project name or event). They have no budget — they are purely for reporting and filtering.
