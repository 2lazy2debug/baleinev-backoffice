# Baleinev Backoffice — Issues

Findings from a read-through of the codebase, grouped by category and ordered roughly by severity
within each group. Each item points at the code it concerns. Items marked **(verify)** are strong
suspicions that should be confirmed by running the relevant flow before acting.

---

## Security issues


The route now serves a proof only to an ADMIN or to the report's own `submittedById`, answering
`404` (not `403`) otherwise so ids cannot be enumerated. The expense-reports **page** had the same
leak — it listed every report with proof links to every user — and is now scoped to the submitter's
own reports for non-admins, with the department picker limited to the user's own departments.


Now the stored mime type is derived by sniffing the file's magic bytes
([lib/proof-upload.ts](../app/lib/proof-upload.ts)), the route serves proofs with
`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, a sandboxing CSP, and a
content type re-validated against the allow-list. The filename is sanitized (directory separators,
control characters and quotes stripped) and emitted with both an ASCII `filename` and an RFC 5987
`filename*`, so it can no longer break the header.

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

### F6. `app/.env.example` is missing — low
The [README](../README.md) step 2 instructs `cp .env.example .env` inside `app/`, but only
`docker/.env.example` exists. New setups will fail that step and have no template for `AUTH_SECRET`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `DATABASE_URL`. Add `app/.env.example`.

### F7. No Prisma migrations — low
The project uses `prisma db push` only ([package.json](../app/package.json)); there is no
`prisma/migrations` directory. Schema history is untracked and production schema changes are
non-reproducible/destructive. Adopt `prisma migrate` before deploying.

---

## UX issues

### U1. Server-action failures surface as raw errors — high
There is no `error.tsx`, `loading.tsx`, or `not-found.tsx` anywhere under `app/`. Server actions
throughout (`throw new Error("Amount must be a positive number.")`, "Selected department does not
belong…", etc.) bubble up as unhandled exceptions, giving the user Next's generic error screen
instead of an inline, localized message next to the field. Add route-level `error.tsx` boundaries
and/or return typed error state to the forms.

### U4. Inconsistent delete-confirmation patterns — low
Deletions use three different confirmation styles: typing the word `delete`
([tasks/actions.ts](../app/app/(app)/tasks/actions.ts#L126-L130)), a native `window.confirm`
([calendar/client.tsx](../app/app/(app)/calendar/client.tsx#L338)), and — for journal entries, users,
departments, money accounts, cost centers — apparently no explicit confirmation guard in the action
at all. Pick one consistent, localized confirmation pattern for destructive actions.

### U6. Login always redirects to `/`, then bounces — low
[login/page.tsx](../app/app/(auth)/login/page.tsx#L18) signs in with `callbackUrl: "/"`. DEPARTMENT
users are then redirected from `/` to `/budget` by the route gating, producing a visible double
navigation on every department login. Redirect by role after authentication.
