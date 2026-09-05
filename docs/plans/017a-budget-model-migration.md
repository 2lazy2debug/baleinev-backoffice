# 017a — Model and migration

**Read [017-budget-department-improvement.md](017-budget-department-improvement.md)
first** — the target model, the rules, the conventions, the delegation policy and
the release protocol live there. Then work from that file and this one only. Do
not read 017b–017d; their context is not yours.

## What this phase does

Turns `DepartmentBudget` into `Budget`, adds the `BudgetDepartment` join, moves
journal entries off the department and onto the budget, and rewrites the server
helpers that spoke the old model.

**It does not touch a single screen**, and it leaves the build red: the renames
land here and their call sites are fixed in 017b–017d. That is expected. **Do not
tag and do not push.**

---

## Step 1 — The schema

File: `app/prisma/schema.prisma`

### `DepartmentBudget` becomes `Budget`

```prisma
/// One named envelope of money inside one edition — what used to be a
/// department's budget, now a thing in its own right. It carries the lines that
/// were planned and the journal entries that were actually booked; the
/// departments attached to it only get to look.
model Budget {
  id        String   @id @default(cuid())
  editionId String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  edition        Edition            @relation(fields: [editionId], references: [id], onDelete: Cascade)
  departments    BudgetDepartment[]
  budgetLines    BudgetLine[]
  journalEntries JournalEntry[]

  @@unique([editionId, name])
  @@index([editionId])
}

/// Who may look at a budget. It carries no amount and no share — detaching a
/// department takes nothing away from the budget, it only stops the team seeing
/// it. A budget with no row here is an admin-only budget.
model BudgetDepartment {
  id           String   @id @default(cuid())
  budgetId     String
  departmentId String
  createdAt    DateTime @default(now())

  budget     Budget     @relation(fields: [budgetId], references: [id], onDelete: Cascade)
  department Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@unique([budgetId, departmentId])
  @@index([departmentId])
}
```

### The rest

- **`BudgetLine`**: `departmentBudgetId` → `budgetId`, relation `departmentBudget`
  → `budget`, still `onDelete: Cascade`.
- **`JournalEntry`**: `departmentId` → `budgetId` (still nullable), relation
  `department` → `budget Budget? @relation(fields: [budgetId], references: [id],
  onDelete: SetNull)`.
  **`SetNull`, not `Restrict`.** Deleting an edition cascades both its budgets and
  its entries, and a `Restrict` in the middle of that cascade is a deploy that
  fails at 2am. A budget that still holds entries is protected by the delete
  *action* in 017c instead, where the refusal can be a sentence.
- **`Department`**: drop the `journalEntries JournalEntry[]` back-relation and
  `budgets DepartmentBudget[]`; add `budgets BudgetDepartment[]`. **Keep
  `hasBudget`**, and rewrite its doc comment: its only remaining job is to filter
  which departments may be attached to a budget.
- **`Edition`**: `departmentBudgets DepartmentBudget[]` → `budgets Budget[]`.

Run `npx prisma generate` (from `app/`) for the client types. **Do not run
`prisma migrate dev`** — this repo writes its migrations by hand.

Commit.

---

## Step 2 — Measure before you migrate

Against the local database, write down two numbers. You will check them again
after the migration and they are the only proof the data survived:

```sql
SELECT count(*) FROM "JournalEntry" WHERE "departmentId" IS NULL;
SELECT count(*) FROM "JournalEntry";
```

Also capture the per-department budgeted and actual totals the dashboard shows, so
017d can confirm they are unchanged.

---

## Step 3 — The migration

New file:
`app/prisma/migrations/20260905090000_budget_department_nn/migration.sql`

Hand-written and heavily commented, in the style of
`app/prisma/migrations/20260903090000_departments_expansion/migration.sql`.
**Read that file first.** Its comments record a bug worth not repeating: drop a
foreign key *before* repointing the rows it guards, because Postgres checks
constraints per statement, not at commit.

The order matters — `Budget.departmentId` has to survive until every row that used
it has been repointed:

1. `ALTER TABLE "DepartmentBudget" RENAME TO "Budget";` and rename its primary
   key, its `editionId` foreign key and its indexes to match.
2. `ALTER TABLE "Budget" ADD COLUMN "name" TEXT;` then
   `UPDATE "Budget" b SET "name" = d."name" FROM "Department" d WHERE d."id" = b."departmentId";`
   then `SET NOT NULL`. Every existing budget is named after the department that
   owned it — that is what it was.
3. Create `"BudgetDepartment"`: the unique index on `("budgetId", "departmentId")`,
   the index on `("departmentId")`, and both foreign keys `ON DELETE CASCADE`.
   Fill it with one row per existing budget —
   `INSERT INTO "BudgetDepartment" ("id","budgetId","departmentId","createdAt")
    SELECT gen_random_uuid()::text, b."id", b."departmentId", NOW() FROM "Budget" b;`
4. **Do not lose an entry's attribution.** A journal entry may point at a
   department that never got a `DepartmentBudget` row in its edition — those rows
   were only created when a *line* was first planned. Create a budget for every
   such `(editionId, departmentId)` pair, named after the department, and attach
   it. Skip this and those entries end up with `budgetId = NULL` and their money
   vanishes from every comparison in the app. Department names are globally
   unique, so the derived per-edition names cannot collide with each other or with
   the ones from step 2.
