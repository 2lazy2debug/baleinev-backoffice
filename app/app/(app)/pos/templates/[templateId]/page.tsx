import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEdition } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { formatPiece } from "@/lib/stock";
import { decimalToNumber } from "@/lib/utils";

import { GridEditor, type EditorCell } from "./grid-editor";

type Params = { params: Promise<{ templateId: string }> };

/**
 * The grid editor: a paginated 3x3 of tiles, the ninth of every page a drawn
 * "custom sale" button. Every article is offered in the picker, including ones
 * with `tracksStock` off — that flag is exactly what makes a poured glass
 * sellable. The whole catalogue is handed over at once because the picker
 * searches it here rather than asking the server per keystroke; the brand and
 * the size of one piece come along because they are what tell two rows reading
 * the same name apart — the 33 cl and the 50 cl of the same beer.
 */
export default async function PosTemplateEditorPage({ params }: Params) {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const { templateId } = await params;

  const edition = await resolveEdition();

  const template = edition
    ? await prisma.posTemplate.findFirst({
        where: { id: templateId, editionId: edition.id },
        include: { cells: { orderBy: { position: "asc" } } },
      })
    : null;

  if (!template) {
    notFound();
  }

  const articles = await prisma.stockElement.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, brand: true, unitQty: true, unit: { select: { name: true } } },
  });

  const cells: EditorCell[] = template.cells.map((cell) => ({
    id: cell.id,
    position: cell.position,
    elementId: cell.elementId,
    label: cell.label,
    price: decimalToNumber(cell.price).toFixed(2),
  }));

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.pos.title}
        title={template.name}
        actions={
          <Link
            href="/pos/templates"
            title={copy.pos.backToTemplates}
            aria-label={copy.pos.backToTemplates}
            className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
          >
            <ArrowLeft />
            <span className="hidden lg:inline">{copy.pos.backToTemplates}</span>
          </Link>
        }
      />

      <GridEditor
        locale={locale}
        templateId={template.id}
        cells={cells}
        articles={articles.map((article) => ({
          id: article.id,
          name: article.name,
          brand: article.brand,
          piece: formatPiece(decimalToNumber(article.unitQty), article.unit.name),
        }))}
        isReadOnly={Boolean(edition?.closedAt)}
      />
    </div>
  );
}
