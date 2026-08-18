# 002 — Editions: per-user selection, read-only closing, manual carry-over

Today an edition is a **global mode**. One row carries `isActive = true`, an admin flips it,
and every user in the app moves with it. Closing an edition force-creates its successor and
takes the closed one out of reach. This plan turns editions into something each user picks for
themselves, makes closing mean *frozen* rather than *gone*, and makes carrying data into a new
edition an explicit choice instead of a side effect of closing.

Five steps, each one a feature, each ending in an annotated minor tag that the box picks up on
its own (see [production.md](../../production.md)). Steps are ordered by dependency — 4 removes the
auto-carry-over that 3 replaces, and 5 drops the column 1 stops reading. **Do not reorder.**

**Keep output minimal.** Briefly say what changed and what is blocked. Do not narrate steps or
restate this file back at the reader.

---

## 0. Brief for whoever executes this

Written so this file is sufficient on its own, with no prior conversation.

**The repo.** `/home/mcabras/Developer/baleinev-backoffice`, branch `main`, remote
`git@github.com:2lazy2debug/baleinev-backoffice.git` — **public**, so never commit a secret.
The npm project is `app/`, *not* the repo root.

**Rules that bind this work.** `CLAUDE.md` at the repo root: no branches, one commit per
completed step, keep `.gitignore` current, never let `docs/` diverge from the implementation.
Its design-system rules apply to every UI change here — tokens from `app/app/globals.css`, the
tight radius scale, no hardcoded hex, and `npm run check:design` must pass before each commit.
Every user-facing string goes through `app/lib/i18n-dictionaries.ts` in **both** `en` and `fr`.

**How a release reaches production.** Push an annotated tag; a systemd timer on
`194.99.21.120` notices within ~2 minutes, snapshots, builds, health-checks, and rolls back on
failure. The tag message is the instruction — `requires-migration` runs
`prisma migrate deploy` first, `non-breaking` does not. **Never tag blind:** a schema change
tagged `non-breaking` deploys code against the old schema and throws at runtime, not at build
time. Watch with `journalctl -u blv-updater.service -f`.

**After every dependency change** regenerate the lockfile with
`npx npm@10.8.2 install --package-lock-only` — the box's npm is 10.8.2 and rejects newer
lockfile shapes with a confusing `Cannot find package`.

**Server access.** `ssh -i ~/.ssh/id_ed25519 root@leaddesk.cabras.ch`, then `sudo -iu blv`.
Production is on `v0.1.3`. The database is the `blv-db-1` container.

**If reality disagrees with this document, the document is wrong.** Re-survey, correct the file,
and commit that correction as part of the step.

---

## 1. What exists today

Surveyed 2026-08-18, against the repo at `v0.1.3` (identical to `main` for `app/`) and against
the live database.

### The global flag

