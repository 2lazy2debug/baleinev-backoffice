import { accessibleDepartmentRoleIds, getCurrentUserAccess, isAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { isVaultConfigured } from "@/lib/secret-crypto";

import { PasswordsPageClient } from "./client";

export default async function PasswordsPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const access = await getCurrentUserAccess();

  if (!isVaultConfigured()) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.passwords.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.passwords.notConfiguredTitle}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">{copy.passwords.notConfiguredBody}</p>
      </div>
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
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.passwords.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.passwords.heading}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">{copy.passwords.subtitle}</p>
      </header>

      <PasswordsPageClient
        locale={locale}
        entries={items}
        assignableDepartments={assignableDepartments}
        isAdmin={isAdmin(access)}
      />
    </div>
  );
}
