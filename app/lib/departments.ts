import { prisma } from "@/lib/db";

/**
 * Departments are edition-independent; their budgets are not. `Department.hasBudget`
 * says whether a department budgets at all, and a `DepartmentBudget` row holds the
 * lines it planned inside one edition.
 *
 * Those rows are created on first use rather than up front. A department that
 * budgets does not owe every edition a budget — an edition it took no part in
 * would otherwise carry an empty one forever — so the row appears the moment a
 * line is written into it, and `carryOverEdition` copies the ones that exist.
 */

/**
 * The departments a budget line or a journal entry may be booked against — the
 * ones that budget at all. Edition-independent, like the departments themselves:
 * what an edition holds is the amounts, not the list.
 */
export async function budgetingDepartments() {
  return prisma.department.findMany({
    where: { hasBudget: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Refuses a booking against a department that does not budget. The foreign key
 * only says the department exists; this says it is one of the ones the budget
 * and the journal are allowed to name.
 */
export async function assertDepartmentsBudget(departmentIds: string[]): Promise<void> {
  const ids = [...new Set(departmentIds)];

  if (ids.length === 0) {
    return;
  }

  const budgeting = await prisma.department.count({ where: { id: { in: ids }, hasBudget: true } });

  if (budgeting !== ids.length) {
    throw new Error("One or more selected departments have no budget.");
  }
}

/** The budget of one department in one edition, opened on first use. */
export async function resolveDepartmentBudgetId(editionId: string, departmentId: string): Promise<string> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { hasBudget: true },
  });

  if (!department) {
    throw new Error("Department not found.");
  }

  if (!department.hasBudget) {
    throw new Error("This department has no budget. Turn its budget on in Departments first.");
  }

  const budget = await prisma.departmentBudget.upsert({
    where: { editionId_departmentId: { editionId, departmentId } },
    update: {},
    create: { editionId, departmentId },
    select: { id: true },
  });

  return budget.id;
}

/**
 * What a department's budget already holds, across every edition — the reason a
 * budget can be turned off, or the reason it cannot. Budget lines and journal
 * entries are the two kinds of data that would lose their home; expense reports
 * and invites point at the department itself and survive either way.
 */
export async function departmentBudgetUsage(departmentId: string) {
  const [budgetLines, journalEntries] = await Promise.all([
    prisma.budgetLine.count({ where: { departmentBudget: { departmentId } } }),
    prisma.journalEntry.count({ where: { departmentId } }),
  ]);

  return { budgetLines, journalEntries, isUsed: budgetLines > 0 || journalEntries > 0 };
}
