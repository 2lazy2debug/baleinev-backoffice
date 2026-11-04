# Step 2 — Guest shell

## Goal

A guest sees a shell with nothing to navigate to: no bottom bar on mobile, no app list on
desktop, and one menu with their name, theme, language and sign out.

## Scope

- `components/app-shell.tsx > AppShell`: a guest variant driven by the `role` prop it already
  receives (`role === "GUEST"`), not a second shell component.
  - Mobile: `MobileShell`'s bottom bar and "Other" drawer are not rendered; `<main>` drops the
    `pb-24` that clears the bar.
  - Mobile menu (`MobileAccountMenu`, rendered by `PageHeader` from `MobileShellProvider`
    context): name, language, theme, sign out. No Account link, no Edition entry.
  - Desktop: see open question.
- `app/(app)/layout.tsx`: skip the edition list and pending-task count queries for a guest (pass
  empty values); they are unused and the task count is meaningless.
- Rule for the design system: the hiding is a prop on the shell/context (named after the rule,
  documented in the component), never a viewport check — CLAUDE.md "permission decides who sees
  it, never the viewport".
- Docs: none in `docs/` describes the shell per role beyond `docs/auth.md`; add one line there.

## Out of scope

Anything in the events page body (Step 3).

## Open question (ask first, record answer in Design)

Desktop guest shell — which?
- **A (recommended):** the normal sidebar reduced to the logo, one "Events" item, and the footer
  (language, theme, sign out); no edition picker, no Account link.
- **B:** no sidebar at all; the same top-right menu as mobile (`MobileAccountMenu` shown at `lg`
  too).

## Manual pass

1. Guest fixture, 390px viewport: `/events` has no bottom bar, no empty gap at the bottom; the
   top-right menu shows name, language, theme, sign out only. Theme and language both switch.
2. Guest, desktop: per the answer above; no edition picker anywhere.
3. DEPARTMENT and ADMIN, both breakpoints: shell unchanged.

## Code map

- `components/app-shell.tsx > AppShell`, `AppShellProps`, `toggleTheme`, `selectEdition`
  (adminNavigation / departmentNavigation built inline)
- `components/navigation.ts > NavigationItem`, `EditionOption`
- `components/mobile/mobile-shell.tsx > MobileShell`, `BAR_HREFS`
- `components/mobile/mobile-account-menu.tsx > MobileAccountMenu`
- `components/mobile/mobile-shell-context.tsx > MobileShellProvider`, `useMobileShell`
- `components/mobile/mobile-sheet.tsx > MobileSheet`, `SheetSurface` (backdrop is `lg:hidden`)
- `components/ui/PageHeader.tsx > PageHeader` (renders `MobileAccountMenu`)
- `components/language-modal.tsx`, `components/sign-out-button.tsx > SignOutButton`
- `app/(app)/layout.tsx > ProtectedLayout`

## Design

Approved in design session 2026-11-04. All paths relative to `app/`. Where this section and the
spec above differ, this section wins.

### Open question — answered

Desktop guest shell: **B — no sidebar at all.** The same top-right account menu as on a phone,
shown at `lg` too (user, 2026-11-04).

### Evidence gathered

