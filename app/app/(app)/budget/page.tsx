import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import BudgetPageClient from "./client";
import { EmptyPage } from "@/components/ui";

export default async function BudgetPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const access = await getCurrentUserAccess();

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

  // The screen is one row per *department that budgets*, not per budget row: a
  // department turns its budget on in /departments and starts with an empty one,
  // and the `DepartmentBudget` appears only once a line is written into it.
  const [departments, journalEntries] = await Promise.all([
    prisma.department.findMany({
      where: {
        hasBudget: true,
        ...(access.role === "ADMIN" ? {} : { id: { in: access.departmentIds } }),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        budgets: {
          where: { editionId: activeEdition.id },
          select: {
            budgetLines: {
              orderBy: [{ accountType: "asc" }, { createdAt: "desc" }],
              select: { id: true, accountType: true, label: true, amount: true, notes: true },
            },
          },
        },
      },
    }),
    // Journal entries carry the edition themselves and point straight at the
    // department, so the actuals come from one query rather than from each
    // department's budget row.
    prisma.journalEntry.findMany({
      where: { editionId: activeEdition.id, departmentId: { not: null } },
      orderBy: [{ date: "desc" }, { sequenceNumber: "desc" }],
      select: {
        id: true,
        departmentId: true,
        accountType: true,
        label: true,
        amount: true,
        date: true,
        referenceNumber: true,
        counterparty: true,
      },
    }),
  ]);

  return (
    <BudgetPageClient
      locale={locale}
      editionName={activeEdition.name}
      canManage={access.role === "ADMIN"}
      emptyStateMessage={access.role === "ADMIN" ? copy.budget.noDepartments : copy.budget.noAssignedDepartment}
      departments={departments.map((department) => ({
        id: department.id,
        name: department.name,
        budgetLines: (department.budgets[0]?.budgetLines ?? []).map((line) => ({
          id: line.id,
          accountType: line.accountType,
          label: line.label,
          amount: decimalToNumber(line.amount),
          notes: line.notes,
        })),
        journalEntries: journalEntries
          .filter((entry) => entry.departmentId === department.id)
          .map((entry) => ({
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
