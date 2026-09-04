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
  `carryOverEdition()` in `app/lib/edition-carry-over.ts` copies **department budgets with their
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
- **Admin:** turns a department's budget on at `/departments`, then creates BudgetLines and sets
  amounts at `/budget`. Departments themselves are never created from the budget screen — they are
  global, and `/budget` only shows the ones with `hasBudget` for the selected edition.
- **Department user:** views their own department's budget vs. actual spending (read-only).

Create, update, and delete of budget lines (`app/(app)/budget/actions.ts`) are all scoped to the
user's selected edition: the mutation first confirms the target line's `DepartmentBudget` belongs to
the edition `resolveEditionId()` returns, so a stale page from another edition cannot mutate its
data. Writing the first line of a department's budget is also what opens that `DepartmentBudget`
row — see `resolveDepartmentBudgetId()` in `app/lib/departments.ts`.

### Setup flow
```
Admin creates Departments at /departments, with "Has a budget" on
  (e.g. "Communication", "Events")
        │
        ▼
Admin creates BudgetLines under each department, per edition
  (e.g. "Printing: 500 CHF", "Venue rental: 2000 CHF")
        │
        ▼
Department users are assigned to departments in /users
        │
        ▼
As journal entries accumulate, the dashboard shows budget vs. actuals
```

### Turning a budget off
`hasBudget` is a department-level flag, so it is refused whenever any edition's budget still holds
budget lines or any journal entry names the department — that data would have nowhere left to go.
Empty budgets are deleted with the flag. Turning a budget *on* writes nothing until a line is
planned.

### Budget vs. actuals calculation
The dashboard (`app/(app)/page.tsx`) reads the edition's `DepartmentBudget` rows for the planned side, and its own `JournalEntry` rows — matched on `departmentId`, since an entry carries its edition itself — for the actual one. The difference is the remaining (or overspent) budget.

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

### Editing entries
Three paths write an existing entry, and they share the same seven fields — date,
department, type, amount, label, money account, cost centre:

- **Inline, one row** (desktop table) — the pencil turns a row into inputs; the tick
  saves it on its own.