| Question | Finding | Consequence |
|---|---|---|
| What renders the sidebar | `components/app-shell.tsx`: one `<aside ref={asideRef} … hidden … lg:flex>` holds logo, edition picker, nav, footer (name, Account, language, theme, collapse, sign out), version | Guest: don't render the `<aside>` at all. `asideRef` stays null; only `toggleCollapse` reads it, and its button lives inside the aside |
| What renders the bottom bar | `app-shell.tsx`: `<MobileShell navigation locale pendingTaskCount />`, its `<nav>` is `lg:hidden`; the "Other" drawer is only reachable from that bar | Guest: don't render `<MobileShell>` |
| `<main>` | `className="min-w-0 flex-1 p-3 pb-24 lg:p-8"` | Guest: `"min-w-0 flex-1 p-3 lg:p-8"` |
| Account menu trigger | `mobile-account-menu.tsx`: `<IconButton … className="lg:hidden">` | Guest: visible at `lg` |
| Account menu entries | name `<p>`, Account row (`/account`), Language, Theme, Edition row, `<SignOutButton row>` | Guest: drop Account and Edition rows |
| `MobileSheet` above `lg` | `mobile-sheet.tsx > SheetSurface` backdrop div is `… bg-black/60 lg:hidden` | A guest's menu needs the sheet at `lg` → new prop on the primitive (below), not a second component |
| `PageHeader` at `lg` | Wrapper around title + `<MobileAccountMenu />` is `lg:contents`; outer row is `flex flex-wrap items-start justify-between` | At `lg` the trigger becomes a sibling of the title and lands at the right edge. `/events` passes `actions` only when `isAdmin`, so a guest's header has no actions. `PageHeader` needs no code change, only its doc comment |
| `useMobileShell` readers | Only `mobile-account-menu.tsx`. `MobileShellProvider` only in `app-shell.tsx` | Adding a required field to `MobileShellValue` touches exactly these two files |
| Read-only / closed banner | `AppShell` computes `isEditionReadOnly` from `editions.find(id === selectedEditionId)` | Passing `editions: []` would make a closed default edition look writable to a guest → deviation D1 |
| Tests | No test file for any shell/mobile component; vitest includes `**/*.test.ts` only | No new tests (D3) |

### Decisions

| # | Decision | Reason |
|---|---|---|
| R | One boolean on the shell context, `menuOnly`, set by `AppShell` from `role === "GUEST"`. Everything the guest shell hides keys on it; no viewport check, no second shell | CLAUDE.md: permission decides who sees it, never the viewport. One name for one rule |
| S | `MobileSheet` gains `desktopDialog?: boolean` (default `false`): above `lg` the sheet stays visible as a centred dialog (`rounded-3xl`, the Modal radius; no grab handle) instead of being hidden | Rung 2 of the mobile ladder (prop on the primitive). A bottom sheet stretched across a desktop is wrong; the Modal radius is already the token for "a dialog above the page" |
| D1 | **Deviation from spec:** the layout does not skip the edition query for a guest; it narrows it to `where: { isDefault: true }` (one row) | Keeps `isEditionReadOnly` and the closed-edition banner right when the default edition is closed. The edition entry is hidden anyway (R), so the row is never offered as a pick |
| D2 | The pending-task count is skipped for a guest (`Promise.resolve(0)`) | As spec: no Tasks app, no bar badge |
| D3 | No new tests; `npm test` stays 28 files / 315 tests | No logic beyond role → boolean; no component test harness exists (`*.test.ts`, node env) |
| D4 | No i18n keys added or removed | Only existing `shell.*` copy is used |

### Code changes, in this order

**1. `components/mobile/mobile-shell-context.tsx` > `MobileShellValue`** — append a field after
`onToggleTheme`:

```ts
  /**
   * The shell has no app navigation — no sidebar, no bottom bar (a GUEST, who
   * only ever sees /events). The account menu is then the whole shell: its
   * trigger shows at every breakpoint, its sheet opens as a dialog above `lg`,
   * and it drops the Account link and the edition entry, which lead to screens
   * this user cannot open.
   */
  menuOnly: boolean;
```

**2. `components/mobile/mobile-sheet.tsx`**

- `MobileSheetProps`: add after `children`:

  ```ts
    /**
     * Above `lg` a sheet is hidden — the sidebar carries what it holds. A shell
     * with no sidebar (`menuOnly`, the GUEST shell) has nowhere else to put it,
     * so this keeps it above `lg` as a centred dialog: the Modal's radius, no
     * grab handle, the drag gestures unreachable.
     */
    desktopDialog?: boolean;
  ```

- `MobileSheet({ open, onClose, children })` → `MobileSheet({ open, onClose, children, desktopDialog = false })`;
  the portal call passes it: `<SheetSurface onClose={onClose} desktopDialog={desktopDialog}>{children}</SheetSurface>`.
