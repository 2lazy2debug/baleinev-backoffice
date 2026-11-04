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
- `components/ui/PageHeader.tsx > PageHeader` (renders `MobileAccountMenu`)
- `components/language-modal.tsx`, `components/sign-out-button.tsx > SignOutButton`
- `app/(app)/layout.tsx > ProtectedLayout`
