# Baleinev Backoffice — Application Summary

## Purpose

Baleinev Backoffice ("Baleicomptes") is an internal web application for running the finances and
staffing of the Baleinev festival, one **edition** (yearly event) at a time.

It replaces a shared Excel workbook. The original spreadsheet is still in the repository under
[soa/](../soa/), together with a Python analysis of its structure
([soa/workbook_analysis_summary.md](../soa/workbook_analysis_summary.md)). The workbook was built
around a master `JOURNAL` ledger sheet, a `RESULTATS` consolidation sheet, and one sheet per
department mixing a hand-typed budget with formulas pulling from the ledger. The application keeps
that mental model — journal, budget, departments, cost centers — but adds multi-user access,
role separation, an approval workflow for expense claims, Swiss QR invoice generation, and
scheduling.

Everything is scoped to an **edition each user picks for themselves**. Pages call
`resolveEditionIdOrNull()` and write paths call `resolveWritableEditionId()`
([app/lib/edition-context.ts](../app/lib/edition-context.ts)), both of which read
`User.selectedEditionId`; writes refuse to run when the user has no edition, or when that edition is
closed. Two people can work in two different editions at once.

## Who uses it

Two roles, stored on `User.role`:

- **ADMIN** — the festival's finance/committee team. Full access: journal, budget, invoices,
  money accounts, cost centers, editions, users, document templates. Approves or rejects expense
  claims and records them in the ledger.
- **DEPARTMENT** — a department lead (bar, technical, programming, …). Sees only the budget of the
  departments they are attached to, submits expense claims, signs up for event shifts, and manages
  their own todos and calendar. Their navigation is restricted to tasks, calendar, budget,
  expense reports, events, passwords and the address book — except members of the "Comptabilité"
  department, who also get money accounts.

A user belongs to `Department` records directly (a many-to-many). Departments are
edition-independent, so a membership survives an edition change; what is per-edition is the
`Budget` — a named envelope a department may be *attached* to, to see it. Budgets and departments
are independent: any department may be attached to any budget from `/budget`, and a department is
just a name (admins manage the list at `/departments`).

## Core domain

| Concept | What it is |
| --- | --- |
| `Edition` | One festival year. Owns everything else. Users select one each; the one flagged `isDefault` seeds accounts that have none. Carries the per-km driving reimbursement rate. |
| `Department` | A team of the association — global, not per edition. Carries a name and an optional abbreviation. |
| `Budget` | A named envelope of money inside one edition; holds the budget lines and the journal entries booked against it. Attached to zero or more departments (visibility only); no attachment means admin-only. |
| `MoneyAccount` | A bank, cash, or other account, with opening balance and (bank only) beneficiary/IBAN details. Managed by admins and the "Comptabilité" department. |
| `CostCenter` | An analytic code used to group spending across departments. |
| `BudgetLine` | A planned income or expense line inside a budget, typed `CHARGES` or `PRODUITS`. |
| `JournalEntry` | An actual accounting movement: date, amount, label, counterparty, money account, budget (optional), cost center, and a per-edition sequence number. Opening entries are locked. |
| `Invoice` | An outgoing invoice with a Swiss QR-bill payload, renderable to PDF. Can be linked 1:1 to the `PRODUITS` journal entry that settles it. |
| `ExpenseReport` | A reimbursement claim (standard, with a receipt file; or driving, computed from kilometers × rate). Flows `PENDING → APPROVED / REJECTED`. |
| `DocumentTemplate` | Admin-authored HTML used to render invoice PDFs, with `[[placeholder]]` substitution. |
| `Address` / `AddressBankAccount` / `AddressType` | The address book: everyone the festival writes to, invoices or pays, with the IBANs each of them bills from and the contact type each is filed under. Global, not edition-scoped — a supplier outlives an edition. |
| `City` | Postal code ↔ locality pairs, seeded with the Swiss list. A *proposal* table only: an address keeps whatever was typed, and every saved pair is filed back into it. |
| `Event` / `EventDay` / `EventShift` / `StaffAssignment` | Staffing: an event spans days, each day has shifts with a capacity, users sign up or are assigned. |
| `Appointment` | A calendar meeting, inviting individual users, whole departments, or everyone. |
| `Todo` / `Task` | `Task` is the unified inbox item. Some are created automatically by workflows; `GENERAL` tasks are user-authored and may hang off a `Todo`. |

