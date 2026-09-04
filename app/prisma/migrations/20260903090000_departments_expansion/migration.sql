-- Departments become the association's teams, edition-independent, and the
-- per-edition row they were shadowing becomes the budget.
--
-- Before: `DepartmentRole` was the global thing users belonged to, and
-- `Department` was a budget category owned by one edition. The two were kept in
-- step by matching *names* at runtime — that is what every
-- `departmentRoleNames.includes(department.name)` filter was doing.
--
-- After: `Department` is the global team (name, abbreviation, hasBudget) and
-- `DepartmentBudget` is its budget in one edition. Journal entries and expense
-- reports point at the department and carry their own `editionId`, so a
-- department without a budget still books and still files.

-- The two renames, in this order: "Department" has to be free before
-- "DepartmentRole" can take it.
ALTER TABLE "Department" RENAME TO "DepartmentBudget";
ALTER TABLE "DepartmentRole" RENAME TO "Department";

ALTER TABLE "DepartmentBudget" RENAME CONSTRAINT "Department_pkey" TO "DepartmentBudget_pkey";
ALTER TABLE "DepartmentBudget" RENAME CONSTRAINT "Department_editionId_fkey" TO "DepartmentBudget_editionId_fkey";
ALTER INDEX "Department_editionId_name_key" RENAME TO "DepartmentBudget_editionId_name_key";

ALTER TABLE "Department" RENAME CONSTRAINT "DepartmentRole_pkey" TO "Department_pkey";
ALTER INDEX "DepartmentRole_name_key" RENAME TO "Department_name_key";

-- The two new columns. `abbreviation` stays nullable: nothing in the old data
-- knows one, and inventing them from the names would be inventing data.
ALTER TABLE "Department" ADD COLUMN "abbreviation" TEXT;
ALTER TABLE "Department" ADD COLUMN "hasBudget" BOOLEAN NOT NULL DEFAULT false;

-- A budget category that never got a role row still has to become a department,
-- or its budget lines, journal entries and expense reports lose their owner.
INSERT INTO "Department" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, source."name", NOW(), NOW()
FROM (SELECT DISTINCT "name" FROM "DepartmentBudget") AS source
WHERE NOT EXISTS (SELECT 1 FROM "Department" d WHERE d."name" = source."name");

-- Name is how the two tables were matched at runtime, so name is how they are
-- matched once, here, for good.
ALTER TABLE "DepartmentBudget" ADD COLUMN "departmentId" TEXT;
UPDATE "DepartmentBudget" b SET "departmentId" = d."id" FROM "Department" d WHERE d."name" = b."name";
ALTER TABLE "DepartmentBudget" ALTER COLUMN "departmentId" SET NOT NULL;

-- These three foreign keys followed "Department" through its rename and now
-- point at "DepartmentBudget". They have to go BEFORE the rows are repointed,
-- not after: the updates below write a *department* id into a column still
-- constrained to the budget, and Postgres checks that per statement, not at
-- commit. Dropping them afterwards is the bug that failed this migration in
-- production (23503 on JournalEntry_departmentId_fkey).
ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_departmentId_fkey";
ALTER TABLE "ExpenseReport" DROP CONSTRAINT "ExpenseReport_departmentId_fkey";
ALTER TABLE "AppointmentInviteDepartment" DROP CONSTRAINT "AppointmentInviteDepartment_departmentId_fkey";

-- Everything that pointed at a per-edition budget category now points at the
-- department itself.
UPDATE "JournalEntry" e SET "departmentId" = b."departmentId" FROM "DepartmentBudget" b WHERE b."id" = e."departmentId";
UPDATE "ExpenseReport" r SET "departmentId" = b."departmentId" FROM "DepartmentBudget" b WHERE b."id" = r."departmentId";

