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

## Design

No migration. One commit: `feat(events): events for guests (plan 115 Step 3)`.

### Deviations from the spec

| Spec | Design | Why |
|---|---|---|
| `docs/business-processes.md` "has no staffing section; add one" | Append a paragraph to the existing `## 14. Events — the staffing log` | §14 exists and already holds the staffing rules |
| PDF route not in scope | In scope: a guest gets 404 for an event outside the default edition or already expired | README Deferred assigns it to Step 3 |
| "load no unavailabilities" | `take: isGuest ? 0 : undefined` on the existing relation | Keeps one query and one row type; the `where` stays as is |

### 1. `app/(app)/events/page.tsx > EventsPage`

- After `const isAdmin = …` add `const isGuest = access.role === "GUEST";`.
- In the `unavailabilities` include, between `where` and `select`, add:
  ```ts
  // A guest has no "unavailable" answer — they may only sign up and withdraw.
  take: isGuest ? 0 : undefined,
  ```
- After `const copy = getDictionary(locale);`… (after `isGuest`), define:
  ```tsx
  const guestEmptyPage = (
    <EmptyPage eyebrow={copy.events.title} title={copy.events.guestNoEventsTitle}>
      {copy.events.guestNoEventsHint}
    </EmptyPage>
  );
  ```
- `if (!activeEdition)`: return `guestEmptyPage` when `isGuest`, else the existing member `EmptyPage` unchanged.
- Replace the `events` construction with:
  ```ts
  // A guest sees only what they can still sign up for; a member keeps expired
  // events, listed below the active ones.
  const events = isGuest
    ? eventsWithExpiry.filter((event) => !event.isExpired)
    : [
        ...eventsWithExpiry.filter((event) => !event.isExpired),
        ...eventsWithExpiry.filter((event) => event.isExpired),
      ];

  if (isGuest && events.length === 0) return guestEmptyPage;
  ```
  Keep the existing comment above `const now` (reword its first line to "For a member, expired events keep their place…").
- Pass `canDecline={!isGuest}` to `<EventsPageClient>` (after `accessId`).

### 2. `app/(app)/events/client.tsx > EventsPageClient`

- `Props`: add after `accessId`:
  ```ts
  /** Whether the viewer may answer "unavailable". Guests may only sign up and withdraw. */
  canDecline: boolean;
  ```
  Destructure it in the component signature after `accessId`.
- Shift-row self-service block (`{isReadOnly || event.isExpired ? null : signed ? (`):
  - `) : unavailable ? (` → `) : canDecline && unavailable ? (`
  - Wrap the `<form action={markUnavailableFormAction}>…</form>` (the `copy.unavailable` button) in `{canDecline ? ( … ) : null}`.
  - Nothing else changes: Withdraw, Sign up, PDF, copy link, info modal, read-only gating stay as for members.

### 3. `app/(app)/events/actions.ts > signUpForShiftAction`

Gate the task and the `/tasks` revalidation on one flag; `revalidatePath("/events")` stays unconditional:
```ts
// Guests have no Tasks app: a STAFF_SHIFT task nobody can see is noise.
const createsTask = access.role !== "GUEST";
if (createsTask) {
  await createUserTask({ …unchanged… });
}

revalidatePath("/events");
if (createsTask) revalidatePath("/tasks");
```

No change to `withdrawFromShiftAction` (its `task.findFirst` returns null for a guest and the update is skipped), nor to `markUnavailableForShiftAction` / `clearUnavailableForShiftAction` (they call `getCurrentUserAccess()` without `allowGuest`).

### 4. `app/api/events/[eventId]/pdf/route.ts > GET`

- Imports: add `resolveEditionIdOrNull` from `@/lib/edition-context`, `isEventExpired` from `@/lib/events`.
- `await getCurrentUserAccess({ allowGuest: true });` → `const access = await getCurrentUserAccess({ allowGuest: true });`
- `select`: add `editionId: true` and `endDate: true` at the top level, and `isOff: true` in the `days` select (needed by `isEventExpired`; the `where: { isOff: false }` stays).
- After the `if (!event) return 404` block:
  ```ts
  // A guest reaches only the events /events lists for them: the default
  // edition's, not yet over. Anything else reads as not found.
  if (
    access.role === "GUEST" &&
    (event.editionId !== (await resolveEditionIdOrNull()) || isEventExpired(event))
  ) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  ```
