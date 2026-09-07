# 2026-09-06 — a devDependency stopped the deploys, and the rollback gutted the database

**Window:** 2026-09-06 19:42 UTC → 2026-09-07 11:22 UTC (~15h45m)
**Deploys blocked:** v0.35.0 through v0.42.0 — eight consecutive releases
**Data lost:** none
**User-visible downtime:** none
**Silently lost:** 80 foreign keys, 53 indexes, 10 primary keys — for twenty hours

---

## One paragraph

Adding `vitest` as a devDependency broke `next build` on the server, because
`next build` type-checks the whole tree and the server installs with `npm ci
--omit=dev`. That alone would have been a one-line fix. But the failing release
was tagged `requires-migration`, so the pipeline had already migrated the
database before the build failed — and the rollback path then tried to restore a
snapshot taken *before* that migration. The restore died on a dependency the
snapshot could not know about, and because it ran without `--single-transaction`,
psql kept everything it had already done: the dump's entire DROP section. The
database was left with its data intact and almost none of its integrity
constraints. `/api/health` does a `SELECT 1`, so it stayed green, the pipeline
reported a clean rollback, and nobody knew for twenty hours.

---

## The two bugs

### Bug 1 — `next build` type-checks files whose dependency the server does not install

`app/tsconfig.json` included `**/*.ts`. That swept in `vitest.config.ts` and all
eleven `*.test.ts` files, every one of which imports from `vitest`. `vitest` is
a devDependency; `install.sh` and `self-update.sh` both install `--omit=dev` on
purpose. So `next build` reached "Running TypeScript" and died:

```
./vitest.config.ts:3:30
Type error: Cannot find module 'vitest/config' or its corresponding type declarations.
```

This is the failure mode `docs/production.md` already warned about — "`next build`
must not need a devDependency" — arriving through a door nobody had thought to
close. The listed dev deps were `eslint` and `eslint-config-next`, neither of
which the build touches. `vitest` was added without noticing that a *test file*
is still a file the production build reads.

### Bug 2 — a failed restore was destructive

`restore_backup` in `deploy/self-update.sh` ran:

```bash
psql -U "$user" -d "$db" -v ON_ERROR_STOP=1 --quiet < dump.sql
```

`ON_ERROR_STOP=1` stops psql at the first error. Without `--single-transaction`,
every statement before that error is already committed. And a `pg_dump --clean`
script is ordered:

1. `ALTER TABLE ... DROP CONSTRAINT IF EXISTS` — **all foreign keys**
2. `DROP INDEX IF EXISTS` — **all secondary indexes**
3. `DROP TABLE IF EXISTS`
4. `CREATE TABLE` / `COPY` data
5. `CREATE INDEX` / `ADD CONSTRAINT` — **everything put back**

An error anywhere in steps 1–3 therefore commits a large amount of destruction
and never reaches step 5.

**Why it errored.** The snapshot was taken before `prisma migrate deploy` ran, so
its DROP statements describe the *old* schema. The migration had meanwhile created
`CashRegister_openedById_fkey`, which depends on `User_pkey`. The dump says
`DROP CONSTRAINT IF EXISTS "User_pkey"` — and `IF EXISTS` is no help, because
`User_pkey` does exist. What is new is the thing depending on it:

```
ERROR:  cannot drop constraint User_pkey on table public."User" because other objects depend on it
DETAIL:  constraint CashRegister_openedById_fkey on table public."CashRegister" depends on index public."User_pkey"
```

psql stopped there. Everything dropped before that line stayed dropped.

---

## Timeline

