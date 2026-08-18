# Overview — Tech Stack & Core Patterns

## What this application is

**Baleinev Comptes** is a private, invite-only accounting and operations management tool for the Baleinev music festival. It covers budgets, journal entries, invoices, expense report approvals, and money-account tracking — all scoped to festival "editions" (yearly accounting periods).

---

## Tech Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| Runtime | React | 19 |
| DB ORM | Prisma | 6.18 |
| Database | PostgreSQL | any |
| Auth | NextAuth.js (credentials + JWT) | 4.x |
| Styling | Tailwind CSS | v4 |
| PDF generation | Puppeteer (headless Chromium) | 24.x |
| QR codes | `qrcode` | 1.x |
| Language | TypeScript | 5.x |
| Build | Turbopack (via `next dev`) | bundled with Next |

---

## Core Patterns

### 1. Server Components by default

Every route `page.tsx` is a React Server Component. It fetches data directly from the database via Prisma (no API route needed). Client state lives only where necessary, extracted into separate `client.tsx` files imported by the page.

```
page.tsx        ← async server component, fetches DB, passes props
client.tsx      ← "use client" interactive shell
actions.ts      ← "use server" form actions, called directly from forms
```

### 2. Server Actions for mutations

All data mutations (create, update, delete) go through `"use server"` action functions. Forms use `action={myAction}` directly, or call actions from a client component event handler.  
After a mutation, actions call `revalidatePath(...)` to invalidate the Next.js cache so the page refreshes with fresh data.

### 3. Access control in two layers

- **Middleware (`proxy.ts`)** — runs on every request edge, checks the JWT, redirects `DEPARTMENT` role users away from admin-only routes immediately.
- **Server functions (`requireAdmin()` / `getCurrentUserAccess()`)** — called inside server components and server actions to enforce checks on the server, regardless of the middleware.

Never rely on the middleware alone. Sensitive actions always call `requireAdmin()`.

### 4. Edition-scoped data

Almost everything (departments, money accounts, budget lines, journal entries, invoices, expense reports) is tied to an `Edition` record.

**Which edition is a per-user setting, not a global mode.** It is stored on the user
(`User.selectedEditionId`) and every query resolves it through `lib/edition-context.ts` — so two
people can work in two different editions at the same time, and each switches independently from
the sidebar picker. `Edition.isDefault` only seeds accounts that have no edition yet; changing it
moves nobody who is already using the app.

Closing an edition makes it **read-only, not inaccessible**: it stays selectable and browsable,
exports and invoice PDFs still work, and every write is refused by `requireWritableEdition()`.
Global data — passwords, users, templates, event types — carries no edition and stays writable.

### 5. Locale / i18n

The app supports English (`en`) and French (`fr`). The active locale is stored in a cookie (`blv_locale`). All UI text lives in `lib/i18n-dictionaries.ts` under a strongly-typed `dictionaries` object — no string literals in components. The `getDictionary(locale)` helper is called at the top of every server page.

### 6. Document template rendering

Invoice PDFs are generated from HTML templates stored in the database (`DocumentTemplate` model). Templates use `[[fieldName]]` placeholder syntax. The renderer (`lib/document-templates.ts`) replaces each placeholder with an escaped value from a typed `InvoiceDocumentPayload` object, then passes the full HTML to Puppeteer for PDF export.

### 7. CSS custom properties for theming

All colours are defined as CSS custom properties in `app/globals.css` (e.g. `--accent`, `--panel`, `--ink`, `--muted`, `--line`). Tailwind classes reference these properties: `bg-[var(--panel)]`, `text-[var(--accent)]`, etc. Do not hard-code colour hex values in components.

---

## Project root layout

The npm project is **not** the repo root. The root is the git checkout; `app/` is the
Next project, and every `npm`, `npx` and `docker compose` call runs from there.

```
app/               ← the Next.js application (this is the package root)
├── app/           ← Next.js `app/` router directory
│   ├── (app)/     ← protected route group (requires auth)
│   ├── (auth)/    ← public route group (login page)
│   └── api/       ← API routes
├── components/    ← shared React components
├── lib/           ← shared server-side utilities and helpers
├── prisma/        ← Prisma schema, migrations, seed
├── scripts/       ← one-off import scripts (workbook, budget)
├── public/        ← static assets (logo, favicon)
├── types/         ← TypeScript declaration augments (next-auth.d.ts)
└── docker-compose.yml ← the Postgres container, dev and production alike
deploy/            ← the tag-driven deploy pipeline (see production.md)
docs/              ← this documentation
soa/               ← the original workbook, and the logo the PDF routes read at runtime
install.sh         ← first-time server install
```

## Where to look next

- [production.md](production.md) — the server, the ports, the tag vocabulary, and the
  first-install runbook.
- [file-structure.md](file-structure.md) — where each route and helper lives.
- [database.md](database.md) · [auth.md](auth.md) · [passwords.md](passwords.md) —
  the data model, the session layer, and the vault.
