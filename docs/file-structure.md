# File Structure — Where to Find What

## Top-level directories inside `app/`

```
app/              ← Next.js App Router root
components/       ← Shared UI components
lib/              ← Server-side helpers, utilities, auth wiring
prisma/           ← Database schema, seed, migrations
scripts/          ← Data-import scripts and the check:design / check:i18n guards
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
│   │   ├── page.tsx              ← Queries the edition's budgets (visible-to-me filtered), one card each
│   │   ├── client.tsx            ← One card per budget: budget tables above `sm`, a read-only
│   │   │                            planned-vs-actual roll-up and cardlets below; department chips,
│   │   │                            edit/delete a budget (management and the details modal are desktop-only)
│   │   ├── create-budget-modal.tsx ← Header-button + Modal for "create a budget" (client component)
│   │   ├── budget-form-fields.tsx  ← Shared name + department MultiSelect for the create/edit forms
│   │   └── actions.ts            ← Server actions: create/edit/delete a budget, create/edit/delete budget lines
│   │
│   ├── journal/
│   │   ├── page.tsx              ← Journal entry list, reads ?fromExpenseReport for prefill
│   │   ├── client.tsx            ← Client page with add-entry modal, filters, sorting
│   │   ├── [journalEntryId]/     ← Full-page edit form — how a phone edits an entry (the
│   │   │                            table's inline editor is desktop-only); returns to /journal on save
│   │   └── actions.ts            ← Server actions: create/update/delete journal entries
│   │
│   ├── money-accounts/
│   │   ├── page.tsx                        ← Money account CRUD, opening balance management (data-fetching only)
│   │   ├── client.tsx                      ← Client-side interactive update/delete forms
│   │   ├── create-money-account-modal.tsx  ← Header button + create modal (bank/cash/other, IBAN fields for bank only)
│   │   └── actions.ts                      ← Server actions: create/update/delete money accounts (admin + Comptabilité)
│   │
│   ├── cost-centers/
│   │   ├── page.tsx              ← Cost center CRUD (data-fetching only)
│   │   ├── client.tsx            ← Cost center cards with inline rename/delete
│   │   ├── create-cost-center-modal.tsx ← Header button + create modal
│   │   └── actions.ts            ← Server actions: create/update/delete cost centers
│   │
│   ├── expense-reports/
│   │   ├── page.tsx              ← Header + history (data-fetching only)
│   │   ├── create-expense-report-modal.tsx ← Header button + create modal (standard + driving, proof upload)
│   │   ├── client.tsx            ← History: table above `sm`, cardlets below; admin approve/reject
│   │   └── actions.ts            ← Server actions: submit, approve, reject
│   │
│   ├── invoices/
│   │   ├── page.tsx              ← Invoice form + history (admin only); also loads the address
│   │   │                            book, so the recipient can be picked instead of typed
│   │   └── client.tsx            ← Interactive invoice builder + QR preview + PDF download
│   │
│   ├── addresses/
│   │   ├── page.tsx              ← The address book (global, any signed-in user; data-fetching only,
│   │   │                            and it hands the gated header buttons to the client)
│   │   ├── client.tsx            ← Owns the page header (search across every column + the count);
│   │   │                            the list: filter row, sortable headers, edit in place above
│   │   │                            `sm`, the same rows as cardlets below it
│   │   ├── create-address-modal.tsx ← Header button for the shared <CreateAddressModal>
│   │   ├── [addressId]/          ← One address, read first: description, then the contact fields,
│   │   │                            the pencil turns the card into the form. Bank accounts under it
│   │   │                            (add/edit in a dialog, delete in place)
│   │   ├── settings/             ← Contact types (admin only): create button + rename/delete rows
│   │   └── actions.ts            ← Server actions: address + bank-account CRUD (open to any signed-in
│   │                                user except deleting), plus contact-type CRUD (admin only)
│   │
│   ├── articles/                ← The catalogue behind stock (`StockElement`), its own admin-only
│   │   │                            app. "Article" is the UI word; the model is unchanged
│   │   ├── page.tsx              ← List + filters, data-fetching only; `requireAdmin()`
│   │   ├── client.tsx            ← Table above `sm`, cardlets below, both from one array. An
│   │   │                            untracked article shows a "Not stocked" badge where the piece
│   │   │                            count would be. Create/edit/delete, all admin (the app is)
│   │   ├── article-form-modal.tsx ← What an article is, in one dialog — the header create button
│   │   │                            and the pencil on a row both open it. Scan fills the barcode
│   │   │                            (and, on a new article, name/brand/size). "Counted in stock"
│   │   │                            and "Expires" checkboxes
│   │   ├── create-article-button.tsx ← The header trigger for the shared dialog
│   │   └── actions.ts            ← create/update/delete an article, each `requireAdmin()`. Turning
│   │                                "Counted in stock" or "Expires" off is refused while pieces
│   │                                (or dated pieces) of it sit in a stock
│   │
│   ├── stock/
│   │   ├── page.tsx              ← Three screens in one route: nothing to work with yet, the
│   │   │                            one-time stock picker, and the contents of the stock this
│   │   │                            user last opened (global, any signed-in user)
│   │   ├── client.tsx            ← Owns the page header (like passwords' client) with the search
│   │   │                            field both breakpoints read, plus the contents: table above
│   │   │                            `sm`, tight cardlets below, and the entry controls — +/-
│   │   │                            straight to the server, or the edit button to unlock the count
│   │   │                            *and* the expiry date and save the recount as one movement
│   │   ├── add-stock-modal.tsx   ← Header button + "new entry" modal; can invent the article it is
│   │   │                            stocking, in the same submission (any signed-in user, and the
│   │   │                            article lands counted in stock). The scan button opens the
│   │   │                            camera in place of this form: a known code selects its article,
│   │   │                            an unknown one opens the "new item" half, prefilled
│   │   ├── stock-place-switcher.tsx ← <StockPlacePicker> (the first-visit screen),
│   │   │                            <StockPlaceSwitcher> (the box next to "New entry") — both write
│   │   │                            the choice to the user through the preference route — and the
│   │   │                            <StockPlaceList> the two of them and the transfer modal share
│   │   ├── transfer-stock-modal.tsx ← The swap-icon row button: moves some or all of an entry to
│   │   │                            another stock, picking the destination from <StockPlaceList>.
│   │   │                            Logs as an Out and an In, exactly like `deleteStockPlaceAction`
│   │   ├── history/              ← The movement log, newest first, filtered by article/stock/direction
│   │   ├── settings/             ← Stocks, units and the conversions between them (admin only).
│   │   │                            Deleting a stock asks where its contents go first
│   │   └── actions.ts            ← Server actions: add/adjust/set/remove stock, the place/unit
│   │                                configuration, and `lookupBarcodeAction()` — the read behind a
│   │                                scan. The scan-to-create path still writes a `StockElement`
│   │                                here. Every quantity change goes through one helper that writes
│   │                                the row and its movement together
│   │
│   ├── templates/
│   │   ├── page.tsx              ← Document template manager (admin only, data-fetching only)
│   │   ├── client.tsx            ← Client-side create/update/delete/set-default forms
│   │   └── actions.ts            ← Server actions: create/update/delete/set-default template
│   │
│   ├── passwords/
│   │   ├── page.tsx              ← Department-scoped shared password manager (data-fetching, no ciphertext to client)
│   │   ├── client.tsx            ← Owns the page header (create button + search); list rows,
│   │   │                            create/edit/delete modals, reveal & 2FA on demand
│   │   └── actions.ts            ← Server actions: create/update/delete + revealPassword/getTotpCode (see docs/passwords.md)
│   │
│   ├── events/
│   │   ├── page.tsx              ← Events + staffing for the active edition (data-fetching only)
│   │   ├── client.tsx            ← Event panels (collapsible by anyone), days, shift
│   │   │                            rows (sign up / assign / edit in place / delete). Each panel is
│   │   │                            the anchor `#event-<id>`, copied by the header's link button and
│   │   │                            scrolled to (below the top bar) on arrival
│   │   ├── create-event-modal.tsx ← Header button + create modal (dates bounded by the edition)
│   │   ├── shift-fields.tsx      ← The four fields a shift is made of + the overlap check, shared
│   │   │                            by the add row and the inline editor
│   │   ├── add-shift-form.tsx    ← The add-a-shift row under a day
│   │   ├── edit-shift-form.tsx   ← The same fields prefilled, in place of the row's labels
│   │   ├── settings/             ← Event types (admin only): create button + edit dialog; delete is
│   │   │                            refused while a type is in use
│   │   └── actions.ts            ← Server actions: event type / event / day / shift CRUD, sign-up,
│   │                                withdraw, admin assign
│   │
│   ├── users/
│   │   ├── page.tsx              ← User management (admin only, data-fetching only)
│   │   ├── client.tsx            ← One card per user, read-only (badge + department pills); the
│   │   │                            pencil opens the update form, which is also where delete lives
│   │   ├── create-user-modal.tsx ← Header button + create modal
│   │   └── actions.ts            ← Server actions: create/update/delete users
│   │
│   ├── editions/
│   │   ├── page.tsx              ← Edition management (admin only, data-fetching only)
│   │   ├── client.tsx            ← Client-side create/activate/close/delete forms
│   │   └── actions.ts            ← Server actions: create/set-active/delete/close edition, update driving rate
│   │
│   ├── departments/
│   │   ├── page.tsx              ← The association's departments (admin only, global — no edition)
│   │   ├── client.tsx            ← Table above `sm`, cardlets below; edit and delete dialogs
│   │   ├── create-department-modal.tsx ← The header button and its dialog
│   │   ├── department-form-fields.tsx  ← The two fields (name, abbreviation) create and edit share
│   │   └── actions.ts            ← Server actions: create/update/delete; delete is refused only for people/expense-reports/invites/passwords, never budgets
│   │
│   └── account/
│       ├── page.tsx              ← The signed-in user's own account (global, not edition-scoped)
│       ├── client.tsx            ← One card each: profile/name, bank details, password, department access, 2FA
│       ├── two-factor-card.tsx   ← The 2FA card in its three states: off, enrolling (QR + key + code), on
│       └── actions.ts            ← Server actions: update name/bank details/password, ask to join a department, plus 2FA start/confirm/cancel/disable (all self-only)
│
├── (auth)/
│   └── login/
│       ├── page.tsx              ← Reads the locale, renders the form
│       └── login-form.tsx        ← Login form (client component, calls signIn()); swaps to a code field when 2FA is on
│
└── api/
    ├── auth/
    │   └── [...nextauth]/route.ts  ← NextAuth catch-all handler
    │
    ├── preferences/
    │   ├── language/route.ts       ← POST: set the locale cookie (nothing else — the Account screen owns the rest)
    │   ├── edition/route.ts        ← POST: switch this user's selected edition
    │   └── stock-place/route.ts    ← POST: switch this user's selected stock (same shape, same reason)
    │
    ├── documents/
    │   └── invoice/pdf/route.ts    ← POST: render invoice template → Puppeteer → PDF
    │
    ├── invoices/route.ts           ← POST: persist a new Invoice record
    │
    ├── cities/route.ts             ← GET: postal-code ↔ locality proposals for the address fields
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
| `app-shell.tsx` | Persistent sidebar navigation (desktop, `lg` and up), edition picker, the Account link and the language dialog's trigger, sign-out. Owns the navigation array both shells render, provides the read-only context and renders the closed-edition banner. Wraps the app in `<MobileShellProvider>` so the account menu in every screen's header can reach the edition and language handlers |
| `language-modal.tsx` | `<LanguageModal>` — the app's one language switch, opened by the globe button in both shells. Mount it only while open; the pending choice is local state |
| `navigation.ts` | `NavigationItem` / `EditionOption` — the nav shape shared by the sidebar and the mobile shell |
| `edition-read-only.tsx` | `useEditionReadOnly()` / `WritableEditionOnly` / `EditionClosedBanner` — lets pages hide create/edit/delete affordances while the selected edition is closed |
| `journal-table.tsx` | Full interactive journal entry table with filter, sort, inline edit above `sm`; the same rows as `<CardletList>` cards below it (filtering/sorting stay desktop-only, editing goes to `/journal/[journalEntryId]`) |
| `add-journal-entry-modal.tsx` | Modal for creating/prefilling journal entries; used on journal page and from expense-report approval |
| `sign-out-button.tsx` | Sign-out action for the app shell — a labelled `<Button>` when expanded, an icon `<IconButton>` when the sidebar is collapsed, a `<MobileSheetRow>` (`row`) in the mobile account menu |
| `form-error.tsx` | Renders a server-action error message through the shared `<Alert>` (nothing when there is no message) |
| `barcode-scanner.tsx` | `<BarcodeScanner locale onDetected onCancel>` — the camera reading an EAN, plus the typed field a hardware scanner types into. **Not a dialog**: it renders inside the one that asked, in place of that dialog's form. The decoder (`@zxing/browser`) is imported on first use so no screen pays for it until someone taps scan |
| `unit-size-fields.tsx` | `<UnitSizeFields>` — "one piece is" as one control (the size and its unit) plus the convert button that rewrites both from the conversion table. Shared by the two dialogs that write a `StockElement`: the articles form and the stock app's "new item" half |
| `tasks-create-modal.tsx` | Modal with the two "create todo" / "create task" forms used on the tasks page |
| `use-close-on-success.ts` | `useCloseOnSuccess()` — closes a create modal once its `useActionState` form comes back without an error |
| `address-fields.tsx` | `<AddressFields>` / `<BankAccountFields>` / `<PostalFields>` plus their empty drafts — the fields an address and a bank account are made of, shared by every screen that writes one. Each control carries its own `name`, so the surrounding `<form>` posts straight to a server action |
| `create-address-modal.tsx` | `<CreateAddressModal open onClose onCreated>` — the one "new address" dialog, controlled by whoever opens it. `onCreated` hands back the written row, not just its id, so a caller can select it without waiting for a refresh |
| `address-picker.tsx` | `<AddressPicker>` — "use an address": search the book, or create one on the spot and have it selected. What lets the invoice builder fill its recipient from the book |

