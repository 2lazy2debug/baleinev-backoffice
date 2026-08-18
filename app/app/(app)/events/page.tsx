import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";

import EventsPageClient from "./client";

export default async function EventsPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const isAdmin = access.role === "ADMIN";

  const editionId = await resolveEditionIdOrNull();

  const [eventTypes, activeEdition, allUsers] = await Promise.all([
    prisma.eventType.findMany({ orderBy: { name: "asc" } }),
    editionId ? prisma.edition.findUnique({
      where: { id: editionId },
      include: {
        events: {
          orderBy: { startDate: "asc" },
          include: {
            eventType: true,
            costCenter: true,
            days: {
              orderBy: { date: "asc" },
              include: {
                shifts: {
                  orderBy: { startTime: "asc" },
                  include: {
                    assignments: {
                      include: { user: { select: { id: true, name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
        costCenters: { orderBy: { code: "asc" } },
      },
    }) : Promise.resolve(null),
    isAdmin ? prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.events.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.events.title}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">{copy.common.noEditionSelected}</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.events.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.events.title} — {activeEdition.name}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">{copy.events.subtitle}</p>
      </header>

      <EventsPageClient
        isAdmin={isAdmin}
        accessId={access.id}
        eventTypes={eventTypes}
        costCenters={activeEdition.costCenters}
        events={activeEdition.events}
        allUsers={allUsers}
        editionStartDate={activeEdition.startDate ? activeEdition.startDate.toISOString().slice(0, 10) : null}
        editionEndDate={activeEdition.endDate ? activeEdition.endDate.toISOString().slice(0, 10) : null}
        copy={copy.events}
      />
    </div>
  );
}
