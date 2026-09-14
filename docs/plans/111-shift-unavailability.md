# 111 — Shift unavailability

A shift currently has one answer: *yes*. You sign up, or you are silent — and
silence reads the same whether someone declined or never opened the page. This
plan adds the second answer: **unavailable**, picked per shift, private to the
person who picked it and visible to admins, so an admin can finally tell *no*
apart from *no answer*.

**Read this file and `CLAUDE.md`. Nothing else, until a task tells you to.**
Everything you need about the existing code is reproduced below — the models,
the file paths, the line ranges, the copy keys. Do not go exploring; that is the
whole point of writing it down here.

| # | Task | Migration | Depends on |
|---|---|---|---|
| 1 | [The model and the actions](#task-1--the-model-and-the-actions) | **yes** | — |
| 2 | [The shift row](#task-2--the-shift-row) | no | 1 |
| 3 | [Who answered](#task-3--who-answered) | no | 2 |
| 4 | [The staffing log and the docs](#task-4--the-staffing-log-and-the-docs) | no | 1 |

Do them **in order**, one commit each. 2 and 3 both edit `client.tsx` and
`page.tsx`; 3 draws what 2 loads.

This chain is run **unattended** and ends with a push to production. Read
[Release](#release--after-task-4-and-only-then) before you start, so nothing in
it is a surprise at the end.

---

## Where the files are

**The Next.js app dir is `app/app/`.** The project root is `app/` (that is where
`package.json` and every `npm` command live), and the router lives one level
below it. Every path in this plan is **relative to `app/`**. Quote them in shell
commands — `(app)` is a glob in zsh.

```
app/(app)/events/
  page.tsx                  138  server: loads the edition + its events, renders PageHeader
  client.tsx                602  the whole interactive list — events, days, shifts, signup
  actions.ts                773  every server action (map below)
  event-info-modal.tsx      133  the per-event header modal — copy its shape in Task 3
  staffing-actions.test.ts  195  the staffing test pattern — copy its shape in Task 1
  logs/page.tsx              66  admin-only staffing log, server
  logs/client.tsx           164  the log table
lib/i18n-dictionaries.ts        en `events` block 812–909, fr `events` block 1862–1959
prisma/schema.prisma            models at 534–640
```

### `actions.ts` — the map, so you never grep it

| Lines | What |
|---|---|
| 21–143 | guards: `requireWritableEvent`, `requireWritableEventDay`, `requireWritableShift` (`:99`), `assertEventNotExpired` (`:117`) |
| 149–201 | event types |
| 216–337 | events (create / update / `updateEventInfoAction` / delete) |
| 339–422 | `toggleEventDayOffAction`, `duplicateEventDayShiftsAction` |
| 424–538 | `addShiftAction`, `updateShiftAction`, `deleteShiftAction` |
| 544–555 | `shiftLabelFor` — the `EventStaffLog.shiftLabel` snapshot |
| 562–593 | `writeStaffLog(tx, params)` — one log row, inside the caller's transaction |
| **599–773** | **the staffing three**: `signUpForShiftAction` (`:599`), `withdrawFromShiftAction` (`:658`), `adminAssignUserToShiftAction` (`:716`) |

Every admin action opens with `await requireAdmin()`; a self-service action
opens with `await getCurrentUserAccess()` (which returns `{ id, userName, role }`).
Writes go through `requireWritableShift()`, which is what makes a closed edition
read-only. `assertEventNotExpired()` is what stops a stale tab acting on an event
that already happened. Never re-implement either check.

### The models you are touching (`prisma/schema.prisma`)

```prisma
model EventShift {                      // :572
  id, eventDayId, startTime?, endTime?, noTime, role?, capacity
  eventDay    EventDay          @relation(..., onDelete: Cascade)
  assignments StaffAssignment[]
  staffLogs   EventStaffLog[]
}

model StaffAssignment {                 // :591
  id, shiftId, userId, createdAt
  shift EventShift @relation(..., onDelete: Cascade)
  user  User       @relation(..., onDelete: Cascade)
  task  Task?
  @@unique([shiftId, userId])
}

enum EventStaffAction { SIGNUP WITHDRAW ASSIGN UNASSIGN }   // :584
```

`User` carries `staffAssignments StaffAssignment[]` at `:154` and the two named
log relations at `:169–170`.

---

## Task 1 — The model and the actions

### The shape

A new model, not a column on `StaffAssignment`. An assignment means *this person
is on this shift*: it counts against `capacity`, it anchors a `STAFF_SHIFT`
`Task`, and it is what the schedule PDF prints. An "unavailable" assignment
would be a row that has to be excluded from every one of those, forever, by
every future reader. Unavailability is a separate fact, so it gets its own table.

Add to `prisma/schema.prisma`, next to `StaffAssignment`:

```prisma
/// "Not me, not this shift." The other answer to a shift — the one that used to
/// be indistinguishable from silence. Private: a reader only ever sees their
/// own rows, admins see everyone's (see the query in `events/page.tsx`).
/// Deliberately not a status on `StaffAssignment` — an assignment consumes
/// capacity, anchors a STAFF_SHIFT task and prints on the schedule PDF, and
/// none of that is true of a decline.
model ShiftUnavailability {
  id        String   @id @default(cuid())
  shiftId   String
  userId    String
  createdAt DateTime @default(now())

  shift EventShift @relation(fields: [shiftId], references: [id], onDelete: Cascade)
  user  User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([shiftId, userId])
  @@index([userId])
}
```

Add the back-relations: `unavailabilities ShiftUnavailability[]` on `EventShift`
(`:586–588`, beside `assignments`) and on `User` (`:154`, beside
`staffAssignments`). Extend the enum at `:584` to
`{ SIGNUP WITHDRAW ASSIGN UNASSIGN UNAVAILABLE AVAILABLE }`.

### The migration

Migrations in this repo are **hand-written** with a round dated directory name —
see `prisma/migrations/20260913090000_event_staff_log/migration.sql`. Create
`prisma/migrations/20260914090000_shift_unavailability/migration.sql` yourself;
do not run `prisma migrate dev` and let it invent a name.

```sql
ALTER TYPE "EventStaffAction" ADD VALUE 'UNAVAILABLE';
ALTER TYPE "EventStaffAction" ADD VALUE 'AVAILABLE';

CREATE TABLE "ShiftUnavailability" ( ... );
CREATE UNIQUE INDEX "ShiftUnavailability_shiftId_userId_key" ...;
CREATE INDEX "ShiftUnavailability_userId_idx" ...;
ALTER TABLE "ShiftUnavailability" ADD CONSTRAINT ... FOREIGN KEY ("shiftId") REFERENCES "EventShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftUnavailability" ADD CONSTRAINT ... FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

The two `ADD VALUE` statements go **first and alone at the top**. Postgres lets a
transaction add an enum value but not *use* it in the same transaction, and
`prisma migrate deploy` runs each migration file in one — nothing else in this
file uses the new values, which is what keeps it legal. Do not write an
`INSERT` or a `DEFAULT` mentioning `'UNAVAILABLE'` here.

Then `npm run db:push` is **not** the move — run `npx prisma migrate deploy`
against the local database and `npm run db:generate`, so the local DB and the
generated client match what production will get.

### The two new actions

Append to `actions.ts`, after `adminAssignUserToShiftAction` (`:773`).

```ts
export async function markUnavailableForShiftAction(_prevState: ActionState, formData: FormData): Promise<ActionState>
export async function clearUnavailableForShiftAction(_prevState: ActionState, formData: FormData): Promise<ActionState>
```

Both take `shiftId`, both act on **`access.id` only** — there is no admin
override here and no `userId` field to read. An admin may put someone on a shift
over their stated unavailability (that is what `adminAssignUserToShiftAction`
does, below); an admin may not *declare* someone unavailable, because that is a
statement only the person can make. Do not add a `userId` parameter "for
symmetry with `withdrawFromShiftAction`".

Both open with `getCurrentUserAccess()`, then `requireWritableShift(shiftId)`,
then `assertEventNotExpired(shiftId)` — answering a finished event is as
meaningless as signing up for one.

`markUnavailableForShiftAction`:
- Load the shift the way `signUpForShiftAction` does (`:607–613`), including
  `assignments` and `eventDay.event`.
- If the user already has a `StaffAssignment` on it, throw
  `new Error("Withdraw from this shift first.")`. Two contradictory answers must
  not be storable; the UI at Task 2 never offers the button in that state, and
  this is the stale-tab backstop.
- If a `ShiftUnavailability` already exists for `(shiftId, access.id)`, return
  `{ error: null }` — idempotent, exactly like the already-signed-up early
  return at `:620`.
- Create the row and `writeStaffLog(tx, { action: EventStaffAction.UNAVAILABLE, shift, actorId/actorName/subjectId/subjectName all = access })` in **one
  `prisma.$transaction`**, the same shape as `:622–635`.
- No `createUserTask`. A decline is not a commitment, so it does not belong on
  anyone's task list.
- `revalidatePath("/events")`. Not `/tasks` — nothing there moved.

`clearUnavailableForShiftAction`: delete the row if present (return
`{ error: null }` if absent), log `EventStaffAction.AVAILABLE` in the same
transaction, `revalidatePath("/events")`.

### The two existing actions that have to clear it

Saying yes overrides an earlier no, and it says so in one log line — do **not**
also write an `AVAILABLE` row alongside the `SIGNUP`.

- `signUpForShiftAction` (`:622–635`): inside the existing transaction, add
  `await tx.shiftUnavailability.deleteMany({ where: { shiftId, userId: access.id } })`.
  `deleteMany`, not `delete` — it must not throw when there is no row, which is
  the common case.
- `adminAssignUserToShiftAction` (`:741–752`): the same `deleteMany` for
  `userId`, inside its transaction. An admin assigning someone who declined is
  allowed; Task 2 makes sure the admin can see they declined before doing it.

`withdrawFromShiftAction` changes **not at all**. Leaving a shift is not the same
as declining it, and silently converting one into the other would put words in
someone's mouth.

### Tests

`app/(app)/events/staffing-actions.test.ts` (195 lines) is the pattern — it
mocks `@/lib/access`, `@/lib/db`, `@/lib/tasks`, `@/lib/edition-context` and
`next/cache` at the top, imports the actions with a top-level `await import`,
and asserts on the `tx` spies. Its `shiftFixture()` helper and its `DAY =
new Date("2099-04-12...")` (far future, so `isEventExpired` never trips) are
what you want. Add `shiftUnavailability: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() }`
to both the `tx` and `prisma` mock objects.

Cover, in a new `unavailability-actions.test.ts` beside it:
1. marking unavailable creates the row **and** an `UNAVAILABLE` log row in the
   same `tx`
2. marking unavailable while assigned returns
   `{ error: "Withdraw from this shift first." }` and writes nothing
3. marking unavailable twice is idempotent — second call creates nothing
4. `clearUnavailableForShiftAction` deletes and logs `AVAILABLE`
5. `signUpForShiftAction` calls `tx.shiftUnavailability.deleteMany` and still
   logs exactly one row, `SIGNUP`
6. `adminAssignUserToShiftAction` likewise

### Docs

`docs/database.md`: add a `### ShiftUnavailability` section after
`### StaffAssignment` (which ends at `:440`), in the same table format, and
update the `action` row of the `EventStaffLog` table (`:452`) to list all six
enum values.

**Files:** `prisma/schema.prisma`,
`prisma/migrations/20260914090000_shift_unavailability/migration.sql`,
`app/(app)/events/actions.ts`,
`app/(app)/events/unavailability-actions.test.ts`, `docs/database.md`.

---

## Task 2 — The shift row

### The privacy rule, which is the whole feature

> The users won't see others' unavailability but the admin will.

Enforce that **in the Prisma query in `page.tsx`, not in JSX**. A
`{isAdmin ? … : null}` in `client.tsx` still ships every name to every reader's
browser inside the RSC payload — the names would be one View-Source away. The
non-admin query must never load a row that is not the reader's own.

In `app/(app)/events/page.tsx`, the events query selects each day's `shifts` at
`:36–44`, with `include: { assignments: { include: { user: … } } }` at `:39–41`.
Add a sibling to `assignments`:

```ts
unavailabilities: {
  // The privacy line. A reader loads only their own row; an admin loads
  // everyone's, because telling "no" apart from "no answer" is their job.
  where: isAdmin ? undefined : { userId: access.id },
  select: { id: true, userId: true, user: { select: { id: true, name: true } } },
},
```

`access` and `isAdmin` are already in scope at `:17` and `:20`.

### What the row draws

`app/(app)/events/client.tsx`. Add `unavailabilities: UnavailabilityItem[]` to
`ShiftItem` (`:54–62`) and the matching type beside `AssignmentItem` (`:48–52`).
Add two `useActionState` hooks beside the existing ones (`:146–150`) and their
`<FormError>` lines beside `:271–274`.

Inside the shift row's action column (`:496–511`), where the row currently reads
"signed → Withdraw, else not full → Sign up, else nothing":

- Compute `const unavailable = shift.unavailabilities.some((u) => u.userId === accessId)`
  next to `const signed = …` (`:430`).
- When `signed`: **Withdraw only**, exactly as today. No unavailability button —
  you cannot be on a shift and unavailable for it, and Task 1's server guard says
  so too.
- When `unavailable`: a single `<Button variant="secondary" size="sm">` reading
  `copy.availableAgain`, posting `clearUnavailableForShiftAction`. No Sign up
  button beside it — pick one gesture, and "I'm free after all" is the honest
  first step.
- Otherwise: **Sign up** (as today, when `!isFull`) **and**
  `<Button variant="ghost" size="sm">` reading `copy.unavailable`, posting
  `markUnavailableForShiftAction`. The ghost variant is deliberate: declining is
  the quieter of the two answers and must not compete with the primary.
- All of it stays inside the existing `isReadOnly || event.isExpired ? null :`
  guard at `:497`. A finished event takes no answers of either kind.
- Keep `className="w-full sm:w-auto"` on every button here, like `:500` and
  `:507` — the column stacks on a phone.

A shift that is full currently shows a reader nothing at all. It should still
show the unavailable button: a full shift can free up, and the admin still wants
the answer. So the "otherwise" branch above renders the unavailable button
unconditionally and the Sign up button only when `!isFull`.

### What the admin sees

Two additions, both admin-only, both already behind data the non-admin never
loaded:

1. **The chip strip.** `:556–568` draws the assigned staff as removable `<Chip>`s
   behind `canManageEvents && shift.assignments.length > 0`. Add a second strip
   below it, behind `isAdmin && shift.unavailabilities.length > 0`, with the
   label `copy.unavailableStaff` and plain `<Chip>`s — **no `ChipRemoveButton`**,
   because an admin does not get to retract someone's answer. Gate it on
   `isAdmin`, not `canManageEvents`: a closed edition is still readable, and this
   is reading.
2. **The assign dropdown.** `:518–525` lists every user not already assigned.
   Render an unavailable one as `{u.name} — {copy.unavailable}` so an admin
   cannot assign over a decline without seeing it. Leave them selectable and
   leave the ordering alone — Task 1 already made the assignment clear the row.

### Copy

`lib/i18n-dictionaries.ts`. Add to the `en` `events` block (after
`removeStaff: "Remove"`, `:854`) and the **same keys in the same order** in the
`fr` block (`:1862–1965`) — `npm run check:i18n` fails the build on a key that
exists in one locale only.

```
en: unavailable: "Unavailable",       fr: "Pas disponible",
    availableAgain: "Available again",    "Redevenir disponible",
    unavailableStaff: "Unavailable",      "Indisponibles",
```

Also add the three keys to the `EventsCopy` type in `client.tsx` (`:83–119`);
`page.tsx` passes `copy.events` wholesale at `:131`, so nothing else changes there.

Server-side error strings stay English literals thrown from `actions.ts` — that
is the existing convention (`"This shift is already at full capacity."`, `:616`).
Do not add dictionary keys for them.

**Files:** `app/(app)/events/page.tsx`, `app/(app)/events/client.tsx`,
`lib/i18n-dictionaries.ts`.

---

## Task 3 — Who answered

The point of the feature, from the admin's side: *who hasn't replied yet.*

### The definition, and it is the only one

A user has **answered** an event if they hold at least one `StaffAssignment` or
at least one `ShiftUnavailability` on any shift of any non-off day of it.
Otherwise they have not. The denominator is every user — `allUsers`, already
loaded admin-only at `page.tsx:51` and already passed to the client at `:132`.

Everything above is already in the client's props for an admin after Task 2, so
**this task adds no query.** Compute it in the component.

### The screen

A new `app/(app)/events/event-responses-modal.tsx`, client component, rendered
in the event header in `client.tsx` beside `<EventInfoModal>` (`:328–343`) and
only when `isAdmin`.

`event-info-modal.tsx` (133 lines) is the pattern to copy: an `<IconButton>`
that owns its own `useState` open flag and its own `<Modal>`, taking its copy as
a prop object. Use the `Users` icon from `lucide-react`. Give the button
`tone="neutral"` and `size="md"` to match its neighbours in that row.

Inside the modal, two groups:
- **`copy.responsesAnswered`** — each name with what they said, as muted
  secondary text: the shift count they are on, and/or that they marked
  themselves unavailable. A `<Badge tone="success">` for someone on at least one
  shift, `<Badge tone="warning">` for unavailable-only.
- **`copy.responsesNoAnswer`** — names only. This is the list the admin came
  for, so it goes **second and it is the one that reads as a list of actions** —
  do not bury it under a long "answered" column. If it is empty, draw
  `copy.responsesEveryoneAnswered` instead of an empty heading.

Plain stacked rows inside the modal, not a `<Table>` — this is two short name
lists, and `<Table>` would need a `<CardletList>` twin for phones to earn its
place. `<Modal size="lg">`, and the body is what scrolls.

### Copy

Same rule as Task 2 — both locales, same order.

```
en: responses: "Responses",                  fr: "Réponses",
    responsesAnswered: "Answered",               "Ont répondu",
    responsesNoAnswer: "No answer yet",          "Sans réponse",
    responsesShiftCount: "{count} shift(s)",     "{count} créneau(x)",
    responsesUnavailableOnly: "Unavailable",     "Indisponible",
    responsesEveryoneAnswered: "Everyone has answered.",  "Tout le monde a répondu.",
```

`{count}` interpolation follows `duplicateDayDescription` (`:867`) — a
`.replace("{count}", …)` at the call site, no helper.

**Files:** `app/(app)/events/event-responses-modal.tsx` (new),
`app/(app)/events/client.tsx`, `lib/i18n-dictionaries.ts`.

---

## Task 4 — The staffing log and the docs

The two new `EventStaffAction` values already reach the database from Task 1.
`/events/logs` has to render them, and right now it cannot: the two maps in
`app/(app)/events/logs/client.tsx` are `Record<EventStaffAction, …>` and
`npm run build` will fail on the missing keys the moment the enum grows. That is
the gate working — fill them in.

- `ACTION_TONE` (`:41–46`): `UNAVAILABLE: "error"`, `AVAILABLE: "info"`.
  `error` is rose, which is what a decline should read as at a glance in a
  column of green signups; it is the same tone `UNASSIGN` already uses.
- `actionLabel` (`:61–66`): `UNAVAILABLE: copy.logsActionUnavailable`,
  `AVAILABLE: copy.logsActionAvailable`.
- Copy, both locales, beside `logsActionUnassign` (`:905` / `:1955`):
  `logsActionUnavailable: "Marked unavailable"` / `"Indisponible"`,
  `logsActionAvailable: "Available again"` / `"Redevenu disponible"`.
- `logsSubtitle` (`:892` / `:1942`) currently reads "Every sign-up, withdrawal
  and assignment…". It is now also every decline — rewrite both locales.

Nothing else on that screen moves: the event filter, the 300-row cap in
`logs/page.tsx:13` and the denormalised name columns all work unchanged.

### Docs

`docs/business-processes.md` §14 "Events — the staffing log" (`:908–920`) opens
"Signing up, withdrawing, and an admin assigning or removing someone are the
four gestures…". Make it six, and add a short paragraph for the rule that is not
visible from the schema: **a reader sees only their own unavailability, an admin
sees everyone's, and that is enforced in the `page.tsx` query rather than in the
markup.** That is the sentence a future reader most needs and least can infer.

**Files:** `app/(app)/events/logs/client.tsx`, `lib/i18n-dictionaries.ts`,
`docs/business-processes.md`.

---

## Verifying, before the release

The five checks are the safety net; there is no CI. Run all five from `app/`:

```bash
npm run build && npm run lint && npm run check:design && npm run check:i18n && npm test
```

**`npm run lint` reports two pre-existing errors** — `copy: any` at
`app/(app)/tasks/client.tsx:51` and `:350`. They are not yours, they were there
before this plan, and they are the *only* lint output you may ship past. Any
third error is yours: fix it.

Then prove the privacy rule end to end, because no unit test covers a query
shape. The local database at `localhost:5434` holds no production data.

```bash
cd app
SEED_DEV_FIXTURES=1 npm run db:seed    # adds dev-department@baleinev.local / devpassword (DEPARTMENT)
npm run dev &
```

1. Sign in **as the admin** through the UI or a curl session, mark yourself
   unavailable on one shift.
2. Curl-login as the DEPARTMENT user: `GET /api/auth/csrf` for a token and
   cookie, then `POST /api/auth/callback/credentials` with `csrfToken`, `email`,
   `password`, `json=true`, reusing the cookie jar.
3. `curl` `/events` with that cookie and grep the HTML for the **admin's name**.
   It must not appear anywhere in the payload. If it does, the `where` clause in
   `page.tsx` is wrong or is being applied in the client instead — fix it before
   you go any further, because that is the requirement the whole plan exists for.
4. Kill the dev server and delete any scratch script you wrote. `git status`
   must show nothing untracked before you commit.

Note that `.claude/settings.json` shows as modified and is **not yours** — never
`git add .` or `git add -A`; stage explicit paths every time.

## Marking a task done

A task is done when it is implemented, the five checks are green, and it is
committed. Tick its row in the table at the top. **No tag, no push** — the
release is once, at the end.

## Release — after Task 4, and only then

Never hardcode a version. Read the latest tag and go one **minor** step up —
these are features:

```bash
cd /home/mcabras/Developer/baleinev-backoffice
git tag --sort=-v:refname | head -1        # e.g. v0.53.0  ->  NEXT = v0.54.0
```

1. Set `app/package.json` `"version"` to `NEXT` without the leading `v`.
2. `git commit -am "chore(release): bump version to <NEXT without v>"`
3. `git tag -a <NEXT> -m "requires-migration"` — Task 1 adds a `migration.sql`,
   so the tag is **`requires-migration`**. The tag message *is* the instruction
   the deploy updater reads; tagging a schema change `non-breaking` deploys code
   against an unmigrated database.
4. `git push origin main --follow-tags`

**Do not monitor the deployment.** The updater picks the tag up within about two
minutes, snapshots the database first, runs `prisma migrate deploy`,
health-checks and rolls back on its own. Do not poll `journalctl`, do not ssh to
the box, do not loop on `/api/health`. Push and report what you shipped. The full
tag vocabulary is in `docs/production.md`.

## When the chain is done

`git mv docs/plans/111-shift-unavailability.md docs/plans/done/`, keeping the
name, and commit that move on its own:
`git commit -m "docs(plans): move 111 to done"`. Then push it.