- Member behaviour unchanged (no edition or expiry filter).

### 5. i18n (`lib/i18n-dictionaries.ts`, `events` block, right after `noEvents`)

| Key | en | fr |
|---|---|---|
| `guestNoEventsTitle` | `No events open yet` | `Aucun événement ouvert pour l'instant` |
| `guestNoEventsHint` | `Events you can sign up for will show up here. Check back later.` | `Les événements auxquels vous pouvez vous inscrire apparaîtront ici. Revenez plus tard.` |

The client's `EventsCopy` type is not touched (the page reads these keys directly).

### 6. Docs — `docs/business-processes.md`, end of §14 (after the `/events/logs` paragraph)

```md
**Guests on events.** A guest (`role = GUEST`) always sees the default edition and only its events
that are not over yet (`lib/events.ts > isEventExpired`); with no default edition or nothing open,
`/events` says so and asks them to check back later. A guest may sign up and withdraw, sees who
else is on each shift and may download the schedule PDF — the PDF route answers 404 for any event
outside that set. A guest has no "unavailable" answer: the page loads no `ShiftUnavailability`
rows for them, shows no Unavailable / Available again button, and both actions refuse a guest.
Signing up as a guest writes the `StaffAssignment` and the `SIGNUP` log line but creates no
`STAFF_SHIFT` task — guests have no Tasks app.
```

### 7. Tests

**`app/(app)/events/staffing-actions.test.ts`** — add a `const guestAccess = { id: "guest_1", userName: "Gail", role: "GUEST" };` after the fixtures, and a new `describe("guests on shifts")`:

| Test | Setup | Expect |
|---|---|---|
| `guest sign-up writes the assignment and the log but no task` | `getCurrentUserAccess.mockResolvedValue(guestAccess)` | `result.error` null; `tx.staffAssignment.create` called with `{ data: { shiftId: "shift_1", userId: "guest_1" } }`; `tx.eventStaffLog.create` called once with `action: "SIGNUP"`, `subjectId: "guest_1"`; `createUserTask` not called; `revalidatePath` not called with `"/tasks"` |
| `member sign-up still creates the STAFF_SHIFT task` | default (DEPARTMENT `user_1`) | `createUserTask` called once with `expect.objectContaining({ type: "STAFF_SHIFT", userId: "user_1", staffAssignmentId: "assignment_1" })`; `revalidatePath` called with `"/tasks"` |
| `guest withdraw removes the assignment and resolves no task` | guest access; `findUniqueOrThrow` → `shiftFixture({ assignments: [{ id: "assignment_g", userId: "guest_1", user: { name: "Gail" } }] })`; `task.findFirst` → null (default) | `result.error` null; `tx.staffAssignment.delete` called with `{ where: { id: "assignment_g" } }`; `tx.eventStaffLog.create` with `action: "WITHDRAW"`; `prisma.task.update` not called |

**`app/(app)/events/unavailability-actions.test.ts`**
- Change the `@/lib/access` mock to forward arguments: `getCurrentUserAccess: (...a: unknown[]) => getCurrentUserAccess(...a),`.
- Add a helper after `assignForm`:
  ```ts
  // Stand-in for lib/access.ts: a guest is refused unless the caller opts in
  // (lib/access.test.ts pins the real redirect).
  function signInAsGuest() {
    getCurrentUserAccess.mockImplementation(async (options?: { allowGuest?: boolean }) => {
      if (!options?.allowGuest) throw new Error("REDIRECT:/events");
      return { id: "guest_1", userName: "Gail", role: "GUEST" };
    });
  }
  ```
- New `describe("guests cannot decline")`:

| Test | Expect |
|---|---|
| `markUnavailableForShiftAction refuses a guest and writes nothing` | `result.error` `"REDIRECT:/events"`; `prisma.eventShift.findUnique`, `prisma.$transaction`, `tx.shiftUnavailability.create`, `tx.eventStaffLog.create` not called |
| `clearUnavailableForShiftAction refuses a guest and writes nothing` | same, with `tx.shiftUnavailability.delete` instead of `create` |

