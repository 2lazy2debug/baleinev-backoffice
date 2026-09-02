import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { syncDepartmentRolesFromDepartments } from "@/lib/department-roles";
import { getDictionary, getLocale } from "@/lib/i18n";

import { UsersPageClient } from "./client";
import { CreateUserModal } from "./create-user-modal";
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
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.users.title}
        title={copy.users.manage}
        description={copy.users.subtitle}
        actions={
          <CreateUserModal
            departmentRoles={departmentRoles}
            copy={{
              create: copy.users.create,
              cancel: copy.shell.cancel,
              createButton: copy.users.createButton,
              passwordRules: copy.users.passwordRules,
              name: copy.users.name,
              email: copy.users.email,
              password: copy.users.password,
              role: copy.users.role,
              admin: copy.users.admin,
              department: copy.users.department,
              departments: copy.users.departments,
            }}
          />
        }
      />

      <UsersPageClient users={users} departmentRoles={departmentRoles} currentUserId={access.id} copy={copy} />
    </div>
  );
}