### `components/mobile/` — the mobile shell

Everything below the `lg` breakpoint, where the sidebar is hidden. The bar is mounted
once by `app-shell.tsx`; the account menu is mounted by `<PageHeader>`, which every
screen already owns. Screens never import from here themselves.

The split is the point: **the bottom bar is apps, the top bar is the person.**

| File | Purpose |
|---|---|
| `mobile-shell.tsx` | The fixed bottom bar — tasks, expenses, events, calendar, then "Other" — and the one-level app drawer behind that last slot. Bar slots come from the role's own navigation array (`BAR_HREFS`), so an app added later falls into the drawer on its own |
| `mobile-account-menu.tsx` | `<MobileAccountMenu>` — the account icon at the top right of the mobile top bar and the sheet it opens: Account · Language · Edition · Sign out. Reads its handlers from `mobile-shell-context.tsx`, renders nothing above `lg` |
| `mobile-shell-context.tsx` | `<MobileShellProvider>` / `useMobileShell()` — how the account menu reaches AppShell's edition and language handlers without every page threading props. Null outside the shell (error and not-found screens) |
| `mobile-sheet.tsx` | `<MobileSheet open onClose>` and `<MobileSheetRow>` — the bottom sheet and the one row recipe inside it. Escape, backdrop tap, and a two-detent drag on the handle: up goes full height, down steps back and then closes. Renders into `<body>`, or the header's `z-20` would trap it under the bottom bar |
| `mobile-nav-button.tsx` | `<MobileNavButton>` / `<MobileNavLink badge>` — the one bottom-bar button recipe (slots share the bar evenly, so five fit at 320px) |

