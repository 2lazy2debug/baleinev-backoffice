-- Budgets and departments become many-to-many.
--
-- Before: `DepartmentBudget (editionId, departmentId)` was one budget welded to
-- one department, and a `JournalEntry` booked against a *department*.
--
-- After: `Budget (editionId, name)` is a named envelope in its own right,
-- `BudgetDepartment` is a join that carries no money (it only decides who may
-- look), and a journal entry books against a *budget*.
--
-- The order matters: `Budget."departmentId"` (the old column) has to survive
-- until every row that was keyed off it — the join fill, the orphan-budget
-- creation, and the journal repoint — has run. It is dropped last, in step 7.
--
-- Lesson carried from 20260903090000_departments_expansion: drop a foreign key
-- BEFORE repointing the rows it guards. Postgres checks constraints per
-- statement, not at commit, so a mid-cascade `RESTRICT`/stale FK is a 23503 at
-- deploy time. `JournalEntry_departmentId_fkey` is dropped in step 5 before the
-- column it guards goes away.

-- 1. DepartmentBudget -> Budget. Postgres keeps the old index/constraint names
--    through a RENAME TABLE, so rename the ones that live on explicitly; the two
--    doomed indexes keep their old names and are dropped by them in step 7.
ALTER TABLE "DepartmentBudget" RENAME TO "Budget";
ALTER TABLE "Budget" RENAME CONSTRAINT "DepartmentBudget_pkey" TO "Budget_pkey";
ALTER TABLE "Budget" RENAME CONSTRAINT "DepartmentBudget_editionId_fkey" TO "Budget_editionId_fkey";

-- 2. Every existing budget is named after the department that owned it — that is
--    what it was. Department names are globally unique, so these names are unique
--    within an edition.
ALTER TABLE "Budget" ADD COLUMN "name" TEXT;
UPDATE "Budget" b SET "name" = d."name" FROM "Department" d WHERE d."id" = b."departmentId";
ALTER TABLE "Budget" ALTER COLUMN "name" SET NOT NULL;

-- 3. The join. One row per existing budget: the department that owned it is the
--    department that gets to look at it.
CREATE TABLE "BudgetDepartment" (
    "id"           TEXT NOT NULL,
    "budgetId"     TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetDepartment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BudgetDepartment_budgetId_departmentId_key" ON "BudgetDepartment"("budgetId", "departmentId");
CREATE INDEX "BudgetDepartment_departmentId_idx" ON "BudgetDepartment"("departmentId");
ALTER TABLE "BudgetDepartment" ADD CONSTRAINT "BudgetDepartment_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetDepartment" ADD CONSTRAINT "BudgetDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "BudgetDepartment" ("id", "budgetId", "departmentId", "createdAt")
SELECT gen_random_uuid()::text, b."id", b."departmentId", NOW() FROM "Budget" b;

-- 4. Do not lose an entry's attribution. A journal entry may point at a
--    (editionId, departmentId) pair that never got a DepartmentBudget row —
--    those were only created when a line was first planned. Create a budget for
--    every such pair, named after the department, and attach it. Skip this and
--    those entries land on budgetId = NULL and their money vanishes from every
--    comparison in the app.
WITH missing AS (
    SELECT DISTINCT e."editionId", e."departmentId"
    FROM "JournalEntry" e
    WHERE e."departmentId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Budget" b
        WHERE b."editionId" = e."editionId" AND b."departmentId" = e."departmentId"
      )
), created AS (
    INSERT INTO "Budget" ("id", "editionId", "departmentId", "name", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, m."editionId", m."departmentId", d."name", NOW(), NOW()
    FROM missing m JOIN "Department" d ON d."id" = m."departmentId"
    RETURNING "id", "departmentId"
)
INSERT INTO "BudgetDepartment" ("id", "budgetId", "departmentId", "createdAt")
SELECT gen_random_uuid()::text, c."id", c."departmentId", NOW() FROM created c;

-- 5. Journal entries book against a budget now.
ALTER TABLE "JournalEntry" ADD COLUMN "budgetId" TEXT;
UPDATE "JournalEntry" e SET "budgetId" = b."id"
FROM "Budget" b
WHERE b."editionId" = e."editionId" AND b."departmentId" = e."departmentId";

ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_departmentId_fkey";
DROP INDEX "JournalEntry_editionId_departmentId_idx";
ALTER TABLE "JournalEntry" DROP COLUMN "departmentId";

ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "JournalEntry_budgetId_idx" ON "JournalEntry"("budgetId");

-- 6. Budget lines are the one thing that genuinely belongs to the budget.
ALTER TABLE "BudgetLine" RENAME COLUMN "departmentBudgetId" TO "budgetId";
ALTER TABLE "BudgetLine" RENAME CONSTRAINT "BudgetLine_departmentBudgetId_fkey" TO "BudgetLine_budgetId_fkey";

-- 7. Only now: the old identity goes. A budget is (editionId, name) from here.
DROP INDEX "DepartmentBudget_editionId_departmentId_key";
DROP INDEX "DepartmentBudget_departmentId_idx";
ALTER TABLE "Budget" DROP CONSTRAINT "DepartmentBudget_departmentId_fkey";
ALTER TABLE "Budget" DROP COLUMN "departmentId";
CREATE UNIQUE INDEX "Budget_editionId_name_key" ON "Budget"("editionId", "name");
CREATE INDEX "Budget_editionId_idx" ON "Budget"("editionId");

-- 8. A department attached to something is a department that budgets.
UPDATE "Department" d SET "hasBudget" = true
WHERE EXISTS (SELECT 1 FROM "BudgetDepartment" bd WHERE bd."departmentId" = d."id");
