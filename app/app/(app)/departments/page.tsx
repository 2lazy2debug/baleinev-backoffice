import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

import { DepartmentsClient } from "./client";
import { CreateDepartmentModal } from "./create-department-modal";

/**
 * The association's departments. Admins only, and deliberately not
 * edition-scoped: a department outlives an edition. Budgets are independent —
 * a department is attached to them from /budget, never the other way round.
 */
export default async function DepartmentsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      abbreviation: true,
      _count: { select: { users: true } },
      budgets: {
        select: { budget: { select: { name: true } } },
        orderBy: { budget: { name: "asc" } },
      },
    },
  });

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.departments.title}
        title={copy.departments.title}
        description={copy.departments.subtitle}
        actions={<CreateDepartmentModal locale={locale} />}
      />

      <DepartmentsClient
        locale={locale}
        departments={departments.map((department) => ({
          id: department.id,
          name: department.name,
          abbreviation: department.abbreviation,
          peopleCount: department._count.users,
          budgetNames: [...new Set(department.budgets.map((link) => link.budget.name))],
        }))}
      />
    </div>
  );
}
