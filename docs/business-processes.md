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
  `carryOverEdition()` in `app/lib/edition-carry-over.ts` copies **budgets with their lines and
  department attachments**, **cost centers** and **money accounts** (bank identity included, so a carried account can
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

A **budget** is a named envelope of money inside one edition. It is created by hand at `/budget`
("create a budget" is a header button and a modal, like every other create in the app), holds the
budget lines and the journal entries booked against it, and is attached to zero or more
departments. **The attachment is visibility only** — it carries no money and no share, and
detaching a department takes nothing away from the budget. A budget with no department is visible
to **admins only**; a department user sees exactly the budgets of their own departments, one card
each.

### Who does what
- **Admin:** creates budgets at `/budget`, names them, attaches any departments (there is no
  eligibility flag — the picker offers every department), and creates BudgetLines with their
  amounts. Deleting a budget is refused while it holds a line — empty it first.
- **Department user:** views the budgets their departments are attached to, budget vs. actual
  spending (read-only).

Create, update, and delete of budgets and budget lines (`app/(app)/budget/actions.ts`) are all
scoped to the user's selected edition: the mutation first confirms the target budget belongs to
the edition `resolveEditionId()` returns (`assertBudgetInEdition()` in `app/lib/budgets.ts`), so a
stale page from another edition cannot mutate its data.

### Setup flow
```
Admin creates Departments at /departments (just a name)
        │
        ▼
Admin creates a Budget at /budget, names it, attaches departments
  (e.g. "Communication" attached to the Comms department)
        │
        ▼
Admin creates BudgetLines under each budget, per edition
  (e.g. "Printing: 500 CHF", "Venue rental: 2000 CHF")
        │
        ▼
Department users are assigned to departments in /users
        │
        ▼
As journal entries are booked against a budget, the dashboard shows budget vs. actuals
```

### Deleting a department
A department does not own its budgets, so a budget never blocks its deletion. Deleting the
department cascades the `BudgetDepartment` join rows away — every budget, its lines and its
journal entries stay put. The `/departments` delete dialog warns when the department is attached
to budgets and lists them before the admin confirms. Deletion is still refused while people,
expense reports, appointment invitations or password entries point at the department.

### Budget vs. actuals calculation
The dashboard (`app/(app)/page.tsx`) reads the edition's `Budget` rows: each row's planned side is
the sum of its budget lines, and its actual side is the sum of the journal entries booked against
it. The difference is the remaining (or overspent) budget.

---

## 3. Journal Entries

The journal is the core accounting ledger. Every financial movement is recorded as a journal entry.

### Entry fields
- **Date**, **Description**, **Debit** or **Credit** amount
- **Budget** (optional) — which budget the movement is booked against; an entry no longer carries a
  department
- **MoneyAccount** — which bank/cash account is involved
- **CostCenter** (optional) — for sub-categorisation

### Sequence numbers
Each entry gets an auto-incrementing `sequenceNumber` within the edition. This provides an audit-friendly ordered log.

### Locked entries
Entries with `isOpeningEntry = true` were imported from a previous edition's closing balance. They cannot be edited or deleted — they are permanent anchor points for the ledger.

Entries with a `cashRegisterId` were written by a cash-register closing (§12). They
are **half locked**, on all three writing paths:

- **They cannot be deleted.** `CashRegister.journaledAt` stays set and there is no
  un-book action, so deleting one leg would leave `/cash` reading **Booked** over a
  ledger short a movement — and re-booking is refused. Refusing beats clearing
  `journaledAt`, which would leave the other two legs in place to be doubled.
- **Their amount, direction (`accountType`) and money account cannot be changed** —
  those three are the identity §12 asserts, that the net effect on the cash account
  is exactly counted − float.
- **Everything else is fair game**: label, date, budget and cost centre change no
  money. `cashRegisterId` is on the row precisely so "where did this line come from?"
  survives a re-worded label.

### Editing entries
Three paths write an existing entry, and they share the same seven fields — date,
budget, type, amount, label, money account, cost centre:

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
The journal page reads `?fromExpenseReport=<id>` from the URL. If present, the add-entry modal is pre-filled with the expense report's title, amount, and date. The budget is prefilled only when the submitter's department is attached to exactly one budget in the edition (`resolveDefaultBudgetForDepartment()` in `app/lib/budgets.ts`); attached to two, the picker is left empty and required, because guessing would book real money into the wrong envelope.

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

### The two things it is made of
- A **stock** is a place things sit in: a cellar, a container, a van.
- An **entry** is one [article](#11-articles), in one stock, at one expiry date, counted **in
  pieces**. Six bottles read as `6 x 1.5 l = 9 l`, which is why the two numbers are never mixed: the
  count is what you change, the total is what you have.

The article — a name, a brand, the barcode, the size of one piece, whether it expires — is the
[articles app](#11-articles)'s to define. Stock only points at it.

Two entries of the same article in the same stock exist precisely when their expiry dates differ.
Adding stock with a date that is already on the shelf tops that entry up instead of making a second
one; an article that does not expire never shows a date field at all.

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

The same button sits next to the barcode field in the [articles app](#11-articles)'s own dialog,
which is where a code is filed on an article that already exists. A barcode belongs to exactly one
article — the second article to claim one is refused by name, before the write.

### The conversion table
Admins keep a table of "one `from` is `factor` `to`" on `/stock/settings` — one row per *direction*,
so ml → l and l → ml are two rows and an admin who only ever reads bottles in litres keeps the
first. The metric pairs among the seven units the app ships with (ml/l and g/kg, both ways) are
already there; the rest is theirs to add, correct and delete.

What it is for: a scan hands back a bottle as **1500 ml** when every shelf in the building calls it
**1.5 l**. Correcting that by hand means retyping the number *and* changing the unit, in that order,
without slipping a zero — so wherever an article is written (the articles dialog, and the "new item"
half of the new-entry dialog) a convert button sits beside the unit. It lists what this unit can
become and the number each choice would leave behind, and picking one rewrites both fields at once.

The table never converts anything on its own. It fills in a field a person is looking at, *before*
they save — nothing on a shelf moves when a factor is corrected, and an article saved last week
keeps the numbers it was saved with.

### Moving stock between places
The swap-icon button on a row moves some or all of it to another stock: pick how many pieces, then
the destination. It merges by the [same rule](#the-two-things-it-is-made-of) as adding stock —
same article, same expiry date at the destination and the quantities add up; a different date starts
a new entry there. Moving more than an entry holds is refused with a sentence rather than clamped,
the way + / - clamp: inventing pieces at the destination is not the same mistake as a miscount.

The move logs as two ordinary movements — an **Out** at the source and an **In** at the destination
— `StockMovement.isIn` still has exactly two values, there is no third kind for a transfer. Moving an
entire entry deletes the now-empty source row exactly as taking it out of stock does; both movements
survive and still name the article and its expiry date, because a movement outlives the entry it
changed.

### Everything that moves a quantity is logged
Four gestures, one log:
- **+ / -** go straight to the server, one movement per click.
- **The edit button** unlocks the whole entry instead — the count *and* the expiry date. The +/-
  buttons then move the number being typed, and locking it again saves the correction as a
  **single** movement, which is what a recount is.
- **New entry** and **take out of stock** are a movement each, in and out.
- **Moving stock between places** is two movements, an Out and an In — see above.
- **A point-of-sale sale** is an Out per sold line, when the session behind it names this stock —
  see [A sale moves stock](#a-sale-moves-stock). `/stock/history` showing removals nobody typed is
  that, working as intended.

A date is not a quantity and logs nothing on its own. The exception is the one that matters: a shelf
is an article *at a date*, so typing a date the shelf already carries makes the two lots one — that
is a real move, both legs are logged, and the emptied row goes.

Taking out more than is on the shelf lands on zero and logs what actually left: a miscount is not
worth blocking on. A movement outlives the entry it changed, so taking something out of a stock does
not erase how it got there. `/stock/history` is the log, newest first, filtered by article, stock or
direction.

### Who can do what
Any signed-in user counts, adds and takes out — and can still invent an [article](#11-articles) from
inside the "New entry" dialog, because the person in front of an unfamiliar delivery is the one who
can name it (that scan-to-create always leaves the article counted in stock). **Admins only**:
everything on `/stock/settings` — the stocks themselves, the units, and the conversions between
them. Keeping the catalogue itself tidy — and deleting an article — is the [articles
app](#11-articles)'s job, and that app is admin-only.

### Deleting a stock never orphans anything
An empty stock is deleted outright. A stock with contents asks where they go first, and each entry
lands in the destination — merged into the entry with the same article and expiry date if there is
one. The one case with no answer is the last stock still holding something: there is nowhere to move
it, so the delete is refused until another stock exists. Deleting a stock also takes its own movement
history with it — there is no place left for those movements to describe.

## 11. Articles

The catalogue of everything the festival can **stock or sell**, at `/articles`. Like stock it is
**global** — an article does not disappear when an edition closes — but unlike stock the app is
**admin-only**: keeping the catalogue tidy is configuration, not day-to-day work.

An **article** is a name, an optional brand, the barcode printed on it when it has one, the size of
*one piece* (a 1.5 l bottle is unit `l`, one piece = 1.5), and two switches:

- **Expires** — whether a piece carries an expiry date. Off hides the date field everywhere it is
  drawn. Turning it off is refused while any dated entry of the article sits in a stock.
- **Counted in stock** (`StockElement.tracksStock`) — whether pieces of it are counted on a shelf.
  On for almost everything. Off means the article exists only to be **sold**: a poured glass of beer
  is rung up by a till and never stocked, while the barrel behind it is both. An untracked article
  is hidden from every stock screen — it never appears in the "add stock" picker, and the articles
  list shows "Not stocked" where a piece count would be — but a point-of-sale template can still put
  it on the grid. Turning it off is refused while any pieces of the article exist in a stock.

The unit can be swapped for one it converts to with the same convert button the stock dialogs use;
see [the conversion table](#the-conversion-table). A barcode belongs to exactly one article, checked
by name before the write.

Creating, editing and deleting an article all happen here, through the header button and its dialog,
and all require an admin. An article can only be deleted once it sits in no stock. The one way a
non-admin adds an article is the scan-to-create path inside the stock app's "New entry" dialog —
that is stock content, not configuration, and it always produces an article that is counted in
stock.

The model is still `StockElement` in the database and in every relation; "article" is only the word
the UI uses.

## 12. Cash Manager

A till at a bar, at `/cash`. A **cash register** is opened against a `MoneyAccount` whose type is
`CASH`, inside one edition, by counting a **float** into it — coin by coin, note by note — and
closed later by counting what is left. Both ends are a sheet of the twelve Swiss denominations
(CHF 0.05 to CHF 200; there is no 1000 note in this app). Amounts are integer rappen in code and a
`Decimal` only at the database edge — francs are never added as floats.

### Who can do what

Opening and closing a register is for whoever may already touch money accounts: an **admin**, or a
member of the **accounting department** for an edition they belong to (`canManageMoneyAccounts`). No
new role. The `/cash` link shows for exactly those people **and the page itself refuses everyone
else** — `requireMoneyAccountManager()` is the first line of it, because the screen carries every
register's counts. A closed edition hides the "Open a register" button and makes both actions
refuse.

The budgets and cost-centre codes the booking modal needs are read only when the reader is an
**admin**: a cash manager who cannot book has no use for them and is not sent them.

### Opening

Pick a cash account in the edition, name the till, count the float. The name is not unique — two
bars both called "Bar 1", on two nights or in two editions, are two registers and the app does not
argue. A float that totals zero is refused: there is nothing to open a till on. Counts must be whole
numbers. Only the denominations actually counted are stored — a zero row and a missing row mean the
same thing.

### Closing

Count what came back. The person counting sees the register's name and its float, but **not** a
computed "expected" amount — a number to match is a number they will match. A closing count that
totals zero is allowed (a till can genuinely come back empty) but, because a blank sheet and an
empty till look identical, an empty sheet needs an explicit "the register came back empty"
confirmation. Closing is **not** idempotent: a register can only be closed once, and a second count
is refused rather than silently replacing the first.

### Counting is not booking

Closing a register writes **nothing to the journal**. A `CashRegister` carries only its two count
sheets; a till counted tonight may be booked next week. The journal entries a closed till produces
are written later, by an admin — see **Booking a register** below.

### Booking a register

The last step of a till's life. An **admin** (not the accounting department — this writes to the
journal, and the journal is admin territory everywhere else) opens a closed, not-yet-booked
register, checks three numbers, picks a budget, and presses **Book to the journal**. Booking needs a
**writable edition** and happens **exactly once** — a second press is refused so the ledger is never
doubled. Every point-of-sale session on the register must be **closed** first; a running session
means the cash figure is not yet final.

Five figures, all integer rappen, all from `registerFigures()` in `app/lib/cash-register.ts` so the
screen that shows them and the action that books them cannot disagree:

| Figure | How it is derived |
|---|---|
| **Float** | `countTotal` of the OPENING count sheet — what went into the drawer |
| **Taken in cash** | Σ `total` of every **CASH** `PosSale` in every session on this register. The sale *total*, not `cashGiven` minus `changeDue` — same number, fewer chances to be wrong. A negative-total sale (a deposit handed back) correctly subtracts |
| **Expected** | float + taken in cash — what the drawer should hold |
| **Counted** | `countTotal` of the CLOSING count sheet — what was actually counted back |
| **Difference** | expected − counted — **positive means the till came back short**, negative means it came back over |

Three journal entries, all on the register's cash `MoneyAccount`, all dated its `closedAt` unless
the admin picks another date, all tagged with `cashRegisterId` so "where did this line come from?"
survives a re-worded label:

| # | Direction | Amount | Stored label (English, always) |
|---|---|---|---|
| 1 | `CHARGES` | float | `Register float — <name>` |
| 2 | `PRODUITS` (or `CHARGES` if expected is negative) | \|expected\| | `Register returned — <name>` |
| 3 | `CHARGES` if short, `PRODUITS` if over | \|difference\| | `User correction — <name>` |

**Any entry whose amount is zero is skipped** — a correction of nothing is noise, and a till that
opened on a zero float could not have opened at all, but a refund-only bar that ends `expected` at
zero is real. Amounts are always positive in `JournalEntry`; the direction is `accountType`.

The **net effect on the cash account is exactly `counted − float`**: what was counted back, less
what went in. The three entries carry consecutive `sequenceNumber`s allocated under the same
per-edition advisory lock `createJournalEntryAction` uses.

The modal shows all five figures (the difference in red when it is non-zero) and a preview of the
exact entries before anything is written — a one-press irreversible write shows what it is about to
do. Once booked, the register's row shows a **Booked** badge and the date and person instead of the
button.

**The three entries are then half locked in the journal** (§3, "Locked entries"): they cannot be
deleted, and their amount, direction and money account cannot be edited, because `journaledAt`
stays set and there is no un-book action. Their label, date, budget and cost centre stay editable.

## 13. Point of Sale

The till a bar actually sells from. This section grows with the point-of-sale chain; the first
piece is the **template** — the saved layout a bar opens on for the night.

### Templates

A **template** is a saved till layout, at `/pos/templates`. It is **per edition** and
**admin-only**: composing the grid of what a bar sells, and at what price, is configuration.

The grid is a **paginated 3×3**. Eight of the nine tiles on a page are article slots; the
**bottom-right tile of every page is always "Custom sale"** and is drawn by the renderer, never
stored — same tile, same place, every page, so a bar hits it without looking. A cell's `position`
is a 0-based slot index across the whole template: `page = Math.floor(position / 8)`,
`slot = position % 8`. The `8` is `POS_PAGE_SLOTS` in `app/lib/cash.ts`; nothing hardcodes it.

Each article slot carries three things:

- the **article** it points at (`StockElement`) — every article is offered, including ones with
  `tracksStock` off, because that flag is exactly what makes a poured glass sellable. The picker
  **searches the catalogue by name** instead of listing it: a `<Suggest>` over every article, the
  brand as each row's hint, submitting the article's **id** so two articles reading the same name
  stay distinguishable. Typing past a picked row unpicks it and disables Save — the article is a
  closed list, so a half-typed name must not save the article picked before it;
- a **label**, snapshotted from the article's name when the tile is made and then free text — a bar
  tile says "Beer 3dl", not "Feldschlösschen Original 30cl", and renaming the article later does not
  rewrite the tile;
- a **price**, which lives on the cell and **not** on the article. The same beer is CHF 4 at one
  bar and CHF 5 at another on the same night. A **negative price is legal and meaningful** — a
  bottle deposit handed back is a tile that takes money out of the till — so nothing validates a
  price for positivity.

A page **may have holes**. Removing a tile frees its slot and leaves the others where they are —
muscle memory beats compaction, so there is no drag-to-reorder and no auto-fill. The page count of
a template comes from the highest slot in use, not the tile count: eight tiles with a hole can
still span two pages. Adding a page is just paging right into an empty one — there is no "add page"
button and no page record.

An article a template sells **cannot be deleted** until it is taken off every template
(`PosTemplateCell.elementId` is `Restrict`); the articles app says so in a sentence. A closed
edition hides the create button and every template write is refused. A template a **session** has
used cannot be deleted either — the same sentence, checked before the constraint can throw.

### Sessions

A **session** (`/pos`, the `PosSession` model) is one stretch of selling: **one template**, a
**fixed set of accepted payment methods**, and — only when cash is one of them — **one open cash
register** behind the drawer. Several sessions run at once (two bars, two tills) and **several
phones share one session** — the session is the till, not the device, so which session a person is
selling in is remembered on `User.selectedPosSessionId`, the same "asked once, then remembered"
idea as the selected stock place.

**Any signed-in user may open, join, pause, resume and close a session, and may sell.** That is the
bar staff; the money they touch is already fenced by a register that someone with the money-account
role had to open first. Templates stay admin-only and registers stay behind `canManageMoneyAccounts`.
Every session write that touches edition data goes through `resolveWritableEditionId()` — a closed
edition sells nothing. **Leaving is the one exception**: it writes only the seller's own
`selectedPosSessionId`, which is not edition data, and gating it would strand every seller in their
session the moment the edition closed.

- **Opening** needs a name, a template **with at least one tile**, and at least one payment method.
  Tick cash and a register field appears: it must be an **open** register in the edition. Untick
  cash and any register is dropped — a session that takes no cash stores no drawer. Opening a
  session joins it.
- **A stock place is optional.** Name one and every tracked article the session sells comes off
  that shelf (see [A sale moves stock](#a-sale-moves-stock) below); leave it empty — the default,
  and what every session did before this existed — and the session moves no stock at all.
- **The payment methods and the stock place are fixed at open.** There is no editing them
  afterwards; open another session instead. Moving a running session to another shelf would make
  its earlier sales lie about where the stock came from.
- **Leaving** puts one person back at the picker and touches nothing else — the session keeps
  running for everyone else in it. The button is in the sessions dialog, on the row of the session
  you are standing in; without it the only way out would be someone else closing your till.
- **Pausing** stops selling — the till refuses a sale — without ending the session. Resuming lifts
  it.
- **Closing is terminal.** It sets `closedAt`, drops **every** phone that was in the session back to
  the picker, and cannot be undone — a reopened session would muddy the takings. **Closing writes
  nothing to the journal.** What the session took in cash is read later, when the *cash register*
  is closed (that is the register-close flow's job); a session is not a booking event. The
  confirmation says so.
- A register **cannot be closed** while an `OPEN` or `PAUSED` session is still on it — closing the
  drawer under a running till is how money goes missing.

### Selling

The till is the joined session's screen: a big running total, the template's grid, a pager when the
template has more than one page, a **column picker**, and **List** / **Checkout**. The ninth tile of
every page is **Custom sale** — a label and an amount, negatives allowed, no article behind it.

**Columns are a device setting, not a template or session one.** A page is always the template's
eight slots plus Custom sale; the picker (2 to 6, default 3) only says how wide to lay those nine
tiles out, and it never moves a tile to another page. The choice is kept in that browser's
`localStorage` (`pos:columns`, read through a `useSyncExternalStore` in
`app/app/(app)/pos/till-columns.ts`), so a phone in the crowd can sell at 3 while an iPad on the
counter sells the **same session** at 6, and neither sees the other's choice. The template editor
stays a 3×3 — it is authoring the pages, not the density.

**The cart lives in the browser and nowhere else** until checkout succeeds. A refresh loses an
unfinished sale, and that is correct — an unfinished sale is not a sale. The **List** dialog edits
the cart (per-line +/−/bin, or clear the whole sale); the grid itself only ever adds.

At **checkout** the seller picks one of the session's payment methods:

- **Non-cash** (Twint, bank) records that the money arrived that way and nothing else — no terminal
  integration.
- **Cash** asks what the customer put down and shows, live, the **change**: the amount and then the
  coins and notes to hand back, **greedy over the twelve Swiss denominations** (`makeChange()` in
  `app/lib/cash.ts`). The Swiss set is a 1-2-5 series so greedy is optimal. The sheet is **advice,
  not a drawer count** — nothing in the app tracks what is physically in the till, so the seller
  adjusts.

Every sale is one `PosSale` written as it happens, with its lines (`PosSaleLine` — label and unit
price **snapshotted**, so history still reads after the template is re-priced; `elementId` null for
a custom sale) and, cash only, its `PosSaleChange` sheet. **The client's arithmetic is never
trusted**: the server re-reads every line, recomputes the total in integer rappen, and refuses a
cash sale where less than the total was given. `total`, `cashGiven` and `changeDue` may all be
negative or zero — an all-refund sale is money going *out* of the drawer, recorded like any other.

What the server recomputes is the **total**, not the **unit prices** it recomputes it from: a line's
`unitPrice` comes from the client and is never checked against the template cell. That is deliberate.
The custom-sale tile takes an arbitrary label and an arbitrary amount, so checking the tiles would
change nothing about what a seller can ring up, and the till is operated by trusted staff. What a
sale is *for* is the snapshot it stores, not a price list it can be audited against.

### A sale moves stock

A session that names a **stock place** takes what it sells off that shelf. While the place is set,
every sale writes ordinary `StockMovement`s — one **Out** per line whose article is
[counted in stock](#11-articles), through the same `applyMovement()` every other stock screen goes
through, so `/stock/history` reads a POS sale exactly like a hand-typed removal (with the seller's
name on it). A session with **no** stock place moves nothing, which is what every session did before
this existed.

- **Oldest expiry first.** A line for three of something draws the earliest-dated shelf row down
  first and dips into the next when it empties — two rows, two movements. Undated rows go last: a
  row with a date on it is the one to sell before it turns.
- **A custom sale moves nothing** — there is no article behind it.
- **An untracked article moves nothing** — a poured glass of beer is sold and never shelved; that
  is the whole point of the `tracksStock` flag.
- **A short shelf never refuses a sale, and the shortfall goes negative.** The dated rows are
  drained first; whatever is still owed lands on the element's **undated** row for that place —
  created below zero when there is none — as an ordinary Out. So selling five with two on the shelf
  leaves the dated row at 0 and an undated row at −3, and `/stock/history` reads both legs like any
  other removal. A till that stopped selling because a delivery was never filed is worse than a
  count that is wrong, and the beer left the building either way: **a negative count is not stock,
  it is the app saying somebody miscounted or a delivery is missing**, and it stays until a person
  fixes it. The stock screen draws a negative count in rose for exactly that reason. The debt is
  undated because pieces that do not exist cannot turn, and because a delivery filed later carries
  its own date — the two rows net out without the shortfall quietly disappearing.
- **Counting still clamps.** Only the till writes below zero. The +/− buttons and a recount are
  somebody looking at a shelf, and a shelf cannot hold less than nothing, so they stop at 0 as they
  always have (`applyMovement`'s `allowNegative`, which only `removeFromPlace` passes).

The movements are written **inside the same transaction as the sale**, so a genuine database
failure rolls the whole sale back, but nothing about stock can *refuse* a sale that the money side
accepted.

### History

Two read-only, **admin-only** screens sit under the till, reached from a "Session history" link
in the `/pos` and `/pos/templates` headers (no fourth sidebar entry — `/pos` is the app).

- **`/pos/sessions`** lists every session in the edition, closed ones included, newest first: its
  template, its register, who opened it and when, its status, its sale count, and what it took
  split **cash / Twint / bank** plus a total. A method the session accepts but never used shows
  `CHF 0.00`, not a blank — "Twint took nothing tonight" is an answer. A method the session does
  not accept shows `—`. A footer row sums every column across the sessions shown; that row is the
  reason the screen exists.
- **`/pos/sessions/[sessionId]`** shows one session's transactions in order — time, seller,
  payment method, total — each opening to its lines and, for a cash sale, the amount given, the
  change due and the change sheet coin for coin. A summary band above the list gives the total
  taken, the sale count, the change handed back, and one figure per accepted method.

Every roll-up on both screens is the same helper (`app/lib/pos.ts`), summing in **integer
rappen** — every accepted method present, the total free to go negative, the change total taken
from `changeDue` across the cash sales.

**Labels and prices are the snapshots the sale was rung up on.** Re-pricing the template
afterwards does not touch recorded history, and deleting an article leaves its sold lines intact
(the line's `elementId` goes null; the label and price it was sold under stay). The screens never
"correct" a line by looking the article up again.

**Nothing here books anything.** A session's takings reach the journal only when the *cash
register* behind it is closed — that is the register-close flow's job, not this one's.
