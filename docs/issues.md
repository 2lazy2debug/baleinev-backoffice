# Baleinev Backoffice — Issues

Findings from a read-through of the codebase, grouped by category and ordered roughly by severity
within each group. Each item points at the code it concerns. Items marked **(verify)** are strong
suspicions that should be confirmed by running the relevant flow before acting.

Issue IDs are stable: a missing number (e.g. F1, F2, F6, F8, S1, S2, S3, S4, U1, U5, U6, U7, U8) means
that item was resolved and removed, not renumbered.

---

## Security issues

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

### F7. No Prisma migrations — low
The project uses `prisma db push` only ([package.json](../app/package.json)); there is no
`prisma/migrations` directory. Schema history is untracked and production schema changes are
non-reproducible/destructive. Adopt `prisma migrate` before deploying.

---

## UX issues

### U4. Inconsistent delete-confirmation patterns — low
Deletions use three different confirmation styles: typing the word `delete`
([tasks/actions.ts](../app/app/(app)/tasks/actions.ts#L126-L130)), a native `window.confirm`
([calendar/client.tsx](../app/app/(app)/calendar/client.tsx#L338)), and — for journal entries, users,
departments, money accounts, cost centers — apparently no explicit confirmation guard in the action
at all. Pick one consistent, localized confirmation pattern for destructive actions.