### `components/ui/` — the design system

Every screen builds from these; see CLAUDE.md → "Design system rules" for when to use
which. Nothing here should be re-implemented inline in a page.

| File | Exports |
|---|---|
| `control.ts` | `ControlSize` (`md`/`sm`) plus `controlHeight`/`controlSquare` — the one height scale every control resolves to, 44px below `lg` and dense above it |
| `Button.tsx` | `<Button variant size icon compactOnMobile>` and `buttonClasses()` for links that read as buttons. `compactOnMobile` drops the label below `lg` and leaves the icon on the square `<IconButton>` footprint, for an action row that fits a desktop header but not a phone. `compactOnMobileWidths` is that same recipe as classes, for a `<Link>`, which cannot be a `<Button>` — pair it with a label wrapped in `hidden lg:inline` |
| `IconButton.tsx` | `<IconButton tone size label>` and `iconButtonClasses()` for non-button elements that act as one |
| `Input.tsx` | `<Input size tone bare>`, plus `inputClasses()` / `autoHeightFieldClasses` shared by every field |
| `Suggest.tsx` | `<Suggest value onValueChange options loadOptions onPick>` — a text field that *proposes* values without imposing them (a NPA proposes its localities, a dialling prefix proposes its countries). Its list renders into `<body>`, positioned from the input's own rect, because these fields sit inside frames that clip |
| `Textarea.tsx`, `Select.tsx`, `MultiSelect.tsx` | The other field controls, all on the same recipe |
| `Field.tsx`, `Checkbox.tsx`, `Radio.tsx` | Labelled field wrapper and the two boolean/choice controls |
| `Card.tsx` | `<Card span dashed flushOnMobile>` + `<CardGrid>` — padded surfaces in a 12-column grid; `flushOnMobile` drops the frame below `sm` for a section whose mobile content is a `<CardletList>` |
| `Panel.tsx` | `<Panel nested>`, `<PanelHeader>`, `<SectionTitle desktopOnly>` and `nestedSurfaceClasses` — frames around flush content |
| `PageHeader.tsx` | `<PageHeader eyebrow title description actions controls>` — the heading block of every screen, and the sticky full-bleed top bar below `lg`. `description` is desktop-only; `controls` is the screen's own control row, pinned with the title. Below `lg` it also carries `<MobileAccountMenu>` at the top right, level with the title |
| `EmptyPage.tsx` | `<EmptyPage eyebrow title>` — a whole screen with nothing to show yet: what is missing in the header, what to do about it in a dashed card |
| `SegmentedControl.tsx` | `<SegmentedControl options value onChange>` — one row of mutually exclusive choices, for a screen that shows one of two panels on a phone |
| `Table.tsx` | `<Table frame dense desktopOnly>` + `<THead>` `<TFoot>` `<TR>` `<TH>` `<TD>` |
| `Cardlet.tsx` | `<CardletList>` `<Cardlet>` `<CardletHeader>` `<CardletFields>` `<CardletField>` `<CardletActions>` — a wide table's rows as cards below `sm` |
| `Menu.tsx` | `<Menu label icon options onSelect>` — a short list of *actions* hanging off one icon button (the unit conversions, today). Not a `<Select>`: nothing is being held, picking a row does something and the menu is gone. Portals from the trigger's rect, like `<Suggest>`, anchored by its **right** edge because its trigger is the last control in a row. "Click outside" means outside the list *and* the trigger — the list is a portal, so a closer that only knows the trigger unmounts the row being clicked |
| `Modal.tsx` | `<Modal open onClose title size mobileFullScreen footer>` — the only dialog implementation. Renders into `<body>`: its trigger usually sits in the `sticky z-20` header, whose stacking context would otherwise pin the dialog under the mobile bottom bar |
| `Alert.tsx`, `Badge.tsx`, `Chip.tsx` | Inline messages, status pills, removable tokens |
| `scroll.ts` | `scrollToBelowTopBar(target)` — scrolls an element clear of the sticky mobile top bar, measuring `<PageHeader>` rather than guessing at a `scroll-mt-*`, since the bar's height depends on what the screen put in it |
| `cn.ts` | Three-line class joiner used by every component |

