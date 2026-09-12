import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

import { PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";

import { EventStaffLogClient } from "./client";

/** How far back the screen reads. Beyond this the log is a report, not a screen. */
const STAFF_LOG_LIMIT = 300;

export default async function EventStaffLogPage() {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const logs = await prisma.eventStaffLog.findMany({
    take: STAFF_LOG_LIMIT,
    orderBy: { createdAt: "desc" },
  });

  // Timestamps are formatted here rather than in the client: a log entry
  // carries a time of day, and a browser in another timezone would render a
  // different string over the server's markup.
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CH" : "en-CH", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.events.title}
        title={copy.events.logsTitle}
        description={copy.events.logsSubtitle}
        actions={
          <Link
            href="/events"
            title={copy.events.backToEvents}
            aria-label={copy.events.backToEvents}
            className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
          >
            <ArrowLeft />
            <span className="hidden lg:inline">{copy.events.backToEvents}</span>
          </Link>
        }
      />

      <EventStaffLogClient
        locale={locale}
        logs={logs.map((log) => ({
          id: log.id,
          when: when.format(log.createdAt),
          action: log.action,
          eventName: log.eventName,
          shiftLabel: log.shiftLabel,
          actorName: log.actorName,
          subjectName: log.subjectName,
        }))}
      />
    </div>
  );
}
