import { WritableEditionOnly } from "@/components/edition-read-only";
import { EmptyPage, PageHeader } from "@/components/ui";
import { POS_PAGE_SLOTS } from "@/lib/cash";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";

import { PosTemplatesClient, type PosTemplateRow } from "./client";
import { CreateTemplateModal } from "./create-template-modal";

/**
 * The templates a bar can open on for the night: a paginated 3x3 grid of
 * articles and prices. Admin-only and per edition — a template is configuration.
 * Nothing sells anything here; that is the selling app (104).
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
    include: {
      _count: { select: { cells: true } },
      // The page count comes from the highest slot in use, not the tile count —
      // a page may have holes, so eight tiles can still span two pages.
      cells: { select: { position: true } },
    },
  });

  const rows: PosTemplateRow[] = templates.map((template) => ({
    id: template.id,
    name: template.name,
    tileCount: template._count.cells,
    pageCount: template.cells.reduce(
      (max, cell) => Math.max(max, Math.floor(cell.position / POS_PAGE_SLOTS) + 1),
      1,
    ),
  }));

  const createButton = (
    <WritableEditionOnly>
      <CreateTemplateModal locale={locale} />
    </WritableEditionOnly>
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
        actions={createButton}
      />

      <PosTemplatesClient locale={locale} templates={rows} />
    </div>
  );
}