## Key business processes

**Expense claim → ledger.** A user submits an `ExpenseReport`
([app/app/(app)/expense-reports/actions.ts](../app/app/(app)/expense-reports/actions.ts)) against a
department that must belong to their selected edition and (for non-admins) to one of their own. A
standard claim requires a proof file — validated for size and type by magic-byte sniffing
([app/lib/proof-upload.ts](../app/lib/proof-upload.ts)) and stored as bytes directly in the
`ExpenseReport.proofData` column, then served back only to the submitter or an admin as a sandboxed
attachment; a driving claim requires departure/arrival/kilometers and derives the amount from the
edition's `drivingRatePerKm`. Submission creates a `REVIEW_EXPENSE_REPORT` task assigned to the
ADMIN role. On approval, that task is resolved and a follow-up `RECORD_JOURNAL` task is created.
When an admin then creates the journal entry with `?fromExpenseReport=<id>`, the follow-up task is
resolved. Rejection stores a reason and resolves only the review task.

**Invoicing.** The invoice form builds a Swiss QR-bill payload client-side
([app/lib/swiss-qr.ts](../app/lib/swiss-qr.ts)), posts it to
[app/app/api/invoices/route.ts](../app/app/api/invoices/route.ts), and the PDF is produced
server-side by Puppeteer rendering the selected `DocumentTemplate` HTML
([app/app/api/invoices/[invoiceId]/pdf/route.ts](../app/app/api/invoices/%5BinvoiceId%5D/pdf/route.ts)).
The QR code image is generated as an SVG with the Swiss cross overlay
([app/lib/swiss-qr-image.ts](../app/lib/swiss-qr-image.ts)). Marking an invoice `PAID` requires
linking it to a non-opening `PRODUITS` journal entry in the same edition; paid invoices cannot be
edited or deleted until set back to unpaid.

**The address book.** `/addresses` is open to every signed-in user — view, add, edit — with deleting
and the contact-type list (`/addresses/settings`) gated to admins
([app/app/(app)/addresses/actions.ts](../app/app/(app)/addresses/actions.ts)). Every row can be
filed under a contact type — sponsor, supplier, partner, artist, staff — and blank stays a real
answer. Opening a row reads it; the pencil is what turns the card into the form.
The invoice builder reads it: "Use an address" fills the recipient block from a saved row, and "New
address" opens the same create dialog inline, so an unknown supplier is filed and selected without
leaving the half-written invoice. In every address field a postal code proposes its localities and a
locality proposes its codes, without either being binding.

**Staffing.** Admins define event types (on `/events/settings`), events, days (which can be toggled
"off"), and shifts with a capacity. Users sign up for a shift, which creates a `StaffAssignment` and a `STAFF_SHIFT` task;
withdrawing removes both. Admins can assign users directly. A shift is edited in place — the pencil
turns the row's labels into the same four fields the add row uses (`updateShiftAction`), so hours, a
description or a capacity can be corrected without deleting the shift and losing everyone on it. The
capacity cannot drop under the people already assigned, and because a `STAFF_SHIFT` task quotes the
shift's hours in its title and due date, moving a shift rewrites the pending tasks that point at it.

**Department access requests.** A user asks to join a department from the Department access card on
[app/app/(app)/account/client.tsx](../app/app/(app)/account/client.tsx). That files one
`DEPARTMENT_ACCESS_REQUEST` task assigned to the ADMIN *role*, so every admin sees it and the first
one to mark it done clears it for all of them. The task is a request and nothing more: resolving it
grants no membership — an admin still assigns the department by hand in `/users`. The card shows the
user's own unanswered requests as "Waiting" and drops those departments from the picker, so one
request stands at a time per department.

