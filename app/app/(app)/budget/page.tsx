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
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
    include: {
      departments: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { journalEntries: true } },
          budgetLines: {
            orderBy: [{ accountType: "asc" }, { createdAt: "desc" }],
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
      },
    },
  }) : null;

  if (!activeEdition) {
    return (
      <EmptyPage eyebrow={copy.budget.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  const visibleDepartments = access.role === "ADMIN"
    ? activeEdition.departments
    : activeEdition.departments.filter((department) => access.departmentRoleNames.includes(department.name));

  return (
    <BudgetPageClient
      locale={locale}
      editionName={activeEdition.name}
      canManage={access.role === "ADMIN"}
      emptyStateMessage={access.role === "ADMIN" ? copy.budget.noDepartments : copy.budget.noAssignedDepartment}
      departments={visibleDepartments.map((department) => ({
        id: department.id,
        name: department.name,
        journalEntriesCount: department._count.journalEntries,
        budgetLines: department.budgetLines.map((line) => ({
          id: line.id,
          accountType: line.accountType,
          label: line.label,
          amount: decimalToNumber(line.amount),
          notes: line.notes,
        })),
        journalEntries: department.journalEntries.map((entry) => ({
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