**New `app/api/events/[eventId]/pdf/route.test.ts`** — mocks: `puppeteer` (`default: { launch }`, `launch = vi.fn().mockRejectedValue(new Error("no browser"))`), `@/lib/access` (`getCurrentUserAccess`, forwarding args), `@/lib/db` (`prisma.event.findUnique`), `@/lib/edition-context` (`resolveEditionIdOrNull` → `"ed_default"`), `@/lib/i18n` (`getLocale` → `"en"`, `getDictionary` → `{ events: {} }`), `@/lib/shift-schedule-pdf` (`renderShiftSchedulePdf` → `{ html: "", footerHtml: "" }`). Fixture: `{ name: "Spring Fest", editionId: "ed_default", endDate: 2099-04-12, days: [{ id: "day_1", date: 2099-04-12, isOff: false, shifts: [{ id: "shift_1", startTime: "18:00", endTime: "22:00", noTime: false, role: "Bar", capacity: 2, assignments: [] }] }] }`, overridable. Call `GET(new Request("http://localhost/api/events/event_1/pdf"), { params: Promise.resolve({ eventId: "event_1" }) })`.

| Test | Access / fixture | Expect |
|---|---|---|
| `guest: event of another edition is not found` | GUEST; `editionId: "ed_old"` | status 404; `launch` not called |
| `guest: expired event is not found` | GUEST; `endDate` and day `date` 2020-04-12 | status 404; `launch` not called |
| `guest: open event of the default edition renders` | GUEST; default fixture | `launch` called once (status 400 from the mocked failure) |
| `member: no edition filter` | DEPARTMENT; `editionId: "ed_old"` | `launch` called once; `resolveEditionIdOrNull` not called |

### Gates

- `npm run build`, `npm run lint` (0 errors, 2 pre-existing warnings), `npm run check:design`, `npm run check:i18n`, `npm test`.
- Tests: **29 files / 324 tests** (baseline 28 / 315; +3 staffing, +2 unavailability, +4 route in a new file).

### Manual pass (local DB, after `SEED_DEV_FIXTURES=1 npm run db:seed`)

Guest = `dev-guest@baleinev.local` / `devpassword`; admin = the seeded admin. Default edition `2026-2027`.

1. As admin, in `2026-2027` create event A ending in the past (e.g. 2026-10-01, one shift) and event B in the future (one shift, capacity 2). As guest, `/events`: only B is listed.
2. Guest signs up on B's shift → their name appears on the shift. As admin, `/tasks`: no new STAFF_SHIFT task for the guest. Guest withdraws → name gone.
3. Guest: no Unavailable / Available again button on any shift, desktop and phone width. Member (DEPARTMENT fixture): the Unavailable button is still there.
4. Guest downloads B's PDF → file downloads. Paste A's PDF URL (`/api/events/<A id>/pdf`) → 404 JSON.
5. As admin, make the seeded closed edition the default → guest sees its non-expired events read-only: no Sign up / Withdraw. Restore `2026-2027` as default afterwards.
6. As admin, unset the default edition (no edition with `isDefault`) → guest `/events` shows "No events open yet". Restore the default afterwards.
7. Guest lockdown kit from README > Verification kit still holds.

### Not in this step (report, do not fix)

- The PDF route's outer `catch` turns any `redirect()` from `getCurrentUserAccess` (no session) into a 400 JSON. Pre-existing, not guest-specific; mention it in the execute report.

## Verify results (execute, 2026-11-04)

- Gates: build, lint (0 errors, 2 pre-existing warnings), check:design, check:i18n (1028 keys), `npm test` 29 files / 324 tests — all pass, no flaky reruns.
- Manual pass (1–7): not run by the execute session; left to the user.
- No deviations from the Design. Not fixed (pre-existing, not guest-specific): the PDF route's outer `catch` turns a `redirect()` from `getCurrentUserAccess` (no session) into a 400 JSON.
- Tagged `v0.69.0` (`requires-migration`: covers Step 1's migration, which was untagged). Local only, not pushed.
