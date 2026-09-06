-- Drop `Department.hasBudget`.
--
-- 017 made budgets and departments many-to-many: a budget is a named envelope,
-- `BudgetDepartment` is a join that carries no money, and a department may be
-- attached to any budget from the budget app. That left `hasBudget` as a flag
-- that gated nothing real — it only filtered the attach picker. Budgets and
-- departments are independent entities now, so the flag goes.
--
-- The column has no foreign keys and nothing references it after this release's
-- code change, so a plain DROP is safe. Attachments already made are untouched.

ALTER TABLE "Department" DROP COLUMN "hasBudget";
