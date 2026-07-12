import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { syncDepartmentRolesFromDepartments } from "@/lib/department-roles";
import { getDictionary, getLocale } from "@/lib/i18n";

import { UsersPageClient } from "./client";

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
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.users.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.users.manage}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">{copy.users.subtitle}</p>
      </header>

      <UsersPageClient users={users} departmentRoles={departmentRoles} currentUserId={access.id} copy={copy} />
    </div>
  );
}
