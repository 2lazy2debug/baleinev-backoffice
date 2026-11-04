import { TaskStatus, UserRole } from "@prisma/client";

import { AppShell } from "@/components/app-shell";
import { canManageMoneyAccounts, getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEdition } from "@/lib/edition-context";
import { getLocale } from "@/lib/i18n";
import { getTheme } from "@/lib/theme";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const theme = await getTheme();
  const access = await getCurrentUserAccess({ allowGuest: true });
  const isGuest = access.role === "GUEST";

  const [selectedEdition, editions, pendingTaskCount] = await Promise.all([
    resolveEdition(),
    prisma.edition.findMany({
      // A guest is always in the default edition (lib/edition-context.ts) and has no
      // picker; that one row still drives the read-only mode and the closed banner.
      where: isGuest ? { isDefault: true } : undefined,
      orderBy: { name: "desc" },
      select: { id: true, name: true, closedAt: true },
    }),
    isGuest
      ? Promise.resolve(0)
      : prisma.task.count({
          where: {
            status: TaskStatus.PENDING,
            OR: [
              { assignedToUserId: access.id },
              { assignedToRole: access.role as UserRole },
            ],
          },
        }),
  ]);

  return (
    <AppShell
      userName={access.userName ?? access.email ?? "Admin"}
      editions={editions.map((edition) => ({
        id: edition.id,
        name: edition.name,
        isClosed: edition.closedAt !== null,
      }))}
      selectedEditionId={selectedEdition?.id ?? null}
      locale={locale}
      theme={theme}
      role={access.role}
      canManageMoneyAccounts={canManageMoneyAccounts(access)}
      pendingTaskCount={pendingTaskCount}
    >
      {children}
    </AppShell>
  );
}