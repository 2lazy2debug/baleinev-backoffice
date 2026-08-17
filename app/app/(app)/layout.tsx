import { TaskStatus, UserRole } from "@prisma/client";

import { AppShell } from "@/components/app-shell";
import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEdition } from "@/lib/edition-context";
import { getLocale } from "@/lib/i18n";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const access = await getCurrentUserAccess();

  const [selectedEdition, editions, pendingTaskCount] = await Promise.all([
    resolveEdition(),
    prisma.edition.findMany({
      orderBy: { name: "desc" },
      select: { id: true, name: true, closedAt: true },
    }),
    prisma.task.count({
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
      role={access.role}
      pendingTaskCount={pendingTaskCount}
      refundProfile={{
        firstName: access.refundFirstName,
        lastName: access.refundLastName,
        iban: access.refundIban,
        zip: access.refundZip,
        city: access.refundCity,
      }}
    >
      {children}
    </AppShell>
  );
}