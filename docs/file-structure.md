# File Structure — Where to Find What

## Top-level directories inside `app/`

```
app/              ← Next.js App Router root
components/       ← Shared UI components
lib/              ← Server-side helpers, utilities, auth wiring
prisma/           ← Database schema, seed, migrations
scripts/          ← One-off data-import scripts
public/           ← Static files served at "/"
types/            ← TypeScript module augmentations
docs/             ← This documentation
```

---

## `app/` — Route tree

```
app/
├── layout.tsx                    ← Root HTML shell (font, meta, body)
├── globals.css                   ← CSS custom properties and base styles
│
├── error.tsx                     ← Route-level error boundary (styled, localized, "try again")
├── global-error.tsx              ← Fallback boundary for errors in the root layout itself
├── not-found.tsx                 ← Styled 404 page
│
├── (app)/                        ← Protected group (needs a valid session)
│   ├── layout.tsx                ← Fetches active user, renders <AppShell>
│   ├── page.tsx                  ← Dashboard (budget vs actuals + money account balances)
│   │
│   ├── budget/
│   │   ├── page.tsx              ← Budget overview, department CRUD
│   │   ├── client.tsx            ← Client-side interactive budget forms
│   │   └── actions.ts            ← Server actions: create/edit/delete budget lines & departments
│   │
│   ├── journal/
│   │   ├── page.tsx              ← Journal entry list, reads ?fromExpenseReport for prefill
│   │   ├── client.tsx            ← Client page with add-entry modal, filters, sorting
│   │   └── actions.ts            ← Server actions: create/update/delete journal entries
│   │
│   ├── money-accounts/
│   │   ├── page.tsx                       ← Money account CRUD, opening balance management (data-fetching only)
│   │   ├── client.tsx                     ← Client-side interactive update/delete forms
│   │   ├── create-money-account-form.tsx  ← Create form (bank/cash/other, IBAN fields shown for bank only)
│   │   └── actions.ts                     ← Server actions: create/update/delete money accounts (admin + Comptabilité)
│   │
│   ├── cost-centers/
│   │   ├── page.tsx              ← Cost center CRUD (data-fetching only)
│   │   ├── client.tsx            ← Client-side interactive create/update/delete forms
│   │   └── actions.ts            ← Server actions: create/update/delete cost centers
│   │
│   ├── expense-reports/
│   │   ├── page.tsx              ← Expense report form + history table (data-fetching only)
│   │   ├── client.tsx            ← Client-side approve/reject history table
│   │   └── actions.ts            ← Server actions: submit, approve, reject
│   │
│   ├── invoices/
│   │   ├── page.tsx              ← Invoice form + history (admin only)
│   │   └── client.tsx            ← Interactive invoice builder + QR preview + PDF download
│   │
│   ├── templates/
│   │   ├── page.tsx              ← Document template manager (admin only, data-fetching only)
│   │   ├── client.tsx            ← Client-side create/update/delete/set-default forms
│   │   └── actions.ts            ← Server actions: create/update/delete/set-default template
│   │
│   ├── passwords/
│   │   ├── page.tsx              ← Department-scoped shared password manager (data-fetching, no ciphertext to client)
│   │   ├── client.tsx            ← Cards + create/edit/delete modals, reveal & 2FA on demand
│   │   └── actions.ts            ← Server actions: create/update/delete + revealPassword/getTotpCode (see docs/passwords.md)
│   │
│   ├── users/
│   │   ├── page.tsx              ← User management (admin only, data-fetching only)
│   │   ├── client.tsx            ← Client-side create/update/delete forms
│   │   └── actions.ts            ← Server actions: create/update/delete users
│   │
│   ├── editions/
│   │   ├── page.tsx              ← Edition management (admin only, data-fetching only)
│   │   ├── client.tsx            ← Client-side create/activate/close/delete forms
│   │   └── actions.ts            ← Server actions: create/set-active/delete/close edition, update driving rate
│   │
│   └── departments/
│       ├── page.tsx              ← Department list (admin only, data-fetching only)
│       ├── client.tsx            ← Client-side create/delete forms
│       └── actions.ts            ← Server actions: create/delete department
│
├── (auth)/
│   └── login/
│       └── page.tsx              ← Login form (client component, calls signIn())
│
└── api/
    ├── auth/
    │   └── [...nextauth]/route.ts  ← NextAuth catch-all handler
    │
    ├── preferences/
    │   ├── language/route.ts       ← POST: save locale + user refund profile
    │   └── edition/route.ts        ← POST: switch this user's selected edition
    │
    ├── documents/
    │   └── invoice/pdf/route.ts    ← POST: render invoice template → Puppeteer → PDF
    │
    ├── invoices/route.ts           ← POST: persist a new Invoice record
    │
    ├── expense-reports/
    │   └── [expenseReportId]/
    │       └── proof/route.ts      ← GET: serve stored proof file (authenticated)
    │
    └── qr/
        └── swiss/route.ts          ← GET: generate Swiss QR PNG from payload string
```

---

## `components/` — Shared UI

| File | Purpose |
|---|---|
| `app-shell.tsx` | Persistent sidebar navigation, edition picker, settings modal (locale + refund profile), sign-out. Provides the read-only context and renders the closed-edition banner |
| `edition-read-only.tsx` | `useEditionReadOnly()` / `WritableEditionOnly` / `EditionClosedBanner` — lets pages hide create/edit/delete affordances while the selected edition is closed |
| `journal-table.tsx` | Full interactive journal entry table with filter, sort, inline edit |
| `add-journal-entry-modal.tsx` | Modal for creating/prefilling journal entries; used on journal page and from expense-report approval |
| `sign-out-button.tsx` | Sign-out action for the app shell — a labelled `<Button>` when expanded, an icon `<IconButton>` when the sidebar is collapsed |
| `form-error.tsx` | Renders a server-action error message through the shared `<Alert>` (nothing when there is no message) |
| `tasks-create-modal.tsx` | Modal with the two "create todo" / "create task" forms used on the tasks page |

