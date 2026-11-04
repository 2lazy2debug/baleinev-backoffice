# Step 3 — Events for guests

## Goal

On `/events` a guest sees the non-expired events of the default edition, can sign up for and
withdraw from shifts, sees who else is on each shift, and has nothing else to press.

## Scope

- `app/(app)/events/page.tsx > EventsPage`: for a guest, drop expired events (the page already
  computes `isExpired` via `lib/events.ts > isEventExpired`); load no unavailabilities.
- Empty states for a guest: no default edition, or no non-expired events → `<EmptyPage>` with
  guest copy that gives direction (e.g. "No events open yet. Check back later."). The member copy
  (`common.pickEditionHint`) is wrong for a guest, who cannot pick.
- `client.tsx > EventsPageClient`: for a guest, never render the "Unavailable" / "Available again"
  buttons. Prop named after the rule (e.g. `canDecline`), not `isGuest` scattered through the tree.
  Sign up / Withdraw / PDF / copy link / info modal stay as for members.
- `actions.ts > signUpForShiftAction`: for a GUEST, skip `createUserTask` (still writes the
  assignment and the `SIGNUP` staff log).
- `markUnavailableForShiftAction`, `clearUnavailableForShiftAction`: refuse GUEST. This already
  holds from Step 1 (they don't opt in) — this step adds the tests that pin it.
- i18n: new keys in the `events` block, en and fr.
- Docs: `docs/business-processes.md` has no staffing section; add a short "Guests on events"
  paragraph (what a guest sees and may do, no task on sign-up).

## Tests (`staffing-actions.test.ts`, `unavailability-actions.test.ts`)

- Guest sign-up: assignment created, staff log written, `createUserTask` **not** called.
- Member sign-up: `createUserTask` still called (regression).
- Guest withdraw: works; resolves no task (there is none).
- Guest mark-unavailable / clear-unavailable: refused, no prisma write.

## Manual pass

1. Seed an expired event and a future one in the default edition. Guest sees only the future one.
2. Guest signs up → their name appears on the shift; `/tasks` as admin shows no new STAFF_SHIFT
   task for the guest. Withdraw → gone.
3. No "Unavailable" button anywhere for the guest; members still have it.
4. Default edition closed (dev fixture) → guest sees events read-only, no sign-up buttons.
5. No default edition → guest sees the guest empty state.

## Code map

- `app/(app)/events/page.tsx > EventsPage`
- `app/(app)/events/client.tsx > EventsPageClient` (self-service buttons, `useEditionReadOnly`)
- `app/(app)/events/actions.ts > signUpForShiftAction`, `withdrawFromShiftAction`,
  `markUnavailableForShiftAction`, `clearUnavailableForShiftAction`, `requireWritableShift`,
  `assertEventNotExpired`
- `lib/events.ts > isEventExpired`
- `lib/tasks.ts > createUserTask`
- `lib/i18n-dictionaries.ts` (`events` block, en and fr)
- `components/ui > EmptyPage`
- Tests: `app/(app)/events/staffing-actions.test.ts`, `unavailability-actions.test.ts`
