import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { syncDepartmentRolesFromDepartments } from "@/lib/department-roles";
import { getDictionary, getLocale } from "@/lib/i18n";

import { UsersPageClient } from "./client";
import { PageHeader } from "@/components/ui";

export default async function UsersPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const access = await requireAdmin();
  await syncDepartmentRolesFromDepartments();

  const [users, departmentRoles] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: { departmentRoles: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
    }),
    prisma.departmentRole.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={copy.users.title} title={copy.users.manage} description={copy.users.subtitle} />

      <UsersPageClient users={users} departmentRoles={departmentRoles} currentUserId={access.id} copy={copy} />
    </div>
  );
}
