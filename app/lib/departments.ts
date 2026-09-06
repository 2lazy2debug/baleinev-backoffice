import { prisma } from "@/lib/db";

/**
 * Departments are the association's teams; budgets are named envelopes inside an
 * edition. They are independent — any department may be attached to any budget,
 * and `BudgetDepartment` is the join. The attachment carries no money: it only
 * decides which teams get to see a budget.
 */

/**
 * Every department, `id` and `name`, ordered by name — the options the budget
 * app offers when attaching departments to a budget. There is no filter: a
 * department does not have to "have a budget" to be attached to one.
 */
export async function attachableDepartments() {
  return prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