-- Two per-edition categories can collapse onto one department, and an
-- appointment may only invite each department once. Drop the duplicate invite
-- before the update, or the unique index refuses it.
DELETE FROM "AppointmentInviteDepartment" a
USING "AppointmentInviteDepartment" k, "DepartmentBudget" ba, "DepartmentBudget" bk
WHERE a."id" > k."id"
  AND a."appointmentId" = k."appointmentId"
  AND ba."id" = a."departmentId"
  AND bk."id" = k."departmentId"
  AND ba."departmentId" = bk."departmentId";

UPDATE "AppointmentInviteDepartment" i SET "departmentId" = b."departmentId" FROM "DepartmentBudget" b WHERE b."id" = i."departmentId";

ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentInviteDepartment" ADD CONSTRAINT "AppointmentInviteDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentBudget" ADD CONSTRAINT "DepartmentBudget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Budget lines are the one thing that genuinely belongs to the budget.
ALTER TABLE "BudgetLine" DROP CONSTRAINT "BudgetLine_departmentId_fkey";
ALTER TABLE "BudgetLine" RENAME COLUMN "departmentId" TO "departmentBudgetId";
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_departmentBudgetId_fkey" FOREIGN KEY ("departmentBudgetId") REFERENCES "DepartmentBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The budget is identified by its edition and its department now, not by a name
-- it no longer holds.
DROP INDEX "DepartmentBudget_editionId_name_key";
ALTER TABLE "DepartmentBudget" DROP COLUMN "name";
CREATE UNIQUE INDEX "DepartmentBudget_editionId_departmentId_key" ON "DepartmentBudget"("editionId", "departmentId");
CREATE INDEX "DepartmentBudget_departmentId_idx" ON "DepartmentBudget"("departmentId");

-- A department that already budgets somewhere is a department with a budget.
UPDATE "Department" d SET "hasBudget" = true
WHERE EXISTS (SELECT 1 FROM "DepartmentBudget" b WHERE b."departmentId" = d."id");

-- The access request points at the department under its new name.
ALTER TABLE "Task" DROP CONSTRAINT "Task_departmentRoleId_fkey";
DROP INDEX "Task_status_departmentRoleId_idx";
ALTER TABLE "Task" RENAME COLUMN "departmentRoleId" TO "departmentId";
CREATE INDEX "Task_status_departmentId_idx" ON "Task"("status", "departmentId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma names an implicit m2m table after its two models, so both follow the
-- rename. Column A still holds the department: Department sorts before both
-- PasswordEntry and User, exactly as DepartmentRole did.
ALTER TABLE "_DepartmentRoleToUser" RENAME TO "_DepartmentToUser";
ALTER TABLE "_DepartmentToUser" RENAME CONSTRAINT "_DepartmentRoleToUser_AB_pkey" TO "_DepartmentToUser_AB_pkey";
ALTER TABLE "_DepartmentToUser" RENAME CONSTRAINT "_DepartmentRoleToUser_A_fkey" TO "_DepartmentToUser_A_fkey";
ALTER TABLE "_DepartmentToUser" RENAME CONSTRAINT "_DepartmentRoleToUser_B_fkey" TO "_DepartmentToUser_B_fkey";
ALTER INDEX "_DepartmentRoleToUser_B_index" RENAME TO "_DepartmentToUser_B_index";

ALTER TABLE "_DepartmentRoleToPasswordEntry" RENAME TO "_DepartmentToPasswordEntry";
ALTER TABLE "_DepartmentToPasswordEntry" RENAME CONSTRAINT "_DepartmentRoleToPasswordEntry_AB_pkey" TO "_DepartmentToPasswordEntry_AB_pkey";
ALTER TABLE "_DepartmentToPasswordEntry" RENAME CONSTRAINT "_DepartmentRoleToPasswordEntry_A_fkey" TO "_DepartmentToPasswordEntry_A_fkey";
ALTER TABLE "_DepartmentToPasswordEntry" RENAME CONSTRAINT "_DepartmentRoleToPasswordEntry_B_fkey" TO "_DepartmentToPasswordEntry_B_fkey";
ALTER INDEX "_DepartmentRoleToPasswordEntry_B_index" RENAME TO "_DepartmentToPasswordEntry_B_index";
