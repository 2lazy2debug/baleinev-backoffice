# 110 — Events app improvements

Five improvements to the Events app: expired events, a staffing log, timeless
shifts, quarter-hour shift boundaries, and a rewritten schedule PDF.

**Read this file and `CLAUDE.md`. Nothing else, until a task tells you to.**
Everything you need about the existing code is reproduced below — the models,
the file paths, the line ranges. Do not go exploring; that is the whole point of
writing it down here.

| # | Task | Migration | Depends on |
|---|---|---|---|
| 1 | [Expired events](#task-1--expired-events) | no | — |
| 2 | [Staffing log](#task-2--staffing-log) | **yes** | — |
| 3 | [Timeless shifts](#task-3--timeless-shifts) | **yes** | — |
| 4 | [Quarter-hour shifts](#task-4--quarter-hour-shifts) | no | 3 |
| 5 | [Schedule PDF rewrite](#task-5--schedule-pdf-rewrite) | no | 3 |

Do them **in order**. 3 and 4 touch the same two files, and 5 has to draw what 3
adds.

---

## Where the files are

**The Next.js app dir is `app/app/`.** The project root is `app/` (that is where
`package.json` and every `npm` command live), and the router lives one level
below it. So the same route is written two ways depending on where you stand:

| From | Path |
|---|---|
| repo root | `app/app/(app)/events/client.tsx` |
| `app/` (where you run npm) | `app/(app)/events/client.tsx` |

Every path in this plan is **relative to `app/`**. Quote them in shell commands —
`(app)` is a glob in zsh.

### The Events app — all of it

```
app/(app)/events/
  page.tsx                  116  server: loads the edition + its events, renders PageHeader
  client.tsx                581  the whole interactive list — events, days, shifts, signup
  actions.ts                606  every server action (see the map below)
  shift-fields.tsx           99  the 4 shift inputs + useShiftOverlap, shared by add & edit
  add-shift-form.tsx         53  admin's "add a shift" row under a day
  edit-shift-form.tsx        86  admin's inline shift editor
  create-event-modal.tsx    172  the header create modal
  duplicate-day-modal.tsx   133
  event-info-modal.tsx      133  the markdown info button (plan 109)
  info-actions.test.ts       70  the local test pattern — copy its shape
  settings/                       event types (page.tsx, client.tsx, create-button.tsx)
app/api/events/[eventId]/pdf/route.ts   98   puppeteer wrapper
lib/shift-schedule-pdf.ts              214   builds the HTML the PDF is printed from
```

### `actions.ts` — the map, so you never grep it

| Lines | What |
|---|---|
| 20–109 | guards: `requireWritableEvent`, `requireWritableEventDay`, `requireWritableShift`, `assertEventDatesWithinEdition` |
| 110–176 | event types (create / update / delete) |
| 177–299 | events (create / update / `updateEventInfoAction` / delete) |
| 300–382 | `toggleEventDayOffAction`, `duplicateEventDayShiftsAction` |
| 383–477 | `addShiftAction`, `updateShiftAction`, `deleteShiftAction` |
| **478–606** | **the staffing four**: `signUpForShiftAction`, `withdrawFromShiftAction`, `adminAssignUserToShiftAction`, and the admin removal beside it |

Every admin action opens with `await requireAdmin()`; writes go through
`resolveWritableEditionId()` / `requireWritableEdition()` from
`lib/edition-context.ts`, which is what makes a closed edition read-only. Never
re-implement either check.

### The models (from `prisma/schema.prisma`, lines 521–595)

```prisma
model Event {
  id, editionId, eventTypeId, costCenterId?, name
  startDate DateTime, endDate DateTime, notes?, info?   // info = plan 109's markdown
  days EventDay[]
  @@index([editionId, startDate])
}
model EventDay {
  id, eventId, date DateTime @db.Date, isOff Boolean @default(false)
  shifts EventShift[]
  @@unique([eventId, date])
}
model EventShift {
  id, eventDayId
  startTime String     // "HH:MM"
  endTime   String     // "HH:MM" — <= startTime means it crosses midnight
  role String?, capacity Int @default(1)
  assignments StaffAssignment[]
}
model StaffAssignment {
  id, shiftId, userId, createdAt
  @@unique([shiftId, userId])
  // shift onDelete: Cascade — deleting a shift deletes who was on it
}
```

`EventShift` has **no `createdBy` and no history**. Task 2 is what adds it.

### Everything else you will touch

| Need | Where |
|---|---|
| UI copy | `lib/i18n-dictionaries.ts` — `en.events` at **812–887**, `fr.events` at **1840–1915**. Both, always. |
| Nav | `components/app-shell.tsx:78` and `:105` — `/events` is already there. **Task 2 adds no nav entry** (see below). |
| Migrations | `prisma/migrations/<YYYYMMDDHHMMSS>_<snake_name>/migration.sql` — latest is `20260912120000_pos_cell_color` |
| Docs | `docs/business-processes.md` (append a new numbered section, renumber nothing), `docs/database.md`, `docs/file-structure.md` |

---

## Ground rules

1. **Migrations are hand-written SQL.** This repo does **not** run
   `prisma migrate dev`. Edit `prisma/schema.prisma`, run `npx prisma generate`
   from `app/`, then write the `migration.sql` yourself with comments explaining
   *why*. Tasks 2 and 3 each add one.
2. **Server actions throw plain English sentences** (`throw new Error("A shift
   must end after it starts.")`) — that is the convention already in
   `actions.ts`. Only *UI copy* goes through the dictionaries, in **both** `en`
   and `fr`.
3. **Reuse before you write.** Every surface and control is in `components/ui/`.
   `CLAUDE.md` is not advice — no hardcoded colour, no arbitrary radius, no pixel
   font size, no hand-sized control. `npm run check:design` must pass.
4. **One commit per task.** `git add . && git commit -am "<what you did>"`. No
   branches.
5. **`docs/` is updated inside the task that changes the flow**, never after.
6. **Checks before each commit**, run from `app/`: `npm run build`,
   `npm run lint`, `npm run check:design`, `npm run check:i18n`, `npm test`.
   There is no CI — these are the whole safety net.
7. **A hidden button is not a rule.** Anything Task 1 or 3 stops the UI from
   offering must also be refused by the server action.

---

## Keeping the context small

This plan is written to be executed without reading the codebase. Hold to that:

- **Open only the files a task lists.** They are listed per task, with line
  ranges where the file is long.
- **Never read `lib/i18n-dictionaries.ts` whole** (2065 lines). Jump to the four
  line anchors above and edit in place.
- **Never read `prisma/schema.prisma` whole** (1100+ lines). The models are
  above; `sed -n '521,595p'` if you need the exact syntax back.
- **Never `find` or `ls -R` the repo.** The paths are above. If something is
  genuinely missing from this plan, one targeted `grep -n` is the answer, not a
  sweep.
- **Do not re-read a file you just edited** to check the edit landed. The edit
  tool errors when it does not.
- **Do not read the other tasks' sections** while working one task. Each is
  self-contained on purpose.

### Delegating to subagents

The *checking* is what does not fit in one head, and checking is where context is
dead weight. **Delegate these to Haiku**, and ask for a verdict plus a
`file:line` list — never a file dump:

- running `npm run build`, `npm run lint`, `npm run check:design`,
  `npm run check:i18n` and `npm test` from `app/`, reporting failures verbatim
  with `file:line`;
- grep sweeps — "list every `file:line` still referencing `startTime` under
  `app/(app)/events/`";
- dictionary parity — "compare `en.events` (lines 812–887) with `fr.events`
  (lines 1840–1915) in `app/lib/i18n-dictionaries.ts`, list keys present in one
  and missing from the other".

Run independent checks in parallel, in one message.

**Never delegate:** design decisions, modal and header shapes, anything that has
to honour `CLAUDE.md`, the migration SQL, and the release. A subagent starts cold
and has not read the design system.

A subagent's report is not shown to the user — relay what matters yourself.

---

## Task 1 — Expired events

An event is **expired** once its last shift has finished. Expired events keep
their place in the ordering but sit **below** every active one, render collapsed,
greyed, and no longer take signups.

**Derive it, never store it.** A stored flag needs a cron to flip it; a computed
one is right the moment anyone looks.

Compute it **on the server**, in `page.tsx`, and pass a boolean per event to the
client — a client-side `Date.now()` renders differently before and after
hydration.

The end of the last shift:

- for each day where `isOff` is false, for each shift: `endsAt` = the day's date
  at `endTime`; **if `endTime <= startTime` the shift crosses midnight, so add a
  day**;
- the event's end is the max across all of them;
- an event with **no shifts at all** falls back to `endDate`, end of day;
- compare in **UTC**, building the instant from the day's UTC year/month/date —
  `EventDay.date` is `@db.Date` and the app already formats with
  `timeZone: "UTC"` (`lib/stock.ts:46`). Do not introduce a local-time read here.

Then:

- **Ordering** — keep the query's `orderBy: { startDate: "asc" }` and split the
  array into active-then-expired, each keeping its existing order. One `sort` on
  a stable key, or two `filter`s concatenated.
- **Collapsed by default** — `client.tsx:160` already holds
  `collapsedEventIds` as a `useState<ReadonlySet<string>>(new Set())`. Seed it
  from the expired ids with the lazy initialiser: `useState(() => new Set(expiredIds))`.
  The existing toggle at `:165` then works unchanged, so an expired event can
  still be opened by hand.
- **Greyed** — `opacity-60` on the event's `<Panel>` (`client.tsx:289`), via the
  `cn` already imported there. This is state, not colour: do not add a token and
  do not hardcode a hex.
- **Read-only** — hide the signup and withdraw forms (`client.tsx:482–495`).
  **Admins keep editing and deleting** — fixing a past schedule is exactly what
  an admin is for; the lock is on *joining and leaving*, which is what the
  request means by "read-only to users". If that is wrong, it is a one-line flip
  in the guard.
  `client.tsx:148` already holds `canManageEvents = isAdmin && !isReadOnly` —
  that is the **closed-edition** lock. Expiry is a second, independent gate:
  compose with it, do not fold the two into one flag. A closed edition and a
  finished event are different reasons, they gate different controls, and
  collapsing them would silently lock admins out of past events.
- **Server side** — the same rule in `signUpForShiftAction` and
  `withdrawFromShiftAction` (`actions.ts:478–561`). Add one guard next to the
  existing ones at the top of the file (`assertEventNotExpired(shiftId)`),
  reusing the same "end of last shift" helper. Put the helper in
  `lib/events.ts` so `page.tsx` and `actions.ts` share one implementation — this
  is the rule and it must not be written twice.

**Copy:** new keys in both `events` blocks for the expired badge. Use
`<Badge tone="neutral">`, next to the existing `isOff` badge at `client.tsx:377`.

**Files:** `lib/events.ts` (new), `app/(app)/events/page.tsx` (`:29–46`, `:106`),
`app/(app)/events/client.tsx` (`:142–180`, `:270–300`, `:369–545`),
`app/(app)/events/actions.ts` (`:20–109`, `:478–561`),
`lib/i18n-dictionaries.ts` (the four anchors).

**Test:** `lib/events.test.ts` — the midnight-crossing shift, the no-shift
fallback, an event whose last day is `isOff`. This is pure function logic and
exactly what `docs/testing.md` asks for.

**Tag directive:** `non-breaking`.

---

## Task 2 — Staffing log

An admin-only log of who put whom on a shift, and when. Same shape as the stock
log — copy it rather than inventing a second one.

**The reference is `/stock/history`:** `app/(app)/stock/history/page.tsx` (81
lines) and `app/(app)/stock/history/client.tsx` (212 lines). Read both once. They
give you the whole pattern: a `MOVEMENT_LIMIT = 300` cap, timestamps formatted
**on the server** with `Intl.DateTimeFormat` (a browser in another timezone would
otherwise render different markup than the server), a `<Panel flushOnMobile>` +
`<PanelHeader flushOnMobile>` frame, a `<Table desktopOnly>` above `sm` and a
`<CardletList>` below it fed by **the same array**, and `<Select size="sm">`
filters in the header row.

**Route:** `app/(app)/events/logs/` — `page.tsx` + `client.tsx`. Reached by a
link in the events `PageHeader actions`, next to the existing settings
`IconButton` (`page.tsx:67–103`), admin-gated the same way. **No nav entry** —
`/stock/history` has none either, and which apps get a bar slot is the user's
call, not a plan's.

**Model** — `EventStaffLog`, and the shape matters:

```prisma
enum EventStaffAction { SIGNUP  WITHDRAW  ASSIGN  UNASSIGN }

model EventStaffLog {
  id        String   @id @default(cuid())
  eventId   String?                 // SetNull
  shiftId   String?                 // SetNull
  actorId   String?                 // who did it — SetNull
  subjectId String?                 // who it was done to — SetNull
  action    EventStaffAction
  createdAt DateTime @default(now())
  // Denormalised so the line still reads after the rows it points at are gone.
  eventName   String
  shiftLabel  String                // "Sat 12 Apr · 18:00–22:00 · Bar"
  actorName   String
  subjectName String
  @@index([eventId, createdAt])
  @@index([createdAt])
}
```

The denormalised names are not redundancy, they are the point:
`StaffAssignment` cascades away when a shift is deleted, and
`StockMovement` (`schema.prisma:874`) already solves this exact problem the same
way — *"the history of a thing that is gone still has to read"*. Every relation
is `onDelete: SetNull` for the same reason.

**Writes** — one call in each of the staffing four (`actions.ts:478–606`), inside
the same transaction as the assignment write where there is one. A signup logs
actor == subject; an admin assignment logs actor = the admin, subject = the
staffer.

**Columns:** when · action · who was affected · who did it · event · shift.
Filter by event in the header `Select`. Admin-only — `requireAdmin()` in the page
and the log is the one screen where that is the whole access rule.

**Files:** `prisma/schema.prisma`, a new `prisma/migrations/…_event_staff_log/`,
`app/(app)/events/logs/page.tsx` (new), `app/(app)/events/logs/client.tsx` (new),
`app/(app)/events/actions.ts` (`:478–606`), `app/(app)/events/page.tsx`
(`:63–103`), `lib/i18n-dictionaries.ts`, `docs/database.md`,
`docs/file-structure.md`, `docs/business-processes.md`.

**Tag directive:** `requires-migration`.

---

## Task 3 — Timeless shifts

A shift that has no hours — "renfort", "surplus". Admin ticks a box when adding
or editing; the shift sorts to the **end** of its day's list.

**Schema:** add `noTime Boolean @default(false)` to `EventShift`, and make
`startTime` / `endTime` **nullable** (`String?`). Storing `"00:00"` for a shift
that has no time is a lie the rest of the app would have to keep checking; null
is the truth and the compiler then finds every reader for you.

The readers are exactly these, and there are no others:

| File | What changes |
|---|---|
| `page.tsx:36` | `orderBy: { startTime: "asc" }` → `orderBy: [{ noTime: "asc" }, { startTime: "asc" }]` — `false` sorts before `true`, so timeless lands last |
| `shift-fields.tsx:27–39` | `useShiftOverlap` — a timeless shift never overlaps anything; bail before `toMinutes` |
| `shift-fields.tsx:58–98` | add the `<Checkbox>`; disable both time inputs when it is ticked |
| `actions.ts:383–460` | `addShiftAction` / `updateShiftAction` — read `noTime` from the FormData, skip the `endTime <= startTime` guard when set, and require both times when not |
| `client.tsx:420–545` | render the role instead of a time range for a timeless shift |
| `api/events/[eventId]/pdf/route.ts:23–41` | select `noTime` |
| `lib/shift-schedule-pdf.ts` | Task 5 handles it |
| `lib/events.ts` | Task 1's helper — a timeless shift has no end and must **not** hold an event open |

The migration is two `ALTER TABLE`s: add the column with a default, drop the two
`NOT NULL`s. Existing rows keep their times and `noTime = false`, so nothing
changes for data already in there.

**UI:** `<Checkbox>` from `components/ui`, inside `ShiftFields` so the add row and
the inline editor both get it from one edit — that is what the component's own
doc comment says it is for. It is already inside admin-only forms, so it needs no
gating of its own.

**Files:** the table above, plus `lib/i18n-dictionaries.ts` and
`docs/database.md`.

**Test:** extend the shift-action tests — a timeless shift with no times is
accepted, a timed one with a missing time is refused.

**Tag directive:** `requires-migration`.

---

## Task 4 — Quarter-hour shifts

Shift times land on `:00`, `:15`, `:30`, `:45`.

- **Client:** `step={900}` on both `<Input type="time">` in
  `shift-fields.tsx:70–88`. The browser's own time picker then steps in quarters.
- **Server:** validate in `addShiftAction` and `updateShiftAction`
  (`actions.ts:383–460`) — parse to minutes, refuse `minutes % 15 !== 0` with a
  plain English sentence. `step` is a hint, not a guarantee; a hidden button is
  not a rule and neither is a form attribute.
- Skip both when `noTime` is set (Task 3).
- **Do not backfill.** Existing shifts may sit off the grid and rewriting a real
  past schedule to satisfy a new rule is worse than leaving it. The rule applies
  to writes from now on.

**Test:** this is the `*.test.ts`-next-to-the-code case `CLAUDE.md` names.
`app/(app)/events/info-actions.test.ts` is the local pattern — `08:07` refused,
`08:15` accepted, timeless accepted with no times at all.

**Files:** `app/(app)/events/shift-fields.tsx`, `app/(app)/events/actions.ts`,
a shift-actions test, `lib/i18n-dictionaries.ts` if the refusal needs UI copy.

**Tag directive:** `non-breaking`.

---

## Task 5 — Schedule PDF rewrite

`lib/shift-schedule-pdf.ts` (214 lines) builds an HTML document that
`app/api/events/[eventId]/pdf/route.ts` prints through puppeteer. **Read the
renderer once, whole — it is the task.** The route needs only its `select`
widened.

Today: one column **per shift** across every day, rows are people, one table, one
page, and the role legend is in the page footer (`buildFooterHtml`, `:202`).

Target:

1. **One page per day.** Each day becomes its own `<section>` with
   `page-break-after: always` on all but the last. Puppeteer honours CSS page
   breaks — no per-day PDF concatenation.
2. **The X axis is time, not shift.** Build a continuous **15-minute slot grid**
   per day, from the day's earliest `startTime` to its latest `endTime`. Column
   count comes from the clock, and two shifts at the same hour share the same
   columns instead of getting one each.
3. **Shift type is a colour in the grid.** Keep the existing
   `roleColors` map (`:82–87`, `CATEGORICAL_PALETTE`) — it already assigns a
   stable colour per role. A person's cell is filled with the colour of the shift
   covering that slot. The role stops being a column and becomes a fill.
4. **Legend above the grid, first page only.** Move what `buildFooterHtml` draws
   into the body, at the top of the first day's section. Keep the footer for page
   numbering, or drop `footerHtml` from the route if it ends up empty.
5. **Overnight shifts stay on their day's page.** A shift with
   `endTime <= startTime` runs past midnight; extend that day's grid past 24:00
   rather than spilling onto the next page. Label those slots `00:15`, `01:00` —
   they belong to the night of the day printed at the top.
6. **Timeless shifts** (Task 3) have no place on a time axis. List them under
   that day's grid as a small block: role, capacity, who is on it.

Practical notes: A4 landscape with 8mm margins is set in the route
(`route.ts:66–71`). An 08:00–02:00 day is 72 quarter-hour columns — use
`table-layout: fixed`, hour labels on the hour only (quarters get a tick, not a
number), and let the row height carry the name. Keep `escapeHtml` (`:41`) on
every interpolated string.

**Files:** `lib/shift-schedule-pdf.ts` (the rewrite),
`app/api/events/[eventId]/pdf/route.ts` (`:23–41` select, `:53–56` copy),
`lib/i18n-dictionaries.ts` (legend heading, the timeless block's heading).

**Verify by eye:** the PDF is the one thing tests will not catch. Generate one
for a seeded multi-day event and open it. `SEED_DEV_FIXTURES=1 npm run db:seed`
puts usable data in the local database.

**Tag directive:** `non-breaking`.

---

## Marking a task done

A task is done when it is implemented, the five checks are green, and it is
committed. Tick its row in the table at the top. **No tag, no push** — the
release is once, at the end.

## Release — after Task 5, and only then

Never hardcode a version. Read the latest tag and go one **minor** step up —
these are features:

```bash
cd /home/mcabras/Developer/baleinev-backoffice
git tag --sort=-v:refname | head -1        # e.g. v0.41.0  ->  NEXT = v0.42.0
```

1. Set `app/package.json` `"version"` to `NEXT` without the leading `v`.
2. `git commit -am "chore(release): bump version to <NEXT without v>"`
3. `git tag -a <NEXT> -m "requires-migration"` — Tasks 2 and 3 each add a
   `migration.sql`, so the chain's tag is **`requires-migration`**. Tagging a
   schema change `non-breaking` deploys code against an unmigrated database.
4. `git push origin main --follow-tags`

**Do not monitor the deployment.** The updater picks the tag up within about two
minutes, snapshots first, health-checks and rolls back on its own. Do not poll
`journalctl`, do not ssh to the box, do not loop on `/api/health`. Push and
report what you shipped. The full tag vocabulary is in `docs/production.md`.

## When the chain is done

`git mv docs/plans/110-event-app-improvements.md docs/plans/done/`, keeping the
name, and commit that move on its own:
`git commit -m "docs(plans): move 110 to done"`.