---

## `lib/` — Server utilities

| File | Purpose |
|---|---|
| `auth.ts` | NextAuth config: credentials provider, bcrypt verify, TOTP second factor, JWT/session callbacks |
| `auth-signals.ts` | The two sign-in outcome strings (`2FA_REQUIRED`, `2FA_INVALID`) `authorize()` throws and the login form reads back off `signIn(...).error`. Import-free so a client component can use it without pulling bcrypt/Prisma into the browser bundle |
| `access.ts` | `getCurrentUserAccess()`, `requireAdmin()`, plus department helpers (`isAdmin`, `accessibleDepartmentIds`, `canAccessDepartments`, `canManageMoneyAccounts`/`requireMoneyAccountManager`) used by every protected page/action |
| `money-account-roles.ts` | Just the `"Comptabilité"` department-name constant, kept import-free so `proxy.ts` (edge) and `access.ts` (server) can both use it without pulling Prisma/bcrypt into the edge bundle |
| `secret-crypto.ts` | AES-256-GCM seal/open for the Passwords vault (`encryptSecret`/`decryptSecret`/`isVaultConfigured`), keyed by `PASSWORD_VAULT_KEY`. See docs/passwords.md |
| `totp.ts` | TOTP primitives over `otpauth`: `generateTotpCode`/`assertValidTotpSeed` for the Passwords vault, plus `generateTotpSecret`/`buildTotpUri`/`verifyTotpCode` for account enrolment |
| `two-factor.ts` | Account 2FA: seals/opens the seed on `User` (`sealTwoFactorSecret`, `verifyUserTwoFactorCode`) and builds the enrolment QR (`buildTwoFactorEnrolment`). Keyed by `PASSWORD_VAULT_KEY` via `secret-crypto.ts` |
| `stock.ts` | `formatPiece()` / `formatTotal()` / `formatQuantity()` / `formatExpiry()` / `toDateInputValue()` — the two numbers a stock row carries (pieces, and what they add up to) written the same way everywhere — plus `normalizeBarcode()` / `isValidBarcode()`, so a camera and a typed field are checked by the same GTIN rule, and `convertQuantity()` / `formatFactor()` for the unit conversions. Import-free, like `addresses.ts` |
| `open-food-facts.ts` | `fetchProductByBarcode()` — what a scanned EAN says about a product (name, brand, size of one piece), from the open catalogue keyed by that code. The name is read `fr` → `en` → `de` → generic, one fixed order for everyone, since the item it fills in is shared. Server-only, best-effort: a miss, a timeout or a half-empty product all mean "type the rest yourself" |
| `addresses.ts` | `addressDisplayName()` / `addressNameBlock()` / `addressPersonName()` / `formatPhone()` / `formatPostalLine()` and `DEFAULT_COUNTRY`. Import-free on purpose — the table, the pickers and the actions all read the same rules without dragging Prisma into a browser bundle |
| `articles.ts` | `elementFieldsFrom()` / `assertBarcodeFree()` — the `StockElement` fields both writing forms post (articles' own dialog, and the stock app's "new item" half) and the "one barcode, one article" check, shared so the two paths cannot drift |
| `city-book.ts` | `rememberCity()` — files a postal code / locality pair the user actually saved, so the seeded Swiss list grows into whatever the address book turns out to need |
| `countries.ts` | `countryOptions(locale)` / `countryName()` — countries and international dialling prefixes from libphonenumber-js + `Intl.DisplayNames`. Built on the server and passed down as props; the phone metadata has no business in a browser bundle that only needs "+41" |
| `db.ts` | Singleton Prisma client (re-used across hot reloads in dev) |
| `i18n-dictionaries.ts` | Complete EN/FR translation dictionary as a `const` object; also defines `Locale` type and cookie name |
| `i18n.ts` | `getLocale()` (reads cookie server-side) and `getDictionary()` |
| `document-templates.ts` | `[[field]]` renderer, `InvoiceDocumentPayload` type, default invoice HTML template, `ensureDefaultInvoiceTemplate()` |
| `swiss-qr.ts` | `buildSwissQrPayload()` — builds a SPC-format QR string for Swiss ISO 20022 QR invoices |
| `departments.ts` | `attachableDepartments()` — every department, `id` and `name`, for the budget app's attach picker (no eligibility filter) |
| `budgets.ts` | `visibleBudgetsWhere(access, editionId)` — the one place the visibility rule lives (admins see all, others see only their departments' budgets); `editionBudgets()` (the journal picker's options); `assertBudgetInEdition()`; `resolveDefaultBudgetForDepartment()` (the expense-report → journal prefill) |
| `edition-carry-over.ts` | `carryOverEdition(tx, source, target)` — copies budgets with their lines and department attachments, cost centers and money accounts into another edition and writes each account's closing balance as a locked opening entry |
| `edition-context.ts` | The single answer to "which edition is this request in", read from `User.selectedEditionId`: `resolveEditionIdOrNull()` (pages), `resolveEditionId()` (write paths, throws), `resolveWritableEditionId()` (write paths, also refuses a closed edition), `requireWritableEdition(id)` (guards a write against a named edition), `resolveEdition()` (the record), `ensureUserEdition()` (the only writer of the seed) |
| `server-action-helpers.ts` | Shared helpers for server actions: `getRequiredString()`, plus the `ActionState` type (`{ error: string \| null }`), `initialActionState`, and `toActionErrorMessage()` used by every action to report validation failures instead of throwing. Kept free of server-only imports — client components import `initialActionState` from here |
| `utils.ts` | `formatCurrency()`, `decimalToNumber()`, `incrementEditionName()` |

