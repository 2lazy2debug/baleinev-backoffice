import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

import { UsersPageClient } from "./client";
import { CreateUserModal } from "./create-user-modal";
import { PageHeader } from "@/components/ui";

export default async function UsersPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const access = await requireAdmin();

  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      // `select`, not `include`: the list goes to a client component, and the
      // password hash and the sealed 2FA seed have no business in the browser.
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        twoFactorEnabled: true,
        departments: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.users.title}
        title={copy.users.manage}
        description={copy.users.subtitle}
        actions={
          <CreateUserModal
            departments={departments}
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

      <UsersPageClient users={users} departments={departments} currentUserId={access.id} copy={copy} />
    </div>
  );
}