`Edition.isActive` is read in **13 server components** and — via
`getActiveEditionId()` in [`lib/server-action-helpers.ts:21`](../../../app/lib/server-action-helpers.ts#L21)
— in **8 action files**. A ninth, [`events/actions.ts:371`](../../../app/app/(app)/events/actions.ts#L371),
carries a private duplicate of the same function.

| Reading it directly (`where: { isActive: true }`) |
| --- |
| `(app)/layout.tsx:14` · `(app)/page.tsx:22` · `budget/page.tsx:14` · `cost-centers/page.tsx:14` |
| `calendar/page.tsx:16` · `events/page.tsx:16` · `departments/page.tsx:7` · `expense-reports/page.tsx:15` |
| `invoices/page.tsx:17` · `journal/page.tsx:21` · `journal/[journalEntryId]/page.tsx:19` |
| `money-accounts/page.tsx:15` · `tasks/page.tsx:16` |

| Reading it through `getActiveEditionId()` |
| --- |
| `budget` · `calendar` · `cost-centers` · `departments` · `expense-reports` · `journal` · `money-accounts` · `tasks` |

Plus [`app/app/api/invoices/route.ts:82`](../../../app/app/api/invoices/route.ts#L82), which takes
`editionId` **from the request body** rather than from the active edition — the one write path
that already lets a caller name its own edition.

Not edition-scoped at all, and untouched by this plan: **passwords**, **users**, **templates**.
The password vault is deliberately edition-agnostic (`docs/database.md:76`) and must stay that
way.

### Live data

| Edition | `isActive` | `closedAt` | Departments | Money accounts |
| --- | --- | --- | --- | --- |
| 2025-2026 | false | null | 16 | 2 |
| 2026-2027 | **true** | null | 0 | 0 |

Three users: two `ADMIN`, one `DEPARTMENT`. The active edition holds no data, so the app is
currently pointing everybody at an empty year.

**Re-surveyed 2026-08-18 (before step 2).** The empty `2026-2027` has since been deleted on
production: one edition remains, `2025-2026`, `isDefault = true`, not closed, holding the 16
departments and both money accounts. Still three users. The problem the table described — everyone
pointed at an empty year — is gone; the row that caused it no longer exists.

### A bug this survey found

[`closeEditionAction`](../../../app/app/(app)/editions/actions.ts#L119) writes one opening journal
entry per money account, **all with `sequenceNumber: 0`**, into the edition it creates. But
`JournalEntry` carries `@@unique([editionId, sequenceNumber])`
([schema.prisma:246](../../../app/prisma/schema.prisma#L246)). The second account's insert violates
it, the transaction rolls back, and closing fails outright.

This is reachable on production right now: 2025-2026 has two accounts, both with a non-zero
balance (`Coffre` 135.07, `CompteCourant` 3922.92). **Closing 2025-2026 today would fail.**
Step 3 fixes it while extracting the carry-over; do not fix it earlier, or the fix lands twice.

**Fixed in step 3, 2026-08-18.** Reproduced against a fixture first — two opening entries at
`sequenceNumber = 0` in one edition raise
`duplicate key value violates unique constraint "JournalEntry_editionId_sequenceNumber_key"` — and
then confirmed that closing a two-account edition now succeeds.

---

## 2. Decisions taken

Confirmed with the owner before writing this plan. They are settled — implement them, don't
relitigate them.

**A user's edition is stored on the user, and the flag only seeds it.** `Edition.isActive`
becomes `Edition.isDefault`, and it is *not* a runtime fallback consulted on every request. It
is written into `User.selectedEditionId` **once** — when the account is created, or at that
user's first login — and never consults the user again. Changing the default afterwards
therefore affects **new accounts only**; everyone already using the app keeps the edition they
are in. That is the point, and it is a visible behaviour change from today's "make active",
which moves everyone at once.

**Closing means read-only, not gone.** A closed edition stays selectable, browsable, exportable,
and printable. Every write against it is refused.

**Closing no longer creates the successor.** Creating the next edition and bringing data over
become one explicit, manual action in the new-edition dialog, so several editions can be open at
once. Step 4 removes the automatic path only after step 3 has shipped the manual one.

**`isActive` is renamed properly, across two releases.** `production.md` requires destructive
schema changes to be split — additive first, drop later. Step 1 adds `isDefault` and backfills
it; step 5 drops `isActive`. A `@map` alias would avoid the churn but would leave the column
named for a meaning it no longer has, which `CLAUDE.md` forbids.

---

## Step 1 — Each user picks their own edition · `v0.2.0` · `requires-migration` — **DONE 2026-08-18**

The load-bearing step. Everything after it assumes an edition is resolved *per user*.

Migration `20260817230613_user_selected_edition` is `ADD COLUMN` ×2 + index + FK + the backfill,
nothing dropped. All 13 page reads, the 9 action files and the two import scripts now go through
`lib/edition-context.ts`; `isActive` is written by nothing and read by nothing. Verified against the
local database and a running build — see *Verify* below. Two corrections were made where reality
disagreed with this document; both are marked inline.

### Schema

```prisma
model User {
  selectedEditionId String?
  selectedEdition   Edition? @relation("UserSelectedEdition", fields: [selectedEditionId], references: [id], onDelete: SetNull)
}

model Edition {
  isDefault      Boolean @default(false)   // seeds new users; see decisions
  usersSelecting User[]  @relation("UserSelectedEdition")
}
```

`onDelete: SetNull` is not optional and not a style choice. **Every other `Edition` relation in
this schema is `Cascade`** — copying that here would delete users when an edition is deleted.

Generate with `npx prisma migrate dev --name user_selected_edition`, then hand-check the SQL:
it must be `ADD COLUMN` plus the FK and index, and a backfill `UPDATE "Edition" SET
"isDefault" = "isActive"`. Nothing may be dropped in this migration.

### Resolver

New file `app/lib/edition-context.ts`, the single place that answers "which edition is this
request in":

```
resolveEditionIdOrNull()      → string | null   (render paths; null → "pick an edition" state)
resolveEditionId()            → string          (write paths; throws when the user has none)
resolveEdition()              → { id, name, closedAt, drivingRatePerKm } | null
ensureUserEdition(userId)     → string | null   (seeds selectedEditionId from the default edition)
```

Two resolvers, not one: the throwing form is what a write action wants (the message lands in the
form's error state), and the nullable form is what a page wants (the empty state is a render, not a
500). Shipped as written.

`ensureUserEdition` is the *only* writer of the seed, called from three places so the same rule
holds however an account comes into being:

- `authorize()` in [`lib/auth.ts`](../../../app/lib/auth.ts) — first login,
- `createUserAction` in [`users/actions.ts`](../../../app/app/(app)/users/actions.ts) — admin creates the account,
- `resolveEditionId()` itself, when `selectedEditionId` is null — covers the three accounts that
  predate this feature, and any created by `npm run db:seed`.

When no default edition exists, or the selected one was deleted, the resolver returns nothing
and the app renders a "pick an edition" state rather than throwing. Do not let a missing edition
500 the shell.

### Wiring

~~Point `getActiveEditionId()` at `resolveEditionId()` and keep its name — that leaves the 8 action
files untouched and the diff honest.~~ **Corrected during step 1: this does not build.**
`server-action-helpers.ts` is imported by ~20 *client* components for `initialActionState`, so
anything it imports is pulled into the browser bundle — and `edition-context` reaches `lib/auth`,
which reaches `bcrypt`, a native module Turbopack cannot bundle (`Can't resolve 'fs'`). A lazy
`await import()` does not help; Turbopack follows it into the client graph too. So
`getActiveEditionId()` was **deleted** and the 9 action files import `resolveEditionId` from
`@/lib/edition-context` directly. Server actions are safe to do this from — `"use server"` files
compile to references on the client, which is why they already import `lib/access` (also
bcrypt-reaching) today.

Delete the private duplicate at `events/actions.ts:371` and import the shared one. Convert all 13
`where: { isActive: true }` reads to `resolveEditionIdOrNull()` + `findUnique({ where: { id } })`,
keeping each page's existing `select` / `include` exactly as it is.

### UI

Replace the static label at [`components/app-shell.tsx:167`](../../../app/components/app-shell.tsx#L167)
with a picker listing every edition, closed ones included and marked. It posts to a new
`POST /api/preferences/edition`, modelled on the existing
[`api/preferences/language/route.ts`](../../../app/app/api/preferences/language/route.ts): validate
that the edition exists, write `User.selectedEditionId`, then `router.refresh()`.

On the editions page, "Make active" becomes "Set as default", with copy that says what it now
does — seeds new accounts, moves nobody. `rounded-md`, tokens only, `npm run check:design`.

### Verify — all passed 2026-08-18

Against the local `blv-db-1` database with `npm start` serving the production build, two users
signed in with separate cookie jars:

- ✅ Two users, two different editions, at the same time — `/departments` and `/budget` returned
  disjoint data for each, and neither moved when the other switched.
- ✅ Changing the default edition moved **no** existing user.
- ✅ First login seeds `selectedEditionId` from the default; `ensureUserEdition` is a no-op
  afterwards, which is what makes the admin-create path land a new account on the default.
- ✅ Delete a selected edition: the user survived, `selectedEditionId` went null, and the next
  resolve re-seeded them from the default.
- ✅ No default and no selection: all 11 edition-scoped pages returned **200** with "No edition
  selected", not a 500. The picker rendered its placeholder option.
- ✅ `POST /api/preferences/edition` — `{ok:true}` on a real id, 404 on an unknown one, and the
  middleware redirects it (307) when signed out.
- ✅ A closed edition stays listed and is marked, in both locales (`2026-2027 — closed` /
  `— clôturé`).
- ✅ `npx tsc --noEmit` clean, `npm run check:design` clean, `npm run build` green. `npm run lint`
  reports only the 5 pre-existing `no-explicit-any` errors in files this step did not touch.

Tag: `git tag -a v0.2.0 -m "requires-migration"`.

---

## Step 2 — A closed edition is read-only, not inaccessible · `v0.3.0` · `non-breaking` — **DONE 2026-08-18**

No schema change. `closedAt` already exists and is already set; nothing enforces it.

Added `requireWritableEdition(editionId)` to `app/lib/edition-context.ts` — throws
"This edition is closed. Reopen it to make changes." when `closedAt` is not null — plus
`resolveWritableEditionId()`, the resolve-and-guard pair that the write actions now call in place
of `resolveEditionId()`. Called in every write path that resolves an edition:

- the 8 action files listed in §1, plus `events/actions.ts`,
- `updateDrivingRateAction` in [`editions/actions.ts`](../../../app/app/(app)/editions/actions.ts),
- **`app/app/api/invoices/route.ts`** — the one that takes `editionId` from the request body, so
  it can be pointed at a closed edition directly. Guard it on the body value, not on the
  caller's own edition.

**Correction made during step 2: "every write path that *resolves* an edition" is not enough.**
Most update/delete actions never resolve one — they act on a row by id (`deleteDepartmentAction`,
`updateJournalEntryAction`, every event/shift action, …). Guarding only the resolving paths would
leave a closed edition freely editable, which contradicts the settled decision that *every* write
is refused. So entity-scoped writes guard on the row's own `editionId`, walking the relation up
where they must (`shift → eventDay → event → editionId`). `Task.editionId` is nullable; those
tasks are global and stay writable.

Passwords, users, templates **and event types** are global; they stay writable regardless. Said so
in the code comments, so the next reader doesn't "fix" it.

In the UI, a closed edition shows a banner and hides create/edit/delete affordances rather than
letting a click fail. The guard is the enforcement; the UI is the courtesy. Both are required —
hiding buttons alone is not a control.

### Verify — all passed 2026-08-18

Production data could not be copied to this machine, so verification ran against a local fixture
with production's shape (16 departments, 3 cost centers, `Coffre` 135.07, `CompteCourant` 3922.92
with its IBAN) in a separate `baleinev_verify` database, with `npm start` serving the production
build and puppeteer driving the real UI. The **same populated edition** was measured open, then
closed, so the comparison isolates `closedAt`.

- ✅ Pages render with their data while closed — all 11 edition-scoped pages returned 200, and
  `/money-accounts` and `/journal` showed the same 2 accounts and 4 entries as when open.
- ✅ Invoice PDF of a closed edition's invoice still generated (200, valid PDF).
- ✅ Banner shown on edition-scoped routes, absent on `/passwords`.
- ✅ Create/edit/delete affordances gone while closed and back when open — departments create form,
  money-accounts create panel, journal edit/delete, invoice delete/duplicate. The invoice **PDF**
  button stayed in both.
- ✅ The guard, not the hidden buttons, is the control: a create form rendered while the edition was
  open, submitted after switching the user into a closed one, was refused with
  "This edition is closed. Reopen it to make changes."
- ✅ Entity-scoped guard: a delete form retargeted at a closed edition's department while the user
  sat in an open edition was refused, and the row survived.
- ✅ `POST /api/invoices` refused for a closed `editionId` and returned 201 for an open one —
  guarded on the body value, not the caller's edition. `PATCH`, `PUT` and `DELETE` against a
  closed edition's invoice were all refused.
- ✅ `npx tsc --noEmit` clean, `npm run check:design` clean, `npm run build` green. `npm run lint`
  reports only the 5 pre-existing `no-explicit-any` errors in files this step did not touch.

Tag: `git tag -a v0.3.0 -m "non-breaking"`.

---

## Step 3 — Manual "bring over from …" · `v0.4.0` · `non-breaking` — **DONE 2026-08-18**

Extracted the copy logic out of `closeEditionAction` into `app/lib/edition-carry-over.ts`:

```
carryOverEdition(tx, sourceEditionId, targetEditionId)
```

It copies **departments**, **cost centers** and **money accounts**, then writes one
`isOpeningEntry: true` journal entry per account whose closing balance is non-zero — the *solde à
nouveau*, labelled `Report édition précédente`, exactly as today.

Four corrections made while extracting, not after — the fourth was found during the work:

1. **Allocate sequence numbers per entry** (0, 1, 2, …), not `0` for every account. This is the
   §1 bug; with it unfixed the helper fails on the second account.
2. **Copy the money account's bank identity** — `iban`, `beneficiaryName`, `beneficiaryAddress`,
   `beneficiaryPostalCode`, `beneficiaryCity`, `beneficiaryCountry`. The current code copies only
   `name` and `type`, so a carried-over account cannot produce a Swiss QR invoice.
3. **Leave `openingBalance` at 0.** The carried balance is expressed as a journal entry, which is
   what the owner asked for; writing it into both places would double-count it.
4. **Added during step 3: include the source account's own `openingBalance` in the closing
   balance.** Every balance the app displays is `openingBalance + entries`
   ([money-accounts/page.tsx](../../../app/app/(app)/money-accounts/page.tsx)), but the old copy
   seeded its reduce with `0`, so a source account with a non-zero opening balance would carry
   over short by exactly that amount. Both production accounts are at `0.00` today, so this
   changes no live number — it was wrong all the same.

~~Budget lines are **not** copied. They belong to the year they were planned for.~~ **Superseded on
2026-08-18 — see the amendment below.**

In the new-edition dialog ([`editions/client.tsx`](../../../app/app/(app)/editions/client.tsx)), add
an optional "Bring over from" select listing existing editions — leaving it empty creates a blank
edition, exactly as today. `createEditionAction` runs the whole thing in one transaction: create,
then carry over, so a failed copy leaves no half-populated edition behind.

### Verify — all passed 2026-08-18

**Correction to this plan: the production dump was blocked**, so verification ran against the same
local fixture step 2 used — production's shape (16 departments, 3 cost centers, `Coffre` 135.07,
`CompteCourant` 3922.92 with its IBAN), built from a seed script rather than copied data. Every
number the plan asks for is reproduced; no production data was moved to this machine.

- ✅ Created an edition bringing over from 2025-2026 through the real dialog: **16 departments**,
  **3 cost centers**, **2 money accounts with their IBAN and beneficiary fields intact**, and
  **two opening entries of 135.07 and 3922.92** at **distinct** sequence numbers (0 and 1), both
  `isOpeningEntry = true`, labelled `Report édition précédente`.
- ✅ Carried accounts have `openingBalance = 0.00` — the amount is in the entry only, not counted twice.
- ✅ Created an edition *without* carry-over: completely empty (0 departments, 0 cost centers,
  0 accounts, 0 entries).
- ✅ Budget lines not copied — source held 1, target held 0. *(No longer the behaviour; the amendment
  below reverses it and re-verifies.)*
- ✅ The §1 bug is fixed: `closeEditionAction` now closes a two-account edition successfully and its
  successor lands populated. The old shape was shown to violate
  `JournalEntry_editionId_sequenceNumber_key` on the second account.
- ✅ Opening entries at 0 and 1 do not collide with regular numbering: `createJournalEntryAction`
  maxes over `sequenceNumber > 0`, which returns 1 here, so the next regular entry takes 2.
- ✅ `npx tsc --noEmit` clean, `npm run check:design` clean, `npm run build` green.

Tag: `git tag -a v0.4.0 -m "non-breaking"`.

### Amendment 2026-08-18 — the budget comes over too · `v0.7.0` · `non-breaking`

The owner asked for it after using the step as shipped: a year's budget is mostly the previous
year's budget with different amounts, so retyping every line is the wrong default. `carryOverEdition`
now copies each department's `BudgetLine` rows verbatim — `accountType`, `billingMonth`, `label`,
`unitPrice`, `quantity`, `amount`, `notes` — into the department it just created for the target
edition. The amounts come over unchanged on purpose; editing them is the next thing the admin does.

Each copied line also keeps the source line's `createdAt`. The budget page orders lines by that
column, and every row written inside one transaction shares the same `now()`, so without it the
carried budget would come out in arbitrary order.

The "Bring over from" hint changed in both locales — it no longer says budget lines are excluded.

#### Verify — all passed 2026-08-18

Same approach as steps 2-4: a fixture in a separate `baleinev_verify` database (3 departments, one
of them deliberately budget-free, 5 budget lines with every optional column populated, 2 cost
centers, `Coffre` 135.07 and `CompteCourant` 3922.92 with its IBAN), `npm start` on the production
build, puppeteer driving the real new-edition dialog. 14/14 checks passed.

- ✅ All 5 budget lines came over, attached to the matching department in the new edition.
- ✅ Field by field identical — `accountType`, `billingMonth`, `label`, `unitPrice`, `quantity`,
  `amount`, `notes`.
- ✅ Copied lines read back in the order they were planned in.
- ✅ A department with no budget lines still comes over.
- ✅ The source edition is untouched — still holds its own 5 lines.
- ✅ The new edition's `/budget` page renders the carried lines.
- ✅ "Start empty" still copies nothing — 0 departments, 0 budget lines.
- ✅ The rest of the carry-over is unchanged: 2 cost centers, 2 accounts with the bank identity
  intact, and 2 opening entries of 135.07 and 3922.92 at distinct sequence numbers.
- ✅ Both locales render the reworded hint.
- ✅ `npx tsc --noEmit` clean, `npm run check:design` clean, `npm run build` green.

Tag: `git tag -a v0.7.0 -m "non-breaking"`.

---

## Step 4 — Closing stops creating the successor · `v0.5.0` · `non-breaking` — **DONE 2026-08-18**

`closeEditionAction` is now what its name says: it stamps `closedAt`. The successor creation, the
`carryOverEdition` call and the default juggling that came with them are gone — step 3's dialog is
the only way an edition is created and the only way data moves between editions.

`reopenEditionAction` (admin only) clears `closedAt`. Closing is no longer terminal, so it needs an
inverse; without one a mis-click costs database access. Reopening deliberately does **not** restore
the default — that stays an explicit choice.

Closing the **default** hands the default to the newest edition that is not closed, so new accounts
are never seeded into a frozen year. Edition names are `YYYY-YYYY`, so "newest" is `name` descending.
When no open edition is left the app simply has no default, and a new account lands in the
"pick an edition" state step 1 already renders — a closed year is never the seed.

Two smaller things went with it:

- `incrementEditionName()` in `lib/utils.ts` was deleted. `closeEditionAction` was its only caller;
  nothing derives the next edition's name any more, because the admin types it.
- Closing and reopening flip the read-only state of every edition-scoped page at once, so both
  revalidate with `revalidatePath("/", "layout")` rather than the three-path list the other edition
  actions use.

### Verify — all passed 2026-08-18

Same approach as steps 2 and 3: a local fixture with production's shape (16 departments, 3 cost
centers, `Coffre` and `CompteCourant` with its IBAN, 3 journal entries) in a separate
`baleinev_verify` database, plus a **second open edition** so "other editions are untouched" is
measurable. `npm start` served the production build and puppeteer drove the real UI; 22/22 checks
passed.

- ✅ Close a non-default edition: **no successor appeared** (still exactly 2 editions), and the other
  open edition was untouched — still open, still the default, all 16 departments intact.
- ✅ The closed edition stayed selectable in the picker, its `/departments` rendered with its data
  behind the read-only banner, and the create affordance was gone.
- ✅ Reopen: the affordance came back and a department created through the real form was written.
- ✅ Close the **default** edition: no successor, the closed edition lost `isDefault`, and the default
  moved to the newest open edition.
- ✅ A new account created from `/users` right after that landed in that open edition —
  `selectedEdition = 2026-2027`, `closedAt = null`.
- ✅ Close the last open edition: no default remains anywhere, and all 8 routes checked still
  returned **200** rather than 500. Reopening from that all-closed state works.
- ✅ Both locales render the new copy — `Reopen year` / `Rouvrir l'année`, and the reworded subtitle
  no longer promises an automatic next edition.
- ✅ `npx tsc --noEmit` clean, `npm run check:design` clean, `npm run build` green. `npm run lint`
  reports only the 5 pre-existing `no-explicit-any` errors in files this step did not touch.

Tag: `git tag -a v0.5.0 -m "non-breaking"`.

---

## Step 5 — Drop `isActive` · `v0.6.0` · `requires-migration` — **DONE 2026-08-18**

The destructive half, deliberately last.

1. `grep -rn "isActive" app/` returns only the three expected hits: the local nav-highlighting
   variable in `components/app-shell.tsx` (nothing to do with editions), and the column's own
   history in `prisma/migrations/0_init` and `20260817230613_user_selected_edition` — migration SQL
   is immutable by definition. Nothing in the running code reads or writes the column.
2. Migration `20260818071444_drop_edition_is_active` is a single
   `ALTER TABLE "Edition" DROP COLUMN "isActive";`, generated with `prisma migrate diff` against a
   throwaway shadow database and applied locally with `migrate deploy` —
   `prisma migrate dev` refuses to run non-interactively once it sees a column drop with data in it.
3. Production carried a pre-deploy snapshot for **every** release so far
   (`pre-v0.1.3`, `pre-v0.2.0`, `pre-v0.4.0` in `/opt/blv/backups/`), which is the evidence that
   the snapshot step works before this tag — the one step in this plan a rollback cannot undo.

`npx tsc --noEmit` clean, `npm run check:design` clean, `npm run build` green.

Tag: `git tag -a v0.6.0 -m "requires-migration"`.

---

## Also shipped in `v0.6.0` — the running version in the sidebar

Not part of the original five steps; added on the owner's request, modelled on the same wiring in
LeadDesk (`../LeadDesk_3.0/next.config.mjs`).

`resolveVersion()` in [`app/next.config.ts`](../../../app/next.config.ts) runs
`git describe --tags --abbrev=0` at build time and exposes it as `NEXT_PUBLIC_APP_VERSION`. That is
truthful here specifically because a deploy is `git checkout --detach tags/<tag>` followed by a
build, so the closest tag *is* what is running. `package.json`'s `version` is the fallback for a
build with no git, and was bumped to `0.6.0` so the fallback is not a lie.

The sidebar footer renders it under the sign-out button — `Baleinev Comptes v0.6.0` expanded, just
`v0.6.0` collapsed. Verified rendering in a real browser against a production build; the string is
substituted at build time, not read at runtime.

---

## Docs to update

`CLAUDE.md` forbids letting these drift. Five files describe the behaviour this plan changes, and
each is part of the commit that changes it — not a cleanup pass afterwards:

| File | What changes |
| --- | --- |
| [business-processes.md](../../business-processes.md) | §1 Editions — lines 14-35 describe activation and year-end as they work today. Rewrite for per-user selection, read-only close, manual carry-over. |
| [database.md](../../database.md) | `User.selectedEditionId`, `Edition.isDefault`, the `SetNull` relation. Keep the "`PasswordEntry` is **not** edition-scoped" line at :76 — it stays true. |
| [overview.md](../../overview.md) | The edition model in the app's mental picture. |
| [auth.md](../../auth.md) | First-login seeding is now part of `authorize()`. |
| [summary.md](../../summary.md) | Whatever it asserts about the active edition. |

Step 1 rewrote the edition model in all five, plus
[file-structure.md](../../file-structure.md) for `lib/edition-context.ts` and the new preferences
route. Steps 2, 3 and 4 each made their own pass over the same files as part of their commit.

---

## Out of scope

- **The password vault.** Verified edition-agnostic on 2026-08-18 — no `editionId`, no
  `getActiveEditionId()`, proven live with the active edition holding zero departments. Steps 2-4
  must not add an edition guard to it.
- **Renaming `DepartmentRole`s.** The vault keys on department *names*; renaming a department in a
  new edition creates a new role and silently drops department users' access to entries shared
  with the old one. Real, but a separate problem from editions.
- **`/opt/caddy` being versioned nowhere**, inherited from
  [001](001-production-deployment.md).
