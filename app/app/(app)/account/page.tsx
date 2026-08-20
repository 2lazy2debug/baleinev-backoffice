import { PageHeader } from "@/components/ui";
import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { syncDepartmentRolesFromDepartments } from "@/lib/department-roles";
import { getDictionary, getLocale } from "@/lib/i18n";

import { AccountPageClient } from "./client";

/**
 * The signed-in user's own account — name, bank details and password, plus the
 * two things that are drawn but not wired yet (joining a department, 2FA).
 *
 * Global, not edition-scoped: it is listed in AppShell's GLOBAL_ROUTES, so a
 * closed edition does not put this screen in read-only.
 */
export default async function AccountPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const access = await getCurrentUserAccess();

  // Same call `/users` makes: department roles exist only once a department of
  // that name has been created in some edition.
  await syncDepartmentRolesFromDepartments();
  const departments = await prisma.departmentRole.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={copy.account.title}
        title={copy.account.heading}
        description={copy.account.subtitle}
      />

      <AccountPageClient
        locale={locale}
        profile={{
          name: access.userName,
          email: access.email,
          role: access.role,
          departmentRoleNames: access.departmentRoleNames,
        }}
        bankDetails={{
          firstName: access.refundFirstName,
          lastName: access.refundLastName,
          iban: access.refundIban,
          zip: access.refundZip,
          city: access.refundCity,
        }}
        joinableDepartments={departments.filter(
          (department) => !access.departmentRoleNames.includes(department.name),
        )}
      />
    </div>
  );
}
