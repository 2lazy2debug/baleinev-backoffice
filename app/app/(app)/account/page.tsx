import { PageHeader } from "@/components/ui";
import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { syncDepartmentRolesFromDepartments } from "@/lib/department-roles";
import { getDictionary, getLocale } from "@/lib/i18n";
import { getPendingDepartmentAccessRequests } from "@/lib/tasks";
import { isTwoFactorConfigured } from "@/lib/two-factor";

import { AccountPageClient } from "./client";

/**
 * The signed-in user's own account — name, bank details, password, two-factor
 * sign-in and asking to join a department.
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
  const [departments, pendingRequests, twoFactor] = await Promise.all([
    prisma.departmentRole.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getPendingDepartmentAccessRequests(access.id),
    // Read here rather than off the access context: that context travels to
    // every screen, and this flag is only ever this one card's business.
    prisma.user.findUnique({ where: { id: access.id }, select: { twoFactorEnabled: true } }),
  ]);

  const pendingRequestIds = new Set(pendingRequests.map((request) => request.id));

  return (
    <div className="space-y-4 lg:space-y-8">
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
          (department) =>
            !access.departmentRoleNames.includes(department.name) && !pendingRequestIds.has(department.id),
        )}
        pendingDepartmentRequests={pendingRequests}
        twoFactor={{
          enabled: twoFactor?.twoFactorEnabled ?? false,
          // No master key on this server means no seed can be sealed, so the
          // card says so instead of offering a button that would only fail.
          configured: isTwoFactorConfigured(),
        }}
      />
    </div>
  );
}