5. `ALTER TABLE "JournalEntry" ADD COLUMN "budgetId" TEXT;` then
   `UPDATE "JournalEntry" e SET "budgetId" = b."id" FROM "Budget" b
    WHERE b."editionId" = e."editionId" AND b."departmentId" = e."departmentId";`
   Drop `JournalEntry_departmentId_fkey` and its index, drop the `departmentId`
   column, then add `JournalEntry_budgetId_fkey` → `"Budget"("id") ON DELETE SET
   NULL` and an index on `("budgetId")`.
6. `ALTER TABLE "BudgetLine" RENAME COLUMN "departmentBudgetId" TO "budgetId";`
   and rename its foreign key to `BudgetLine_budgetId_fkey`.
7. **Only now**: drop the `("editionId","departmentId")` unique index and the
   `"departmentId"` index on `Budget`, drop `Budget."departmentId"` and its
   foreign key, and create the unique index on `("editionId","name")`.
8. `UPDATE "Department" d SET "hasBudget" = true WHERE EXISTS (SELECT 1 FROM
   "BudgetDepartment" bd WHERE bd."departmentId" = d."id");` — a department
   attached to something is a department that budgets.

Apply it with `npm run db:deploy` from `app/`.

Commit.

---

## Step 4 — Prove the data survived

**Delegate this** (see the master's delegation section) — it is pure SQL against a
local database and needs none of the reasoning above:

```
Agent(subagent_type: "general-purpose", run_in_background: false):
  "Against the local Postgres for the project at
   /home/mcabras/Developer/baleinev-backoffice/app (connection string in app/.env),
   run these and report the numbers only:
     SELECT count(*) FROM \"JournalEntry\" WHERE \"budgetId\" IS NULL;
     SELECT count(*) FROM \"JournalEntry\";
     SELECT count(*) FROM \"Budget\";
     SELECT count(*) FROM \"BudgetDepartment\";
     SELECT count(*) FROM \"Budget\" WHERE \"name\" IS NULL;
     SELECT count(*) FROM \"BudgetLine\" WHERE \"budgetId\" IS NULL;
   Change nothing."
```

The pass conditions:

- `budgetId IS NULL` equals the `departmentId IS NULL` count from step 2. **Anything
  higher means step 4 or 5 of the migration missed a pair — fix the migration, do
  not paper over it in the app.**
- The total entry count is unchanged.
- No `Budget` has a NULL name and no `BudgetLine` has a NULL budget.

---

## Step 5 — The server helpers

File: `app/lib/departments.ts` — three of its four exports describe a relationship
that no longer exists.

- **Delete `resolveDepartmentBudgetId`.** Budgets are created explicitly now;
  nothing opens one as a side effect of writing a line.
- **Delete `assertDepartmentsBudget`.** Its only callers were the journal actions,
  and they will name a budget.
- **Keep `budgetingDepartments()`**, and rewrite its doc comment: it lists the
  departments that may be *attached to* a budget, not the ones a line may be
  booked against.
- **Rewrite `departmentBudgetUsage(departmentId)`**: count the budget lines of the
  budgets this department is attached to —
  `prisma.budgetLine.count({ where: { budget: { departments: { some: { departmentId } } } } })`
  — and the journal entries of those same budgets. It still answers one question,
  "would turning this department's budget off hide live money from a team?", and
  the departments screen still uses it for exactly that.

New file: `app/lib/budgets.ts`

- `visibleBudgetsWhere(access, editionId)` — **the one place the visibility rule
  lives.** An admin gets `{ editionId }`; anyone else gets
  `{ editionId, departments: { some: { departmentId: { in: access.departmentIds } } } }`.
  A budget with no `BudgetDepartment` row therefore never matches for a
  non-admin — that is the admin-only rule, expressed once and never repeated.
- `assertBudgetInEdition(budgetId, editionId)` — replaces
  `assertDepartmentsBudget`. Refuses a journal entry booked against a budget from
  another edition: `"That budget does not belong to the active edition."`
- `resolveDefaultBudgetForDepartment(editionId, departmentId)` — for the expense
  report → journal prefill. Returns the budget id when the department is attached
  to **exactly one** budget in that edition, and `null` otherwise. Guessing between
  two budgets would book real money into the wrong envelope; an empty picker is the
  honest answer.

Commit.

---

## Step 6 — Hand off

Do **not** run `npm run build` expecting green, and do not chase the errors — every
one of them belongs to 017b, 017c or 017d, which have their own file lists.

**Delegate one sweep** so the next phases start from a real inventory:

```
Agent(subagent_type: "Explore"):
  "In /home/mcabras/Developer/baleinev-backoffice/app, list every file:line
   referencing any of: departmentBudget, DepartmentBudget, departmentBudgetId,
   assertDepartmentsBudget, resolveDepartmentBudgetId. Also list every file:line
   where a journalEntry query or type still uses departmentId or a department
   relation. Exclude node_modules and prisma/migrations. Report the list only,
   grouped by file. Change nothing."
```

Report that list back with the phase, so whoever picks up 017b–017d knows exactly
what is still red. Then stop — **no tag, no push.**