- `SheetSurface` signature → `{ onClose, desktopDialog, children }: { onClose: () => void; desktopDialog: boolean; children: React.ReactNode }`.
- Backdrop div: `className="fixed inset-0 z-40 flex animate-fade-in flex-col justify-end bg-black/60 lg:hidden"` →

  ```tsx
  className={cn(
    "fixed inset-0 z-40 flex animate-fade-in flex-col justify-end bg-black/60",
    desktopDialog ? "lg:items-center lg:justify-center lg:p-6" : "lg:hidden",
  )}
  ```

- Surface div `cn(...)`: add a fifth argument after the `isDragging` one:
  `desktopDialog ? "lg:w-full lg:max-w-sm lg:rounded-3xl lg:border-b lg:pb-4 lg:pt-4" : null,`
- Grab-zone div `className="shrink-0 cursor-grab touch-none py-3 active:cursor-grabbing"` →
  `className={cn("shrink-0 cursor-grab touch-none py-3 active:cursor-grabbing", desktopDialog ? "lg:hidden" : null)}`.
- Top-of-file doc comment: append one paragraph: "Above `lg` it renders nothing, unless `desktopDialog`
  asks for it as a centred dialog (a shell with no sidebar)."

**3. `components/mobile/mobile-account-menu.tsx` > `MobileAccountMenu`**

- Destructure `menuOnly` with the other shell fields.
- Trigger `IconButton`: `className="lg:hidden"` → `className={menuOnly ? "lg:order-last" : "lg:hidden"}`
  (`lg:order-last`: if a guest page ever gets header actions, the account stays at the far end).
