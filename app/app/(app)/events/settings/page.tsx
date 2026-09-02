import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

import { PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";

import { EventSettingsClient } from "./client";
import { EventSettingsCreateButton } from "./create-button";

/**
 * The events app's configuration: the event types. Admins only.
 *
 * They are global rather than edition-scoped — the same reason they stayed
 * editable in a closed edition when they lived on the events screen itself.
 */
export default async function EventSettingsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const eventTypes = await prisma.eventType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { events: true } } },
  });

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.events.title}
        title={copy.events.settingsTitle}
        description={copy.events.settingsSubtitle}
        actions={
          <>
            <Link
              href="/events"
              title={copy.events.backToEvents}
              aria-label={copy.events.backToEvents}
              className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
            >
              <ArrowLeft />
              <span className="hidden lg:inline">{copy.events.backToEvents}</span>
            </Link>
            <EventSettingsCreateButton locale={locale} />
          </>
        }
      />

      <EventSettingsClient
        locale={locale}
        eventTypes={eventTypes.map((eventType) => ({
          id: eventType.id,
          name: eventType.name,
          description: eventType.description ?? "",
          color: eventType.color ?? "",
          eventCount: eventType._count.events,
        }))}
      />
    </div>
  );
}
