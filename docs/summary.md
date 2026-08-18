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
  expense reports, and events.

A `DepartmentRole` links a user to a department *by name*, so the link survives across editions
(departments themselves are per-edition rows). `syncDepartmentRolesFromDepartments()` in
[app/lib/department-roles.ts](../app/lib/department-roles.ts) keeps the two in sync.

## Core domain

| Concept | What it is |
| --- | --- |
| `Edition` | One festival year. Owns everything else. Users select one each; the one flagged `isDefault` seeds accounts that have none. Carries the per-km driving reimbursement rate. |
| `Department` | A team within an edition (unique per edition by name). |
| `MoneyAccount` | A bank account or cash box, with opening balance and beneficiary/IBAN details. |
| `CostCenter` | An analytic code used to group spending across departments. |
| `BudgetLine` | A planned income or expense line attached to a department, typed `CHARGES` or `PRODUITS`. |
| `JournalEntry` | An actual accounting movement: date, amount, label, counterparty, money account, department, cost center, and a per-edition sequence number. Opening entries are locked. |
| `Invoice` | An outgoing invoice with a Swiss QR-bill payload, renderable to PDF. Can be linked 1:1 to the `PRODUITS` journal entry that settles it. |
| `ExpenseReport` | A reimbursement claim (standard, with a receipt file; or driving, computed from kilometers × rate). Flows `PENDING → APPROVED / REJECTED`. |
| `DocumentTemplate` | Admin-authored HTML used to render invoice PDFs, with `[[placeholder]]` substitution. |
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

**Staffing.** Admins define event types, events, days (which can be toggled "off"), and shifts with
a capacity. Users sign up for a shift, which creates a `StaffAssignment` and a `STAFF_SHIFT` task;
withdrawing removes both. Admins can assign users directly.

**Edition lifecycle.** Admins create editions, mark one as the default that new accounts start in,
set the driving rate, and close an edition (`closeEditionAction`), which carries balances forward as
locked opening entries. A **closed edition is read-only**: still selectable, browsable, exportable
and printable, but every write is refused. Each user switches their own edition from the sidebar picker
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
  exceptions are invoices, PDF rendering, proof download, QR rendering, and language/refund
  preferences, which are REST route handlers.
- **Error handling:** every server action takes `(prevState: ActionState, formData)` and returns
  `{ error: string | null }` instead of throwing for expected validation/permission failures (see
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