- **The full-page form** (`/journal/<id>`, and the phone's pencil) — the same seven
  fields plus counterparty and reference number.
- **Bulk edit** (admins only) — the *Bulk edit* button in the entries panel header
  turns **every** editable row into inputs at once, and *Save all* writes them in a
  single transaction. Only rows actually changed are sent, so a filter left on the
  table cannot silently rewrite what is hidden, and the count on the button is how
  many will be written.

While bulk edit is on, **no row saves on its own**: the per-row save, cancel and
delete controls are gone until *Save all* or *Cancel* ends the mode. Two ways to write
the same row at the same time is one too many. Opening entries stay locked and are
never given a draft — the server refuses them either way
(`bulkUpdateJournalEntriesAction` in `app/(app)/journal/actions.ts`).

Bulk edit is gated on `isAdmin` in the page and on `requireAdmin()` in the action;
a closed edition hides the button and `requireWritableEdition` refuses the write.
Counterparty and reference number are not columns of the grid, so neither the bulk
save nor the inline row save touches them.

### Journal entry creation
The journal page reads `?fromExpenseReport=<id>` from the URL. If present, the add-entry modal is pre-filled with the expense report's title, amount, date, and submitter's department — making it easy for an admin to record reimbursement after approving an expense report.

### Importing a bank statement
`scripts/import-bank-statement.ts` (`npm run db:import:bank`) replays a BCV
*Extraction transactionnelle* onto an edition. The statement is the truth for the bank
account, so the import **replaces** every entry on it rather than merging — re-run it
with a fresher export and the account is rebuilt.

- **Direction decides the side, never the counterpart.** `Entrée` is a `PRODUITS`
  entry, `Sortie` a `CHARGES` one, and both name the party the bank names. Writing
  BLV on income says nothing — an incoming payment is interesting precisely because
  of where it came from. Blank stays blank; the export occasionally names nobody (a
  `RETOUR PAIEMENT`, say), and that is left empty rather than guessed at.
- **A bank/cash transfer is two entries, and BLV is its counterpart.** The export only
  sees the bank's leg, so paying cash in is booked as income on the bank *and* a charge
  on the cash box, and drawing cash the other way round. `VERSEMENT` and `PRELEVEMENT`
  are what mark them. Both legs face BLV, because a movement between our own accounts
  has no third party — this is the only place the import writes BLV.
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
- **Re-running is safe.** The bank account is emptied and rebuilt, and so are the
  transfer legs the last run left on the cash box — otherwise a second import would
  double every transfer. Those legs are recognisable because every journal action
  requires a department, so an entry without one can only have come from this script.
  The cash box's own entries are never touched.

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
  - Recipient: picked from the address book, or typed — see below
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

### The recipient comes from the address book
"Use an address" above the recipient fields searches the address book by name, company, locality or
email; picking a row fills the four recipient fields (the company on the first line of the name
block, the contact under it). "New address" beside it opens the *same* create dialog the address
book uses — the new row is written, filed in the book and selected in one step, so nobody abandons a
half-written invoice to go add a supplier first.

Neither is binding: the recipient fields stay editable afterwards, and a one-off recipient can be
typed without being filed at all.

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
- **The screen opens read-only.** `/users` lists accounts — name, address, an admin/department badge
  and the departments as pills. The pencil turns one card into the update form, and deleting lives
  inside that form: reading an account is safe, and the state that can change it is the one that can
  end it.
- `DEPARTMENT` users are assigned to one or more `Department` records (a many-to-many). Departments
  are edition-independent, so a membership survives an edition change and needs no syncing — the
  list itself is managed at `/departments` (admins only).

### Asking to join a department
Users cannot grant themselves access. From the **Department access** card on `/account` a user picks
a department and requests it; `requestDepartmentAccessAction` files a `DEPARTMENT_ACCESS_REQUEST`
task assigned to the `ADMIN` role, titled "&lt;user&gt; asked to join &lt;department&gt;" and carrying
`Task.departmentId`.

- Every admin sees the task on `/tasks` and on the dashboard, with a link to `/users`.
- The first admin to **Mark done** clears it for all of them (role-assigned tasks are shared).
- **Marking it done grants nothing.** The membership is still assigned by hand in `/users`, and the
  two are deliberately independent — an admin can refuse a request by simply clearing the task.
- One pending request per user per department: the card shows the ones waiting and leaves them out
  of the picker, and the action refuses a duplicate. Once a request is cleared the user may ask again.
- Deleting the `Department` cascades the request away; deleting the requesting user deletes their
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

---

## 9. The Address Book

Everyone the festival writes to, invoices or pays, at `/addresses`. It is **global**: an address
carries across editions and stays writable when the selected one is closed.

### Who can do what
Any signed-in user can view, add and edit an address and its bank accounts. **Deleting an address is
admin-only** — by the time it matters, it is referenced from invoices. The **contact-type list** is
admin-only too, at `/addresses/settings`. There is no department scoping: a supplier is not a secret,
and a book only half the organisation can file into is a book nobody trusts.

### Contact types
Every address can be filed under one — sponsor, supplier, partner, artist, staff — and **blank is a
real answer**, so nothing has to be mislabelled to be saved. The list is data, not an enum: admins
add and rename types on the settings screen, and deleting one is allowed even while it is in use.
The dialog says how many addresses that is; they keep everything else and come back untyped.

### The list
The journal's shape: a filter row under the headers, sortable columns, edit in place above `sm`, and
the same rows as cardlets below it. A search field in the page header filters every column at once —
it is what a phone has instead of the desktop filter row, and it stays put while the list scrolls.
Phone numbers and email addresses are `tel:`/`mailto:` links wherever they appear.

### An address is read, then edited
Opening a row **displays** it: the description first — the one line that says why the row is in the
book at all — then type, name, company, street, locality, country, phone and email. The pencil at
the card's top right turns that same card into the form, and cancel throws the draft away. Its bank
accounts live underneath (display name + IBAN, added and edited in a dialog, deleted in place).

### Postal codes propose, they never impose
Typing a NPA proposes the localities that share it; typing a locality proposes its postal codes.
Picking either fills the other. Both are ordinary text fields with a list attached, so a foreign or
brand-new locality is still writable — and whatever *is* saved is filed back into the `City` table,
so the list grows into what the book actually needs. See
[database.md](database.md#city).


---

## 10. Stock

What the festival owns and where it sits, at `/stock`. Like the address book it is **global**: a
shelf does not empty when an edition closes, and none of it is refused while a closed edition is
selected.

### The three things it is made of
- An **item** is the catalogue entry — a name, an optional brand, the barcode printed on it when it
  has one, and the size of *one piece* (a 1.5 l bottle is unit `l`, one piece = 1.5) plus whether
  that piece carries an expiry date.
- A **stock** is a place things sit in: a cellar, a container, a van.
- An **entry** is one item, in one stock, at one expiry date, counted **in pieces**. Six bottles
  read as `6 x 1.5 l = 9 l`, which is why the two numbers are never mixed: the count is what you
  change, the total is what you have.

Two entries of the same item in the same stock exist precisely when their expiry dates differ.
Adding stock with a date that is already on the shelf tops that entry up instead of making a second
one; an item that does not expire never shows a date field at all.

### Pick a stock once
The first visit asks which stock you are in, and writes the answer to the user
(`User.selectedStockPlaceId`) exactly the way the selected edition is written. Every visit after
that opens straight onto the contents, and the box icon next to "New entry" is how you change your
mind. If the stock someone was in is deleted, they are asked again.

### Scanning a barcode
The square scan button in the "New entry" dialog opens the camera **in place of that dialog's
form** — there is no second window, and the flow is the one that was already open. The typed field
under the video is the other way in, for a cellar with no working camera and for a hardware scanner,
which types the digits and an Enter like a keyboard.

Either way the code is checked against its GTIN check digit before anything is looked up, and then
one of three things happens:

- **The catalogue knows it.** Its item is selected and the person is left in front of the quantity
  field — the entry is finished exactly as a hand-picked one is.
- **Nobody has filed it.** The same dialog switches to its "new item" half with the code attached,
  and whatever [Open Food Facts](https://world.openfoodfacts.org) knows about the product — name,
  brand, and the size of one piece with its unit — already typed in for checking. The name is taken
  in one fixed order, French then English then German then whatever the product is filed under —
  not the viewer's language, because the item is written once into a catalogue everyone shares. A product the
  service does not have, or cannot be reached about in six seconds, simply leaves the form empty:
  the lookup is a convenience, never a gate.
- **The digits are not a GTIN.** Nothing is looked up and the dialog says so.

The same button sits next to the barcode field on the catalogue's own item dialog, which is where a
code is filed on an item that already exists. A barcode belongs to exactly one item — the second
item to claim one is refused by name, before the write.

### Everything that moves a quantity is logged
Three gestures, one log:
- **+ / -** go straight to the server, one movement per click.
- **The edit button** unlocks the field instead; the buttons then move the number being typed, and
  locking it again saves the whole correction as a **single** movement — which is what a recount is.
- **New entry** and **take out of stock** are a movement each, in and out.

Taking out more than is on the shelf lands on zero and logs what actually left: a miscount is not
worth blocking on. A movement outlives the entry it changed, so taking something out of a stock does
not erase how it got there. `/stock/history` is the log, newest first, filtered by item, stock or
direction.

### Who can do what
Any signed-in user counts, adds, takes out, and keeps the catalogue up to date — including inventing
an item from inside the "New entry" dialog, because the person in front of an unfamiliar delivery is
the one who can name it. **Admins only**: deleting a catalogue item (and only once it is in no
stock), and everything on `/stock/settings` — the stocks themselves and the units.

### Deleting a stock never orphans anything
An empty stock is deleted outright. A stock with contents asks where they go first, and each entry
lands in the destination — merged into the entry with the same item and expiry date if there is one.
The one case with no answer is the last stock still holding something: there is nowhere to move it,
so the delete is refused until another stock exists. Deleting a stock also takes its own movement
history with it — there is no place left for those movements to describe.
