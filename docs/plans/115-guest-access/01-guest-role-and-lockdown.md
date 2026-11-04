# Step 1 — Guest role and lockdown

## Goal

A `GUEST` role exists, and a guest session can reach the Events app of the default edition and
nothing else — enforced in `proxy.ts` and in `lib/access.ts`. No UI creates guests yet; the
seed fixture does.

## Scope

- Prisma: add `GUEST` to `enum UserRole`, migration.
- Widen every role literal union to include `"GUEST"` (`types/next-auth.d.ts`, `lib/auth.ts`
  session callback cast, `lib/access.ts > AccessContext`, and whatever `npm run build` flags).
  Where a switch/Record over roles needs a GUEST arm, give it the most restrictive behaviour.
- `lib/access.ts > getCurrentUserAccess`: refuses GUEST by default; an explicit opt-in returns the
  context for a guest. Contract (design pins the exact name/shape): the zero-argument call — every
  existing call site — must refuse a guest without edits at those call sites.
- Opt in exactly: `app/(app)/layout.tsx`, `app/(app)/events/page.tsx`,
  `events/actions.ts > signUpForShiftAction`, `withdrawFromShiftAction`,
  `app/api/events/[eventId]/pdf/route.ts > GET`.
- `proxy.ts`: GUEST allowlist — `/events` exactly (not `/events/settings`, `/events/logs`),
  `/api/events/<id>/pdf`, `/api/preferences/theme`, plus what is already exempt. Anything else
  → redirect to `/events` (pages) / 401 (API, mirror how `preferences/edition` answers a missing
  session).
- `lib/edition-context.ts`: for a GUEST, `resolveEditionIdOrNull` returns the `isDefault` edition's
  id every time and never writes `selectedEditionId`; `ensureUserEdition` is a no-op for GUEST.
  `app/api/preferences/edition/route.ts > POST` refuses GUEST.
- `login-form.tsx`: GUEST lands on `/events` (same branch as DEPARTMENT).
- `prisma/seed.ts > seedDevFixtures`: upsert a GUEST user (e.g. `guest@dev.local`, password from
  the same source as the DEPARTMENT fixture).
- Docs: `docs/auth.md` — role list, session shape, middleware section (GUEST allowlist), access
  helper (refuse-by-default), redirect-after-login line (fix the stale `/budget`).

## Out of scope

Shell changes (Step 2), event filtering / button hiding / no-task (Step 3), registration (Step 4),
`/users` display (Step 5). After this step a guest still sees the full sidebar and every event —
that is expected.

## Tests

- New `lib/access.test.ts` (pattern: `app/(app)/articles/actions.test.ts`, mock
  `next-auth` `getServerSession`, `@/lib/db`, `next/navigation` `redirect`):
  GUEST refused by default; GUEST allowed with opt-in; ADMIN/DEPARTMENT unchanged by both.
- `requireAdmin()` refuses GUEST.
- `lib/edition-context`: GUEST resolves to the default edition even with a stale
  `selectedEditionId`; returns null when no default exists; never calls `user.update`.
- `proxy.ts`: if the design makes it testable (mock `getToken`), table of path → outcome for GUEST:
  `/events` next, `/events/settings` → `/events`, `/` → `/events`, `/tasks` → `/events`,
  `/api/events/x/pdf` next, `/api/preferences/edition` refused, `/api/cities` refused.
- Existing `staffing-actions.test.ts` still passes with the opt-in call shape.

## Evidence to gather in design

- The full inventory of `getCurrentUserAccess` call sites (≈65 in `app/(app)/`, plus API routes) —
  confirm none needs a guest except the five above.
- How an action's `try/catch` + `toActionErrorMessage` (`lib/server-action-helpers.ts`) treats a
  `redirect()` thrown from the helper — decide whether the guest refusal redirects or throws.

## Manual pass

1. `SEED_DEV_FIXTURES=1 npm run db:seed`, sign in as the guest fixture → lands on `/events`, sees
   the default edition's events.
2. Visit `/`, `/tasks`, `/account`, `/budget`, `/users`, `/events/settings`, `/events/logs` → each
   ends on `/events`.
3. Sign up for a shift and withdraw → both work.
4. Sign in as DEPARTMENT and ADMIN fixtures → behaviour unchanged.

## Code map

- `prisma/schema.prisma > enum UserRole`, `model User`
- `types/next-auth.d.ts` (User, Session.user, JWT augmentations)
- `lib/auth.ts > authOptions` (`authorize`, `jwt`, `session` callbacks)
- `lib/access.ts > AccessContext`, `getCurrentUserAccess`, `requireAdmin`
- `lib/edition-context.ts > ensureUserEdition`, `resolveEditionIdOrNull`
- `app/api/preferences/edition/route.ts > POST`
- `app/api/events/[eventId]/pdf/route.ts > GET`
- `proxy.ts > proxy`
- `app/(app)/layout.tsx > ProtectedLayout`
- `app/(app)/events/page.tsx > EventsPage`
- `app/(app)/events/actions.ts > signUpForShiftAction`, `withdrawFromShiftAction`
- `app/(auth)/login/login-form.tsx > LoginForm` (post-sign-in redirect by role)
- `prisma/seed.ts > seedDevFixtures`
- Role literals to widen (build will confirm): `lib/tasks.ts`, `components/app-shell.tsx`,
  `app/(app)/tasks/{page,client,actions}`, `app/(app)/expense-reports/{page,client,actions}`,
  `app/(app)/calendar/page.tsx`, `app/(app)/budget/page.tsx`, `app/(app)/pos/page.tsx`,
  `app/(app)/account/client.tsx`, `app/(app)/users/{client,create-user-modal,actions}`,
  `app/api/expense-reports/[expenseReportId]/proof/route.ts`
- Test mock pattern: `app/(app)/events/staffing-actions.test.ts`
