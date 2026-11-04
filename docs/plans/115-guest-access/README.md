# 115 — Guest access to events

People outside the association (friends, volunteers from other clubs) need to join event
shifts without being made members. This plan adds a third role, **GUEST**: self-registered from
the login screen, locked to the Events app of the open edition, with a shell that has nothing
else in it.

All paths are relative to `app/` (where `package.json` lives). Quote them in zsh: `(app)` is a glob.

## Steps

| # | Step | Migration | Depends on |
|---|---|---|---|
| 1 | [Guest role and lockdown](done/01-guest-role-and-lockdown.md) — done, `v0.69.0` | **yes** | — |
| 2 | [Guest shell](done/02-guest-shell.md) — done, `v0.69.0` | no | 1 |
| 3 | [Events for guests](done/03-events-for-guests.md) — done, `v0.69.0` | no | 1 |
| 4 | [Guest sign-up](04-guest-sign-up.md) | no | 1, 2, 3 |
| 5 | [Guests in /users](05-guests-in-users.md) | no | 1 |

Run in order. Step 4 is the one that opens the door to the public: it ships last-but-one so
every guard is in place before anyone can create a guest.

## Models

| Step | Design | Execute | Beyond the default |
|---|---|---|---|
| 4 | opus | sonnet | `verifier` curl smoke test of register → sign in → `/events` |
| 5 | opus | sonnet | — |

## Decisions (user, 2026-11-04)

| Decision | Reason |
|---|---|
| A guest is a `User` with `role = GUEST`, not a separate table | `StaffAssignment`, `EventStaffLog`, the schedule PDF and NextAuth all key on `User`; a second identity table would fork every one of them |
| Guests sign up on their own from `/login` ("Enter as guest": name, email, password). Usable immediately, no approval, no invite code | User's choice. Admins clean up from `/users` (Step 5) |
| Returning guests use the normal "Sign in" with their email and password | One credentials provider, one login flow |
| Guests see **every non-expired event** of their edition (no per-event "open to guests" flag) | User's choice. "Expired" is `lib/events.ts > isEventExpired`, the same rule the page already sorts by |
| Guests may **sign up and withdraw** only. No "unavailable" answer | User's choice |
| Guests see **everyone's names** on a shift, same as members (and may download the schedule PDF, which shows the same) | User's choice |
| A guest's edition is always the **default edition** (`Edition.isDefault`), resolved on every request, never a stored pick. No edition picker | "Always the open edition is proposed." A stored `selectedEditionId` would strand guests on last year's edition when the default moves |
| Guest shell: no app navigation, no bottom bar. The menu holds name, theme, language and sign out — no Account link, no edition | User's spec |
| Signing up as a guest creates **no** `STAFF_SHIFT` task | Guests have no Tasks app; a task nobody can see is noise in the admin's task counts |

## Invariants

- **Refuse by default.** `lib/access.ts > getCurrentUserAccess` refuses a GUEST unless the caller
  explicitly opts in. Only these opt in: `app/(app)/layout.tsx`, `app/(app)/events/page.tsx`,
  `signUpForShiftAction`, `withdrawFromShiftAction`, `app/api/events/[eventId]/pdf/route.ts`.
  Any page or action added later is closed to guests without anyone remembering to close it.
- **Two layers, as for DEPARTMENT** (`docs/auth.md` > Why two layers): `proxy.ts` holds an
  allowlist for GUEST (fast path, from the JWT); the access helper is the authoritative check.
- `requireAdmin()` already refuses anything that is not ADMIN — guests need nothing there.
- A guest never owns an `ExpenseReport` or `Appointment` (the two `onDelete: Restrict` relations to
  `User`), so deleting a guest from `/users` can never be blocked.
- Email is trimmed, not lowercased — `lib/auth.ts > authorize` does `findUnique({ email })` on the
  trimmed input. Registration must store exactly what sign-in will look up.
- Password minimum is 8 — `app/(app)/account/actions.ts > MIN_PASSWORD_LENGTH`. Reuse the constant
  (move it to `lib/` if a second file needs it), never a second literal.

## Gotchas

- Server actions POST to the page path (`/events`, `/login`), so the proxy allowlist covering a
  page covers its actions. `/login` and `/api/preferences/language` are already proxy-exempt.
- `requireAdmin()` *throws* `"Unauthorized."`; `getCurrentUserAccess()` *redirects*. A guest
  refusal inside an action's `try` must not be swallowed into an error message that hides a
  redirect — Step 1's Design pins which.
- Adding a value to the Prisma `UserRole` enum breaks every exhaustive `Record<UserRole, …>` and
  every `"ADMIN" | "DEPARTMENT"` literal (≈20 files, incl. `types/next-auth.d.ts`, `lib/tasks.ts`,
  `app/(app)/tasks/*`, `app/(app)/users/*`). `npm run build` is the inventory.
- `components/app-shell.tsx` reserves `pb-24` on `<main>` for the bottom bar — a shell without
  the bar must drop it.
- `docs/auth.md` says DEPARTMENT users land on `/budget`; `login-form.tsx` actually sends them to
  `/events`. Fix the doc when Step 1 touches the redirect.

## Out of scope

- Rate limiting or captcha on registration and login (none exists in the app today).
- Email verification, password reset for guests, guest self-service account page.
- A per-event "open to guests" flag.

## Current state

- Step 1 shipped (committed, not tagged). `UserRole` has `GUEST`; `getCurrentUserAccess({ allowGuest: true })`
  is called by exactly the five opt-ins (plus 4 lines in tests); `proxy.ts` holds the GUEST allowlist;
  `toActionErrorMessage` rethrows `redirect()`.
- Guest fixture: `dev-guest@baleinev.local` / `devpassword`. Local default edition: `2026-2027`.
- Step 2 shipped (committed, not tagged). `AppShell` sets `menuOnly` for a GUEST: no sidebar, no bottom bar, only
  `MobileAccountMenu` (name, language, theme, sign out), shown at every breakpoint; `MobileSheet` has a `desktopDialog` prop.
  The layout loads only the default edition for a guest. Step 2's manual pass is still unrun.
- Step 3 shipped (`v0.69.0`, local tag, not pushed; `requires-migration` because it also carries Step 1). `/events` shows a guest only non-expired
  events of the default edition (`isGuest` in `page.tsx`), loads no unavailabilities (`take: 0`), hides the decline buttons (`canDecline`),
  and guest sign-up creates no STAFF_SHIFT task. The PDF route answers 404 to a guest for another edition's or an expired event. Step 3's manual pass is unrun.
- Gate baseline: 29 test files / 324 tests; lint 0 errors, 2 pre-existing warnings.

## Verification kit

- Checks (from `app/`): `npm run build`, `npm run lint`, `npm run check:design`,
  `npm run check:i18n`, `npm test`.
- Local DB only. `SEED_DEV_FIXTURES=1 npm run db:seed` — Step 1 adds a GUEST fixture
  (`prisma/seed.ts > seedDevFixtures`) next to the DEPARTMENT user, so Steps 1–3 are testable before
  sign-up exists.
- Guest manual pass, every step from 1: sign in as the guest fixture and try `/`, `/tasks`,
  `/account`, `/users`, `/events/settings`, `/events/logs`, `/api/preferences/edition` — each must
  land on `/events` (or 401/redirect for the API), never render.

## Deferred

| Item | Step |
|---|---|
| `/users` shows a GUEST as "Department"; its edit `<Select>` offers only ADMIN/DEPARTMENT (saving promotes it); `getRoleAndDepartmentIds` rejects `GUEST` | 5 |
