import { accessibleDepartmentRoleIds, getCurrentUserAccess, isAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { isVaultConfigured } from "@/lib/secret-crypto";

import { PasswordsPageClient } from "./client";
import { EmptyPage, PageHeader } from "@/components/ui";

export default async function PasswordsPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const access = await getCurrentUserAccess();

  if (!isVaultConfigured()) {
    return (
      <EmptyPage eyebrow={copy.passwords.title} title={copy.passwords.notConfiguredTitle}>
        {copy.passwords.notConfiguredBody}
      </EmptyPage>
    );
  }

  const visibleDepartmentIds = accessibleDepartmentRoleIds(access);

  const [entries, assignableDepartments] = await Promise.all([
    prisma.passwordEntry.findMany({
      where:
        visibleDepartmentIds === null
          ? {}
          : { departmentRoles: { some: { id: { in: visibleDepartmentIds } } } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        login: true,
        website: true,
        totpCipher: true,
        departmentRoles: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
    }),
    isAdmin(access)
      ? prisma.departmentRole.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : prisma.departmentRole.findMany({
          where: { id: { in: access.departmentRoleIds } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
  ]);

  // Deliberately strip every secret column: the client only learns whether a
  // 2FA seed exists, never the ciphertext. Secrets arrive only via reveal actions.
  const items = entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    login: entry.login,
    website: entry.website,
    has2fa: entry.totpCipher !== null,
    departmentRoles: entry.departmentRoles,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={copy.passwords.title}
        title={copy.passwords.heading}
        description={copy.passwords.subtitle}
      />

      <PasswordsPageClient
        locale={locale}
        entries={items}
        assignableDepartments={assignableDepartments}
        isAdmin={isAdmin(access)}
      />
    </div>
  );
}