- `<MobileSheet open={overlay === "menu"} onClose={() => setOverlay("closed")}>` → add `desktopDialog={menuOnly}`.
- Wrap the Account `MobileSheetRow` (`href="/account"`) in `{menuOnly ? null : ( … )}`.
- Wrap the Edition `MobileSheetRow` (`icon={Layers}`) in `{menuOnly ? null : ( … )}`.
- Leave the edition `<Modal>` as is (unreachable when `menuOnly`).
- Component doc comment: replace the last sentence ("Above `lg` there is a sidebar carrying all four,
  so this renders nothing.") with: "Above `lg` there is a sidebar carrying all four, so this renders
  nothing — except in a shell with no sidebar (`menuOnly`, a GUEST), where it is the account control
  at every breakpoint and holds only name, language, theme and sign out."

Guest menu order, as rendered: name · Language · Theme · Sign out.

**4. `components/app-shell.tsx` > `AppShell`**

- After `const copy = dictionaries[locale].shell;` add:

  ```ts
  // A GUEST sees /events and nothing else (proxy.ts): no app to navigate to, no
  // edition to pick, no account page. The shell is then just the account menu.
  const menuOnly = role === "GUEST";
  ```

- `MobileShellProvider value={{ … }}`: add `menuOnly,` after `onToggleTheme: toggleTheme,`.
- `<aside ref={asideRef} …> … </aside>`: wrap the whole element in `{menuOnly ? null : ( … )}`. Nothing
  inside it changes.
- `<MobileShell navigation={navigation} locale={locale} pendingTaskCount={pendingTaskCount} />` →
  `{menuOnly ? null : <MobileShell navigation={navigation} locale={locale} pendingTaskCount={pendingTaskCount} />}`.
- `<main className="min-w-0 flex-1 p-3 pb-24 lg:p-8">` →
  `<main className={cn("min-w-0 flex-1 p-3 lg:p-8", menuOnly ? null : "pb-24")}>` (`cn` is already imported
  from `@/components/ui`). In the comment above it, change "`pb-24` clears the fixed bottom bar" to
  "`pb-24` clears the fixed bottom bar, which a `menuOnly` shell does not have".
- `adminNavigation` / `departmentNavigation` / `navigation`: unchanged (computed, unused for a guest).

**5. `app/(app)/layout.tsx` > `ProtectedLayout`**

- After `const access = await getCurrentUserAccess({ allowGuest: true });` add
  `const isGuest = access.role === "GUEST";`.
- `prisma.edition.findMany({ orderBy: …, select: … })` → add as first key:

  ```ts
      // A guest is always in the default edition (lib/edition-context.ts) and has no
      // picker; that one row still drives the read-only mode and the closed banner.
      where: isGuest ? { isDefault: true } : undefined,
  ```

- `prisma.task.count({ … })` → `isGuest ? Promise.resolve(0) : prisma.task.count({ … })` (body unchanged).
- Nothing else: `resolveEdition()` already returns the default edition for a guest (Step 1), and the
  `AppShell` props are unchanged.

**6. `components/ui/PageHeader.tsx`** — doc comments only, no code:
- Component comment: "and it renders nothing above `lg`, where the sidebar already carries account,
  language, edition and sign out." → append ", except in the GUEST shell, which has no sidebar and
  keeps it at every breakpoint (`menuOnly`)."
- Comment on the `lg:contents` wrapper: "where there is no account control to place." → "where there is
  no account control to place (in the GUEST shell the control becomes the row's last item instead)."

### Docs

| File | Change |
|---|---|
| `docs/auth.md` > Middleware, after the GUEST allowlist item (the "**Is the user a `GUEST`?**" paragraph) | add one line: "The shell matches: `components/app-shell.tsx` renders a GUEST with no sidebar and no bottom bar; the account menu (name, language, theme, sign out) is the only chrome, at every breakpoint (`MobileShellValue.menuOnly`)." |
| `docs/file-structure.md` > `app-shell.tsx` row | append: "A GUEST (`menuOnly`) gets neither sidebar nor bottom bar — only the account menu" |
| `docs/file-structure.md` > `mobile-account-menu.tsx` row | replace "renders nothing above `lg`" with "renders nothing above `lg` unless the shell is `menuOnly` (GUEST: name · Language · Theme · Sign out, every breakpoint)" |
| `docs/file-structure.md` > `mobile-shell-context.tsx` row | append: "Carries `menuOnly` — the shell has no app navigation (GUEST)" |
| `docs/file-structure.md` > `mobile-sheet.tsx` row | `<MobileSheet open onClose>` → `<MobileSheet open onClose desktopDialog>`; append "`desktopDialog` keeps it above `lg` as a centred dialog, for a shell with no sidebar" |

### Gates (from `app/`)

| Gate | Expected |
|---|---|
| `npm run build` | pass (a missed `menuOnly` in the provider value fails here: required field) |
| `npm run lint` | 0 errors, the 2 pre-existing warnings only |
| `npm run check:design` | pass (only token utilities: `rounded-3xl`, `max-w-sm`, `p-6`) |
| `npm run check:i18n` | pass, en/fr 1026 keys each (unchanged) |
| `npm test` | 28 files, 315 tests, 0 failures (unchanged) |
| `grep -rn "menuOnly" components app` | lines only in `mobile-shell-context.tsx`, `mobile-account-menu.tsx`, `app-shell.tsx`, `ui/PageHeader.tsx` (comments) |
| `grep -rn "desktopDialog" components` | lines only in `mobile-sheet.tsx` and `mobile-account-menu.tsx` |

### Manual pass (dev server, local DB, `SEED_DEV_FIXTURES=1 npm run db:seed` first)

1. Sign in as `dev-guest@baleinev.local` / `devpassword`, 390px viewport, `/events`: no bottom bar;
   scroll to the end — no empty ~96px gap under the last card.
2. Same: tap the account icon (top right) → sheet shows the guest's name, Language, Theme, Sign out,
   in that order; no Account, no Edition. Theme switches in place; Language opens the dialog and
   switching to FR relabels the page.
3. Same guest, ≥1024px: no sidebar; the page fills the width; the account icon sits at the right end of
   the title row. Click it → centred dialog (rounded, no grab handle) with the same four entries;
   Escape and a backdrop click both close it. Sign out → `/login`.
4. Guest: nowhere on either breakpoint is an edition picker or edition name in the shell chrome.
5. `dev-department@baleinev.local` and the admin, 390px and ≥1024px: sidebar, bottom bar, "Other"
   drawer, account menu (with Account and Edition rows) and the `lg:hidden` account icon unchanged;
   the sheet is still hidden above `lg` (resize a 390px window with the sheet open past 1024px →
   sheet disappears, as today).
6. Admin: switch edition from the sidebar and from the mobile menu → both still work.