| When (UTC) | What |
|---|---|
| **Sep 6 19:42** | **v0.35.0** deploys, `requires-migration`. `prisma migrate deploy` succeeds. |
| Sep 6 19:45:18 | `next build` fails on `vitest/config`. Rollback begins. |
| Sep 6 19:45:19 | Restore fails on `User_pkey`. **`SNAPSHOT RESTORE FAILED` logged — and the pipeline carries on.** Most constraints are now gone. |
| Sep 6 19:48 | Rolled back to v0.34.0. Health green. Looks fine. |
| Sep 6 20:16 | **v0.36.0** — same sequence. Restore fails on `StockElement_pkey` this time. More loss. |
| Sep 7 06:03 | **v0.37.0** — now fails at `prisma migrate deploy`, not the build: `pos_sessions` cannot add an FK to `User(id)` because `User` has no primary key. |
| Sep 7 07:42 – 10:46 | **v0.38.0 – v0.41.0** all fail, alternating between the build bug and the migration bug. Each writes a `failed-<tag>` marker. |
| **Sep 7 ~10:50** | Investigation starts. Build bug identified from the updater journal. |
| Sep 7 11:00 | **v0.42.0** ships the `tsconfig.json` fix. Gets past `next build` — and fails at `prisma migrate deploy`, exposing bug 2. |
| Sep 7 11:05 | Auto-rollback to v0.34.0. Production healthy throughout. |
| Sep 7 11:08 | Constraint loss confirmed: **3 foreign keys** where August backups had 47. Root cause traced to the two `SNAPSHOT RESTORE FAILED` lines. |
| Sep 7 11:22 | Manual backup taken. Repair generated and rehearsed on a clone of production. |
| Sep 7 11:24 | Repair applied to production in one transaction: **3 → 69 foreign keys, 29 → 39 primary keys, 33 → 113 indexes**. |
| Sep 7 11:29 | The three pending migrations applied by hand. `prisma migrate diff` against `schema.prisma`: **"No difference detected"**. |
| **Sep 7 11:34:37** | **v0.43.0 deploys successfully** — first green deploy in 17h35m. `{"status":"deployed","tag":"v0.43.0","message":"ok"}` |

The eight failed deploys were not eight problems. The pipeline only ever compares
the **highest** tag against `deployed-tag`, so v0.35.0–v0.41.0 were never
individually attempted — each tick simply retried the newest tag and hit the same
two walls.

---

## Damage assessment

Measured on the live database before repair, against what `schema.prisma` requires:

| | Before repair | Expected | After repair |
|---|---:|---:|---:|
| Foreign keys | 3 | 83 | 69 → 83 after migrations |
| Primary keys | 29 | 39 | 39 |
| Indexes (total) | 33 | 113 | 113 |
| Indexes on `User` | 0 | 4 | 4 |

Tables left with **no primary key at all**: `User`, `Task`, `Todo`, `StockItem`,
`StockMovement`, `StockPlace`, `StockUnit`, `StockUnitConversion`,
`_DepartmentToUser`, `_DepartmentToPasswordEntry`.

**No data was lost.** The dump's `COPY` section is step 4 and was never reached —
the restore died in the DROP section, which is DDL only. Row counts were
unchanged throughout (25 users, 417 journal entries, 93 stock movements), and no
duplicate or orphaned row was ever created: the application had been the only
writer and Prisma enforces these relationships in its own query layer.

**Why nothing appeared broken.** Prisma does not need database-level constraints
to function. Referential integrity was unenforced for twenty hours, but nothing
in the app tried to violate it, so no user ever saw a symptom. The window is the
concerning part, not the outcome.

---

## Repair

Generated with `prisma migrate diff`, comparing the live database against the
migration set it *claimed* to have applied (all 18 through `pos_templates`):

```bash
prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-migrations /tmp/mig_applied \
  --shadow-database-url "$SHADOW" \
  --script > drift-repair.sql
```

146 statements — 10 `ADD PRIMARY KEY`, 66 `ADD FOREIGN KEY`, 70 `CREATE INDEX`.
No `DROP`, no `TRUNCATE`, no data modification, no `CREATE TABLE`. The three
genuinely-pending migrations were deliberately excluded so the pipeline could
apply them normally afterwards.

**Rehearsed before it was applied**, on a throwaway clone of production:

1. Clone prod into `blv_rehearsal`
2. Apply the repair in one transaction → clean
3. `prisma migrate deploy` → all three pending migrations applied
4. `prisma migrate diff --exit-code` against `schema.prisma` → **"No difference detected"**

Step 2 succeeding is what proved no row violated any constraint being restored —
worth more than any number of hand-written orphan queries. Only then was the same
script applied to production, inside a single transaction, after a manual
`pg_dump` to `/root/manual-pre-repair-*.sql`.

---

## Fixes shipped

**`app/tsconfig.json`** — test files are excluded from the production type-check:

```jsonc
"exclude": ["node_modules", "vitest.config.ts", "**/*.test.ts", "**/*.test.tsx"]
```

`vitest` finds tests through `vitest.config.ts`, not tsconfig, so `npm test` is
unaffected — all 135 tests still run. Verified by deleting `vitest` from
`node_modules` and rebuilding, which reproduces the server exactly.

