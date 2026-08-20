import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";

import EventsPageClient from "./client";
import { EmptyPage, PageHeader } from "@/components/ui";

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
      <EmptyPage eyebrow={copy.events.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={copy.events.title}
        title={<>{copy.events.title} — {activeEdition.name}</>}
        description={copy.events.subtitle}
      />

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