---

## `prisma/`

| File | Purpose |
|---|---|
| `schema.prisma` | Single source of truth for the database schema |
| `seed.ts` | Upserts the first admin user (reads `ADMIN_EMAIL`, `ADMIN_PASSWORD`). With `SEED_DEV_FIXTURES=1` and `NODE_ENV` ≠ production it also creates `dev-department@baleinev.local` (DEPARTMENT / `devpassword`) and a closed edition — the non-admin and closed-edition fixtures the verification steps in `docs/plans/` need. Both guards must stay: `npm run db:seed` is run on the server too |

---

## `scripts/`

| File | Purpose |
|---|---|
| `check-design.mjs` | `npm run check:design` — the design-token guard (see CLAUDE.md → "Design system rules"): no hardcoded hex, no arbitrary radius, no bare `var(--space-…)` in markup under `app/` · `components/` |
| `check-i18n.mjs` | `npm run check:i18n` — fails when `lib/i18n-dictionaries.ts` `en` and `fr` fall out of step (a key in one locale and not the other, or an object vs a string). `--dead` additionally lists leaf keys whose name appears nowhere in code — off by default, run it before/after moving keys between blocks and compare |
| `import-workbook.ts` | One-off: parse an Excel workbook JOURNAL sheet → seed departments (global) + one budget per department + money accounts, and book the journal entries against those budgets |
| `import-budget.ts` | One-off: parse budget department sheets from the same workbook → upsert one budget per department name and seed its budget lines |
| `import-bank-statement.ts` | Replays a BCV "Extraction transactionnelle" onto one edition: replaces every entry on the bank account, mirrors bank/cash transfers onto the cash box, and refreshes the next edition's carry-over |

