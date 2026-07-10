# Business Processes

This document describes the main workflows in the application from a functional perspective.

---

## 1. Editions (Fiscal Years)

An Edition represents a fiscal year or accounting period. All data is scoped to an edition.

### Lifecycle

```
Admin creates a new edition
        │
        ▼
Edition starts in an inactive state
        │
        ▼
Admin activates the edition (sets isActive = true)
  → Any previously active edition is deactivated
  → The new edition becomes the target for all new data
        │
        ▼
Work proceeds: journal entries, invoices, expense reports are created
        │
        ▼
At year end, admin creates the next edition
  → Optionally sets openingBalance = closing balance of the previous edition
  → Activates the new edition
```

- Only one edition can be `isActive = true` at any time.
- Activating a new edition does NOT delete old data — historical editions remain fully readable.
- Opening balances from the old edition can be imported as locked `isOpeningEntry = true` journal entries in the new one.

---

## 2. Budget Management

### Who does what
- **Admin:** creates Departments and BudgetLines, sets amounts.
- **Department user:** views their own department's budget vs. actual spending (read-only).

Create, update, and delete of budget lines (`app/(app)/budget/actions.ts`) are all scoped to the
active edition: the mutation first confirms the target line's department belongs to the active
edition, so a stale page from a previous edition cannot mutate another edition's data.

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

### Refund profile
Each user can fill in their own bank details (first name, last name, IBAN, ZIP, city) via the settings modal in the app shell. These fields are saved to `/api/preferences/language` and stored on the `User` record. Admins can see these details when reviewing expense reports to know where to send reimbursements.

---

## 8. Money Accounts & Cost Centers

### Money Accounts
Represent real bank or cash accounts. Each journal entry must be linked to a money account. Money accounts also serve as the sender bank account for invoice generation (providing IBAN and address for the QR payload). The dashboard shows the running balance of each money account (sum of debits minus sum of credits).

### Cost Centers
Optional labels that can be attached to journal entries for finer-grained reporting (e.g. a project name or event). They have no budget — they are purely for reporting and filtering.