### `components/ui/` — the design system

Every screen builds from these; see CLAUDE.md → "Design system rules" for when to use
which. Nothing here should be re-implemented inline in a page.

| File | Exports |
|---|---|
| `control.ts` | `ControlSize` (`md`/`sm`) plus `controlHeight`/`controlSquare` — the one height scale every control resolves to |
| `Button.tsx` | `<Button variant size>` and `buttonClasses()` for links that read as buttons |
| `IconButton.tsx` | `<IconButton tone size label>` and `iconButtonClasses()` for non-button elements that act as one |
| `Input.tsx` | `<Input size tone bare>`, plus `inputClasses()` / `autoHeightFieldClasses` shared by every field |
| `Textarea.tsx`, `Select.tsx`, `MultiSelect.tsx` | The other field controls, all on the same recipe |
| `Field.tsx`, `Checkbox.tsx`, `Radio.tsx` | Labelled field wrapper and the two boolean/choice controls |
| `Card.tsx` | `<Card span dashed>` + `<CardGrid>` — padded surfaces in a 12-column grid |
| `Panel.tsx` | `<Panel nested>`, `<PanelHeader>`, `<SectionTitle>` and `nestedSurfaceClasses` — frames around flush content |
| `PageHeader.tsx` | `<PageHeader eyebrow title description actions>` — the heading block of every screen |
| `Table.tsx` | `<Table frame dense>` + `<THead>` `<TFoot>` `<TR>` `<TH>` `<TD>` |
| `Modal.tsx` | `<Modal open onClose title size footer>` — the only dialog implementation |
| `Alert.tsx`, `Badge.tsx`, `Chip.tsx` | Inline messages, status pills, removable tokens |
| `cn.ts` | Three-line class joiner used by every component |

---

## `lib/` — Server utilities

| File | Purpose |
|---|---|
| `auth.ts` | NextAuth config: credentials provider, bcrypt verify, JWT/session callbacks |
| `access.ts` | `getCurrentUserAccess()`, `requireAdmin()`, plus department helpers (`isAdmin`, `accessibleDepartmentRoleIds`, `canAccessDepartments`, `canManageMoneyAccounts`/`requireMoneyAccountManager`) used by every protected page/action |
| `money-account-roles.ts` | Just the `"Comptabilité"` department-name constant, kept import-free so `proxy.ts` (edge) and `access.ts` (server) can both use it without pulling Prisma/bcrypt into the edge bundle |
| `secret-crypto.ts` | AES-256-GCM seal/open for the Passwords vault (`encryptSecret`/`decryptSecret`/`isVaultConfigured`), keyed by `PASSWORD_VAULT_KEY`. See docs/passwords.md |
| `totp.ts` | Generates live TOTP codes from a stored 2FA seed (`otpauth`); `generateTotpCode`/`assertValidTotpSeed` |
| `db.ts` | Singleton Prisma client (re-used across hot reloads in dev) |
| `i18n-dictionaries.ts` | Complete EN/FR translation dictionary as a `const` object; also defines `Locale` type and cookie name |
| `i18n.ts` | `getLocale()` (reads cookie server-side) and `getDictionary()` |
| `document-templates.ts` | `[[field]]` renderer, `InvoiceDocumentPayload` type, default invoice HTML template, `ensureDefaultInvoiceTemplate()` |
| `swiss-qr.ts` | `buildSwissQrPayload()` — builds a SPC-format QR string for Swiss ISO 20022 QR invoices |
| `department-roles.ts` | `syncDepartmentRolesFromDepartments()` — keeps `DepartmentRole` names in sync with active departments |
| `edition-carry-over.ts` | `carryOverEdition(tx, source, target)` — copies departments with their budget lines, cost centers and money accounts into another edition and writes each account's closing balance as a locked opening entry |
| `edition-context.ts` | The single answer to "which edition is this request in", read from `User.selectedEditionId`: `resolveEditionIdOrNull()` (pages), `resolveEditionId()` (write paths, throws), `resolveWritableEditionId()` (write paths, also refuses a closed edition), `requireWritableEdition(id)` (guards a write against a named edition), `resolveEdition()` (the record), `ensureUserEdition()` (the only writer of the seed) |
| `server-action-helpers.ts` | Shared helpers for server actions: `getRequiredString()`, plus the `ActionState` type (`{ error: string \| null }`), `initialActionState`, and `toActionErrorMessage()` used by every action to report validation failures instead of throwing. Kept free of server-only imports — client components import `initialActionState` from here |
| `utils.ts` | `formatCurrency()`, `decimalToNumber()`, `incrementEditionName()` |

---

## `prisma/`

| File | Purpose |
|---|---|
| `schema.prisma` | Single source of truth for the database schema |
| `seed.ts` | Creates the first admin user (reads `ADMIN_EMAIL`, `ADMIN_PASSWORD` env vars) |

---

## `scripts/`

| File | Purpose |
|---|---|
| `import-workbook.ts` | One-off: parse an Excel workbook JOURNAL sheet → seed journal entries + departments + money accounts |
| `import-budget.ts` | One-off: parse budget department sheets from the same workbook → seed budget lines |

Run with `npx tsx scripts/<file>.ts --workbook ../soa/compta_2025-2026.xlsx`.

---

## `types/`

| File | Purpose |
|---|---|
| `next-auth.d.ts` | Module augmentation that adds `role`, `departmentRoleIds`, `departmentRoleNames`, and `id` to the NextAuth `User`, `Session`, and `JWT` types |
