import Link from "next/link";
import { History } from "lucide-react";

import { PosCellKind } from "@prisma/client";

import { WritableEditionOnly } from "@/components/edition-read-only";
import { EmptyPage, PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";

import { PosTemplatesClient, type PosTemplateRow } from "./client";
import { CreateTemplateModal } from "./create-template-modal";

/**
 * The templates a bar can open on for the night: an ordered stack of articles
 * and prices. Admin-only and per edition — a template is configuration.
 * Nothing sells anything here; that is the selling app (104).
 *
 * There is no page count on this list any more. A template is a stack, and how
 * many pages it makes depends on the width of whatever device opens it — that
 * is a fact about a phone, not about a template.
 */
export default async function PosTemplatesPage() {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editionId = await resolveEditionIdOrNull();

  if (!editionId) {
    return (
      <EmptyPage eyebrow={copy.pos.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  const templates = await prisma.posTemplate.findMany({
    where: { editionId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          cells: { where: { kind: PosCellKind.ARTICLE } },
        },
      },
    },
  });

  const rows: PosTemplateRow[] = templates.map((template) => ({
    id: template.id,
    name: template.name,
    tileCount: template._count.cells,
  }));

  const sessionsLink = (
    <Link
      href="/pos/sessions"
      title={copy.pos.viewSessions}
      aria-label={copy.pos.viewSessions}
      className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
    >
      <History />
      <span className="hidden lg:inline">{copy.pos.viewSessions}</span>
    </Link>
  );

  const createButton = (
    <WritableEditionOnly>
      <CreateTemplateModal locale={locale} />
    </WritableEditionOnly>
  );

  const headerActions = (
    <>
      {sessionsLink}
      {createButton}
    </>
  );

  if (rows.length === 0) {
    return (
      <EmptyPage eyebrow={copy.pos.title} title={copy.pos.noTemplates} actions={createButton}>
        {copy.pos.noTemplatesHint}
      </EmptyPage>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.pos.title}
        title={copy.pos.templatesTitle}
        description={copy.pos.templatesSubtitle}
        actions={headerActions}
      />

      <PosTemplatesClient locale={locale} templates={rows} />
    </div>
  );
}
