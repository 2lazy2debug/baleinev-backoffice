import { TaskStatus, UserRole } from "@prisma/client";

import { AppShell } from "@/components/app-shell";
import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const access = await getCurrentUserAccess();

  const [activeEdition, pendingTaskCount] = await Promise.all([
    prisma.edition.findFirst({
      where: { isActive: true },
      select: { name: true },
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
      activeEditionName={activeEdition?.name}
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