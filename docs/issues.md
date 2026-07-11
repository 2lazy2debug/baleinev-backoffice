# Baleinev Backoffice — Issues

Findings from a read-through of the codebase, grouped by category and ordered roughly by severity
within each group. Each item points at the code it concerns. Items marked **(verify)** are strong
suspicions that should be confirmed by running the relevant flow before acting.

Issue IDs are stable: a missing number (e.g. F1, F2, F6, F8, U5, U6, U7) means that item was resolved
and removed, not renumbered.

---

## Security issues

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

### U8. UI diverges from the stated design directives — medium
[CLAUDE.md](../CLAUDE.md)'s design system describes a dense, functional aesthetic with "few
decorative elements, no gratuitous padding," yet the implemented UI does not consistently follow it,
and the directives themselves had to be rewritten to match reality rather than the reverse:

- **Rounding is heavier than "functional."** The directives were reverse-engineered from the code
  (`rounded-[28px]` outer cards, `rounded-full` pills/buttons everywhere) instead of the code being
  tightened toward a dense/minimal-rounding intent. The documented conventions now codify the
  existing heaviness rather than a deliberate scale.
- **Undefined design tokens leak into markup.** `var(--radius-*)` / `var(--space-*)` references
  have appeared in components even though only the eight colour tokens exist — a sign the directives
  and the implementation drifted apart and were maintained independently. The last known instance was
  the app-shell error banner, since fixed, but nothing prevents a recurrence.
- **No single source of truth for spacing/radius.** Because spacing and rounding live only as
  ad-hoc Tailwind utilities per component, there is nothing to lint against, so drift from the
  directives is invisible until read by hand.

This is a consistency/governance issue rather than a single bug: decide whether the code should move
toward the stated dense/minimal intent or the directives should keep documenting what exists, then
make the two agree and add a guard (grep/lint) against undefined `var(--radius-*)` / `var(--space-*)`
usage so they cannot silently reappear.

#### Developer's note for U8 
please take a look at /home/mcabras/Developer/LeadDesk_3.0 folder. you will find the CLAUDE.md instructions
of that repo that outlines that repo's rules for UI. Please adapt this codebase with the same ruleset and take
inspiration from the styling of this repo. keep baleinev's color scheme but basically apply the same UI 
architecture from that repo. 