Run the importers with `npx tsx scripts/<file>.ts --workbook ../soa/compta_2025-2026.xlsx`.

`import-bank-statement.ts` is the one that is meant to be re-run — the statement is
the truth for the bank account, so a fresh export replaces what the last one wrote.
It is a dry run unless given `--apply`, and it refuses to write unless the account
lands exactly on `--expect`. The BCV export lists third-party movements only and
carries no fee rows at all, so the gap against `--expect` is booked as one dated,
named charge rather than being silently absorbed. See
[business-processes.md](business-processes.md#importing-a-bank-statement).

---

## `types/`

| File | Purpose |
|---|---|
| `next-auth.d.ts` | Module augmentation that adds `role`, `departmentIds`, `departmentNames`, and `id` to the NextAuth `User`, `Session`, and `JWT` types |

---

## Tests

`vitest.config.ts` + `*.test.ts` next to the code they cover. Node environment,
no DOM — the UI is covered by `build` + `lint` + `check:design`; unit tests cover
the *logic* those cannot see (the "refuse X while Y exists" rules, FormData
parsing, money maths). `npm test` runs them once, `npm run test:watch` watches.

A `"use server"` action is a plain async function: a test imports it and mocks
the three things it reaches for — `next/cache`, `@/lib/access`, `@/lib/db` — then
asserts on the `{ error }` it returns. See
`app/(app)/articles/actions.test.ts` for the pattern and `docs/testing.md`.
