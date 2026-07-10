# Baleinev Backoffice — Issues

Findings from a read-through of the codebase, grouped by category and ordered roughly by severity
within each group. Each item points at the code it concerns. Items marked **(verify)** are strong
suspicions that should be confirmed by running the relevant flow before acting.

---

## Security issues

### S1. Any authenticated user can download any expense-report proof file (IDOR) — high — **FIXED**
[app/app/api/expense-reports/[expenseReportId]/proof/route.ts](../app/app/api/expense-reports/%5BexpenseReportId%5D/proof/route.ts)
called `getCurrentUserAccess()` (authentication only) and then looked up the report **by id with no
ownership or department check**. Any DEPARTMENT user could enumerate ids and fetch every uploaded
receipt.

The route now serves a proof only to an ADMIN or to the report's own `submittedById`, answering
`404` (not `403`) otherwise so ids cannot be enumerated. The expense-reports **page** had the same
leak — it listed every report with proof links to every user — and is now scoped to the submitter's
own reports for non-admins, with the department picker limited to the user's own departments.

### S2. Uploaded proof files are served inline with a client-controlled content type (stored XSS) — high — **FIXED**
The proof's `proofMimeType` and `proofFilename` were taken straight from the uploaded `File`, and the
route returned the bytes with that mime and `Content-Disposition: inline`, so an HTML file declared
as `text/html` executed JavaScript in the app's origin.

Now the stored mime type is derived by sniffing the file's magic bytes
([lib/proof-upload.ts](../app/lib/proof-upload.ts)), the route serves proofs with
`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, a sandboxing CSP, and a
content type re-validated against the allow-list. The filename is sanitized (directory separators,
control characters and quotes stripped) and emitted with both an ASCII `filename` and an RFC 5987
`filename*`, so it can no longer break the header.

### S3. No validation of proof upload type or size — medium — **FIXED**
Any file, any size, was read fully into memory and stored as bytes. `validateProofUpload()` in
[lib/proof-upload.ts](../app/lib/proof-upload.ts) now enforces a 10 MB cap and accepts only PDF /
JPEG / PNG / WebP / HEIC (verified by magic bytes, not the declared type). The upload form also sets
an `accept` filter as a first, non-authoritative hint.

### S4. Role-gating middleware may not be registered, and does not enforce authentication — medium **(verify)**
[app/proxy.ts](../app/proxy.ts) contains the route-gating logic, but Next.js middleware
conventionally lives in `middleware.ts`. Confirm this file is actually wired up as middleware in
this Next.js 16 setup; if it is not, DEPARTMENT users are gated only by page-level checks. Separately,
even when it runs, the handler returns `NextResponse.next()` when there is **no** token
([lines 27-29](../app/proxy.ts#L27-L29)), so it never enforces authentication — it only redirects
already-authenticated DEPARTMENT users away from admin routes. Real protection currently rests
entirely on `getCurrentUserAccess()` / `requireAdmin()` in each page and route; the middleware is
not a reliable second layer.

### S5. Invoice PDF templates are rendered HTML executed by Puppeteer with `--no-sandbox` — medium
[app/app/api/invoices/[invoiceId]/pdf/route.ts](../app/app/api/invoices/%5BinvoiceId%5D/pdf/route.ts)
and the sibling `documents/invoice/pdf` route launch Chromium with `--no-sandbox` and
`page.setContent(template.html, { waitUntil: "networkidle0" })`. Template HTML is authored by admins
([templates/actions.ts](../app/app/(app)/templates/actions.ts)) and is **not** sanitized, so a
template can embed scripts, `file://` references, or external requests that run server-side with the
Node process's privileges (local file read / internal-network SSRF). Interpolated invoice fields are
HTML-escaped, so the injection surface is the template body itself, not the invoice data — but the
templates are trusted input with no guardrails. Restrict template capabilities, keep the Chromium
sandbox enabled where possible, and block network/file access during rendering.

### S6. State-changing REST routes rely on session cookie without explicit CSRF defense — low
The invoice routes ([api/invoices/route.ts](../app/app/api/invoices/route.ts), POST/PATCH/PUT/DELETE)
and [api/preferences/language](../app/app/api/preferences/language/route.ts) authorize purely via the
NextAuth session cookie. Server *actions* get NextAuth/Next's built-in CSRF handling, but these
hand-rolled route handlers do not. The NextAuth session cookie defaults to `SameSite=Lax`, which
blocks cross-site POSTs and mitigates most of the risk, but this is implicit — worth an explicit
same-origin/`Origin` check on these mutating endpoints.

---

## Functional issues

