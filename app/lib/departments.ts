import { prisma } from "@/lib/db";

/**
 * Departments are the association's teams; budgets are named envelopes inside an
 * edition. A department may be attached to several budgets and a budget to
 * several departments — `BudgetDepartment` is the join, and it carries no money.
 */

/**
 * The departments that may be *attached to* a budget — the ones that budget at
 * all. Edition-independent, like the departments themselves: what an edition
 * holds is the amounts, not the list.
 */
export async function budgetingDepartments() {
  return prisma.department.findMany({
    where: { hasBudget: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * What the budgets a department is attached to already hold — the reason its
 * attachment can be turned off, or the reason turning it off would hide live
 * money from a team. Budget lines and journal entries are the two kinds of data
 * a team would stop seeing.
 */
export async function departmentBudgetUsage(departmentId: string) {
  const [budgetLines, journalEntries] = await Promise.all([
    prisma.budgetLine.count({ where: { budget: { departments: { some: { departmentId } } } } }),
    prisma.journalEntry.count({ where: { budget: { departments: { some: { departmentId } } } } }),
  ]);

  return { budgetLines, journalEntries, isUsed: budgetLines > 0 || journalEntries > 0 };
}
