import type { Prisma } from "@prisma/client";

import { type AccessContext, isAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";

/**
 * The one place the budget visibility rule lives. An admin sees every budget in
 * the edition; anyone else sees only the budgets one of their departments is
 * attached to. A budget with no `BudgetDepartment` row therefore never matches
 * for a non-admin — that is the admin-only rule, expressed once.
 */
export function visibleBudgetsWhere(access: AccessContext, editionId: string): Prisma.BudgetWhereInput {
  if (isAdmin(access)) {
    return { editionId };
  }

  return {
    editionId,
    departments: { some: { departmentId: { in: access.departmentIds } } },
  };
}

/**
 * Refuses a journal entry booked against a budget that belongs to another
 * edition. The foreign key only says the budget exists; this says it is the
 * active edition's.
 */
export async function assertBudgetInEdition(budgetId: string, editionId: string): Promise<void> {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { editionId: true },
  });

  if (!budget || budget.editionId !== editionId) {
    throw new Error("That budget does not belong to the active edition.");
  }
}

/**
 * The budget to prefill when turning an expense report into a journal entry.
 * Returns the budget id only when the department is attached to exactly one
 * budget in that edition — guessing between two would book real money into the
 * wrong envelope, so an empty picker is the honest answer.
 */
export async function resolveDefaultBudgetForDepartment(
  editionId: string,
  departmentId: string,
): Promise<string | null> {
  const budgets = await prisma.budget.findMany({
    where: { editionId, departments: { some: { departmentId } } },
    select: { id: true },
    take: 2,
  });

  return budgets.length === 1 ? budgets[0].id : null;
}