**`deploy/self-update.sh`** — `restore_backup` now empties the schema and loads
the dump in one transaction:

```bash
{ printf 'DROP SCHEMA public CASCADE;\nCREATE SCHEMA public;\n'; cat "$work/dump.sql"; } \
  | psql -U "$user" -d "$db" -v ON_ERROR_STOP=1 --quiet --single-transaction
```

`DROP SCHEMA` removes the *cause* — there is nothing left for the snapshot's own
DROP statements to trip over, and `CASCADE` settles dependency order.
`--single-transaction` removes the *consequence* — a restore that fails now
changes nothing at all. Both are needed: the first prevents the common failure,
the second contains every other one.

Verified against a clone with three tests:

| Test | Result |
|---|---|
| Old code path, snapshot older than schema | Reproduced: `cannot drop constraint StockElement_pkey`, exit 3, **83 → 80 FKs destroyed** |
| Fixed path, same inputs | Exit 0, database restored faithfully to the snapshot's exact state |
| Fixed path, deliberately corrupt dump | Error raised, **83 FKs before and after** — full rollback, zero damage |

---

## Resolution — verified 2026-09-07 11:35 UTC

| Check | Result |
|---|---|
| `deployed-tag` / checkout / `package.json` | `v0.43.0` on all three |
| `last-deploy.json` | `{"status":"deployed","tag":"v0.43.0","message":"ok"}` |
| Quarantine markers | none — `failed-v0.41.0` and `failed-v0.42.0` cleared |
| Health, loopback | `{"status":"ok"}` |
| Health, public HTTPS via Caddy | `{"status":"ok"}` |
| Foreign keys / primary keys / indexes | 83 / 44 / 128 |
| Migrations applied | 21 of 21, none unfinished or rolled back |
| `prisma migrate diff` vs `schema.prisma` | **No difference detected** |
| Fixed `restore_backup` on the box | `DROP SCHEMA` guard and `--single-transaction` both present |
| Scratch databases | dropped |

**Why v0.43.0 was tagged `non-breaking` rather than `requires-migration`.** The
running updater reads its own script into memory before `git checkout` replaces
it, so the deploy that *ships* the restore fix is still rolled back by the old,
destructive one. A tag with nothing to migrate is a tag whose rollback never
touches the database. The three migrations were therefore applied by hand first —
against a rehearsed, verified script — and the release itself carried no database
work at all. From v0.43.0 onward the fixed restore is the one that runs.

---

## What this says about the pipeline

Three things worked exactly as designed and one did not.

**Worked.** The step-by-step `|| return 1` checks named the failing step every
time. The `failed-<tag>` quarantine stopped a crash-loop through eight full
rebuilds every two minutes. The auto-rollback kept a working v0.34.0 serving
users through sixteen hours of failed deploys — there was never an outage.

**Did not work.** The rollback's restore was the one step that could cause
permanent harm, and it was the one step with no atomicity. Worse, its failure was
non-fatal: the pipeline logged `SNAPSHOT RESTORE FAILED — the database may be
inconsistent`, then carried straight on to rebuild the old tag and report a
successful rollback. The most alarming line the script can print was followed by
a green result.

### Recommended follow-ups

1. **A failed restore should be terminal.** It currently logs and continues.
   It should record `failed` with an unmistakable status and stop, rather than
   letting a successful rebuild paper over it.
2. **Extend the health gate to the schema.** `SELECT 1` cannot see this class of
   damage. A check that counts `pg_constraint` rows, or runs
   `prisma migrate diff --exit-code` against `schema.prisma` after a deploy,
   would have caught it in two minutes instead of twenty hours.
3. **Consider splitting migrate from build.** `prisma migrate deploy` runs
   *before* `next build`, so a build failure always forces a database rollback
   that would otherwise be unnecessary. Building first and migrating second means
   a broken build never touches the database at all — and the whole of this
   incident becomes a failed build and nothing more.
4. **Tag messages must match reality.** v0.41.0 was tagged `non-breaking` while
   three migrations were pending. It failed for another reason, but had it built,
   it would have deployed code against a schema three migrations behind.

---

## The one-line lesson

`ON_ERROR_STOP=1` tells psql to *stop*. It does not tell it to *undo*. Any
restore, migration or repair that can fail halfway must run in a transaction —
because the state it leaves behind when it stops is not the state it started
from, and a health check that only proves the database answers will never
tell you the difference.
