import { getCurrentUserAccess } from "@/lib/access";
import { visibleBudgetsWhere } from "@/lib/budgets";
import { prisma } from "@/lib/db";
import { budgetingDepartments } from "@/lib/departments";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import BudgetPageClient from "./client";
import { EmptyPage } from "@/components/ui";

export default async function BudgetPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const access = await getCurrentUserAccess();
  const canManage = access.role === "ADMIN";

  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId
    ? await prisma.edition.findUnique({ where: { id: editionId }, select: { id: true, name: true } })
    : null;

  if (!activeEdition) {
    return (
      <EmptyPage eyebrow={copy.budget.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  // One row per budget — a named envelope, its attached departments, its planned
  // lines and its own journal entries. The visibility rule lives in
  // `visibleBudgetsWhere` and nowhere else; actuals are the budget's own entries,
  // so there is no second query to match up by department.
  const [budgets, attachableDepartments] = await Promise.all([
    prisma.budget.findMany({
      where: visibleBudgetsWhere(access, activeEdition.id),
      orderBy: { name: "asc" },
      include: {
        departments: { include: { department: { select: { id: true, name: true } } } },
        budgetLines: {
          orderBy: [{ accountType: "asc" }, { createdAt: "desc" }],
          select: { id: true, accountType: true, label: true, amount: true, notes: true },
        },
        journalEntries: {
          orderBy: [{ date: "desc" }, { sequenceNumber: "desc" }],
          select: {
            id: true,
            accountType: true,
            label: true,
            amount: true,
            date: true,
            referenceNumber: true,
            counterparty: true,
          },
        },
      },
    }),
    canManage ? budgetingDepartments() : Promise.resolve([]),
  ]);

  return (
    <BudgetPageClient
      locale={locale}
      editionName={activeEdition.name}
      canManage={canManage}
      attachableDepartments={attachableDepartments}
      budgets={budgets.map((budget) => ({
        id: budget.id,
        name: budget.name,
        departments: budget.departments
          .map((link) => ({ id: link.department.id, name: link.department.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        budgetLines: budget.budgetLines.map((line) => ({
          id: line.id,
          accountType: line.accountType,
          label: line.label,
          amount: decimalToNumber(line.amount),
          notes: line.notes,
        })),
        journalEntries: budget.journalEntries.map((entry) => ({
          id: entry.id,
          accountType: entry.accountType,
          label: entry.label,
          amount: decimalToNumber(entry.amount),
          date: entry.date.toISOString(),
          referenceNumber: entry.referenceNumber,
          counterparty: entry.counterparty,
        })),
      }))}
    />
  );
}
