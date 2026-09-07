import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EmptyPage, PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { totalsFor } from "@/lib/pos";

import { orderMethods, type PosMethod } from "../pos-methods";
import { PosSessionsClient, type SessionRow } from "./client";

/**
 * The read side of the POS, admin-only: every session in the edition — closed
 * ones included — with what each one took and by which means. Nothing here
 * writes anything; the takings are booked when the *cash register* is closed.
 *
 * A festival night is thousands of sale lines, so this screen loads none of
 * them — only `method` and `total` per sale, enough for the roll-up.
 */
export default async function PosSessionsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editionId = await resolveEditionIdOrNull();

  const backLink = (
    <Link
      href="/pos"
      title={copy.pos.title}
      aria-label={copy.pos.title}
      className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
    >
      <ArrowLeft />
      <span className="hidden lg:inline">{copy.pos.title}</span>
    </Link>
  );

  if (!editionId) {
    return (
      <EmptyPage eyebrow={copy.pos.sessionsTitle} title={copy.common.noEditionSelected} actions={backLink}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  const sessions = await prisma.posSession.findMany({
    where: { editionId },
    orderBy: { openedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      openedAt: true,
      template: { select: { name: true } },
      cashRegister: { select: { name: true } },
      openedBy: { select: { name: true } },
      methods: { select: { method: true } },
      sales: { select: { method: true, total: true } },
    },
  });

  if (sessions.length === 0) {
    return (
      <EmptyPage eyebrow={copy.pos.sessionsTitle} title={copy.pos.noSessionsYet} actions={backLink}>
        {copy.pos.noSessionsYetHint}
      </EmptyPage>
    );
  }

  // Dates are formatted on the server: a session carries a wall-clock opening
  // time, and a browser in another timezone would re-render the string.
  const onDate = new Intl.DateTimeFormat(locale === "fr" ? "fr-CH" : "en-CH", { dateStyle: "medium" });

  const rows: SessionRow[] = sessions.map((session) => {
    const methods = orderMethods(session.methods.map((row) => row.method as PosMethod));
    const totals = totalsFor(session.sales, methods);

    return {
      id: session.id,
      name: session.name,
      templateName: session.template.name,
      registerName: session.cashRegister?.name ?? null,
      openedOn: onDate.format(session.openedAt),
      openedBy: session.openedBy?.name ?? null,
      status: session.status,
      saleCount: totals.saleCount,
      byMethod: totals.byMethod,
      total: totals.total,
    };
  });

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.pos.title}
        title={copy.pos.sessionsTitle}
        description={copy.pos.sessionsSubtitle}
        actions={backLink}
      />

      <PosSessionsClient locale={locale} sessions={rows} />
    </div>
  );
}
