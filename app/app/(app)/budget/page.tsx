import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import BudgetPageClient from "./client";

export default async function BudgetPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const access = await getCurrentUserAccess();

  const activeEdition = await prisma.edition.findFirst({
    where: { isActive: true },
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
  });

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.budget.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noActiveEdition}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">{copy.common.createAndActivateEdition}</p>
      </div>
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