### F1. Journal entries are attributed to the wrong user — high
[journal/actions.ts](../app/app/(app)/journal/actions.ts#L44-L45) sets `enteredById` from
`prisma.user.findFirst({ orderBy: { createdAt: "asc" } })` — i.e. **the oldest user in the system**,
not the admin actually creating the entry. Every journal entry's "entered by" is therefore the same
(usually the seeded admin), regardless of author. It should use the authenticated user's id
(`await requireAdmin()` already returns it).

### F2. Journal sequence numbers are assigned with a read-then-write race — medium
Same file: the next `sequenceNumber` is computed as `max(sequenceNumber) + 1`
([lines 41-47](../app/app/(app)/journal/actions.ts#L41-L47)) and then inserted in a separate query.
Two concurrent creations can read the same max and collide on `@@unique([editionId, sequenceNumber])`,
throwing an unhandled error to the user. Allocate the sequence inside a transaction or with a DB
sequence.

### F3. Invoice `totalAmount` is trusted, not derived — medium
[api/invoices/route.ts](../app/app/api/invoices/route.ts#L109-L110) stores `totalAmount` and
`lineItems` as independent client-supplied values with no check that the total equals the sum of the
line items. A malformed or malicious client can persist an invoice whose printed total disagrees with
its lines. Recompute the total server-side from the line items.

### F4. Expense-report department is not validated — medium — **FIXED**
`createExpenseReportAction` now confirms the submitted `departmentId` belongs to the active edition
and — for non-admins — that its name is in the user's `departmentRoleNames`, before creating the
report.

### F5. Budget line update/delete are not edition-scoped — low
[budget/actions.ts](../app/app/(app)/budget/actions.ts#L60-L86) `updateBudgetLineAction` and
`deleteBudgetLineAction` operate on any `budgetLineId` without confirming it belongs to the active
edition. It is admin-only so it is not a privilege escalation, but a stale page from a previous
edition could silently mutate the wrong edition's data. (`createBudgetLineAction` does scope its
department correctly.)

### F6. `app/.env.example` is missing — low
The [README](../README.md) step 2 instructs `cp .env.example .env` inside `app/`, but only
`docker/.env.example` exists. New setups will fail that step and have no template for `AUTH_SECRET`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `DATABASE_URL`. Add `app/.env.example`.

### F7. No Prisma migrations — low
The project uses `prisma db push` only ([package.json](../app/package.json)); there is no
`prisma/migrations` directory. Schema history is untracked and production schema changes are
non-reproducible/destructive. Adopt `prisma migrate` before deploying.

### F8. Fragile Prisma-client workaround for the Appointment model — low
[calendar/actions.ts](../app/app/(app)/calendar/actions.ts#L96-L104) casts the client to `unknown` to
access `prisma.appointment` and throws "Run db:generate and restart the app." at runtime if it is
missing. This is a leftover workaround for a stale generated client; other models are used directly.
It should be removed once the client is regenerated, since it hides real errors behind a misleading
message.

---

## UX issues

### U1. Server-action failures surface as raw errors — high
There is no `error.tsx`, `loading.tsx`, or `not-found.tsx` anywhere under `app/`. Server actions
throughout (`throw new Error("Amount must be a positive number.")`, "Selected department does not
belong…", etc.) bubble up as unhandled exceptions, giving the user Next's generic error screen
instead of an inline, localized message next to the field. Add route-level `error.tsx` boundaries
and/or return typed error state to the forms.

### U2. Settings/preferences save failures are swallowed — medium
[components/app-shell.tsx](../app/components/app-shell.tsx#L98-L118) `saveSettings()` `await`s the
`fetch` but never checks `response.ok`; on any failure it still closes the dialog and calls
`router.refresh()`, so the user believes their language / refund-bank details were saved when they
were not. Check the response and show an error.

### U3. Login screen is not localized — medium
The rest of the app is bilingual (EN/FR) via [i18n dictionaries](../app/lib/i18n-dictionaries.ts),
but [login/page.tsx](../app/app/(auth)/login/page.tsx) hardcodes English: "Sign in - Private
workspace", "Invalid email or password.", "Signing in...", "Enter workspace". French users hit
English at the first screen.

### U4. Inconsistent delete-confirmation patterns — low
Deletions use three different confirmation styles: typing the word `delete`
([tasks/actions.ts](../app/app/(app)/tasks/actions.ts#L126-L130)), a native `window.confirm`
([calendar/client.tsx](../app/app/(app)/calendar/client.tsx#L338)), and — for journal entries, users,
departments, money accounts, cost centers — apparently no explicit confirmation guard in the action
at all. Pick one consistent, localized confirmation pattern for destructive actions.

### U5. Native `window.alert` for task feedback — low
[tasks/client.tsx](../app/app/(app)/tasks/client.tsx#L141) surfaces messages with `window.alert`,
which is jarring and unstyled compared to the rest of the UI. Use the app's own notification/toast
styling.

### U6. Login always redirects to `/`, then bounces — low
[login/page.tsx](../app/app/(auth)/login/page.tsx#L18) signs in with `callbackUrl: "/"`. DEPARTMENT
users are then redirected from `/` to `/budget` by the route gating, producing a visible double
navigation on every department login. Redirect by role after authentication.