**Edition lifecycle.** Admins create editions, mark one as the default that new accounts start in,
set the driving rate, and close or reopen an edition (`closeEditionAction` / `reopenEditionAction`).
A **closed edition is read-only**: still selectable, browsable, exportable and printable, but every
write is refused. Closing only stamps `closedAt` — it creates no successor — and it moves the
default off the closed edition, onto the newest open one, so new accounts never start in a frozen
year.
Creating an edition can optionally **bring data over** from an existing one
([app/lib/edition-carry-over.ts](../app/lib/edition-carry-over.ts)): departments with their budget
lines, cost centers and money accounts, plus each account's closing balance as a locked opening
entry. Each user switches their own edition from the sidebar picker
(`POST /api/preferences/edition`); changing the default moves nobody.

## Architecture

```
baleinev-backoffice/
├── app/                 Next.js 16 application (App Router, React 19)
│   ├── app/(app)/       Authenticated pages; each has page.tsx + actions.ts (server actions)
│   ├── app/(auth)/      Login page
│   ├── app/api/         Route handlers: auth, invoices, PDF, expense proof, QR, preferences
│   ├── components/      Shared client components (app shell, tables, modals)
│   ├── lib/             auth, access control, prisma client, i18n, QR, templates, tasks
│   ├── prisma/          schema.prisma + migrations/ + seed.ts (first admin from env)
│   ├── scripts/         One-off importers from the legacy Excel workbook
│   ├── docker-compose.yml  PostgreSQL (compose project `blv`, 127.0.0.1:5434)
│   └── proxy.ts         Next.js 16 middleware (route gating by role)
├── soa/                 Legacy Excel workbook + Python analysis + QR bill reference material
└── assets/              Logo, Bebas Kai font for QR bills
```

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind.
- **Data:** PostgreSQL via Prisma, in a container defined by `app/docker-compose.yml` (compose
  project `blv`, published on `127.0.0.1:5434`). Schema history lives in `app/prisma/migrations/`,
  baselined at `0_init` from the schema that years of `prisma db push` produced; deployments run
  `prisma migrate deploy`.
- **Auth:** NextAuth v4, credentials provider, JWT session strategy, bcrypt password hashes.
  Role and department-role ids are copied into the JWT.
- **Authorization:** two layers. `proxy.ts` blocks DEPARTMENT users from admin routes at the edge;
  `requireAdmin()` / `getCurrentUserAccess()` in [app/lib/access.ts](../app/lib/access.ts) re-read
  the user from the database on every server action and API route, so a stale JWT cannot grant
  admin rights.
- **Mutations:** almost everything is a `"use server"` server action posting a `FormData`. The
  exceptions are invoices, PDF rendering, proof download, QR rendering, and the edition/language
  preferences, which are REST route handlers.
- **Error handling:** every server action takes `(prevState: ActionState, formData)` and returns
  `{ error: string | null, saved?: boolean }` instead of throwing for expected validation/permission
  failures (`saved` is for forms whose success has nothing else to show — see
  `app/lib/server-action-helpers.ts`). Forms consume this via React's `useActionState` and render
  the message inline through `<FormError>` (`app/components/form-error.tsx`). `app/app/error.tsx`,
  `global-error.tsx`, and `not-found.tsx` are the fallback boundaries for anything unexpected that
  still throws.
- **PDF:** Puppeteer launched per request, `page.setContent(html)` then `page.pdf()`.
- **i18n:** English and French dictionaries in
  [app/lib/i18n-dictionaries.ts](../app/lib/i18n-dictionaries.ts), locale held in a cookie.

## Running it

Per the [README](../README.md), everything runs from `app/`: `cp .env.example .env` and fill it in
(`POSTGRES_*`, `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_*`, `PASSWORD_VAULT_KEY`), then
`docker compose up -d db`, `npm install`, `npm run db:deploy`, `npm run db:generate`,
`npm run db:seed`, `npm run dev`. One `.env` feeds both the app and the container. The seed upserts
a single admin from the env vars; every other user is created from the Users page.
