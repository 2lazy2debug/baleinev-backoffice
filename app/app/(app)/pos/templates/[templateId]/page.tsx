import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEdition } from "@/lib/edition-context";
import { getLocale } from "@/lib/i18n";
import { formatPiece } from "@/lib/stock";
import { decimalToNumber } from "@/lib/utils";

import { StackEditor, type ArticleOption, type EditorCell } from "./stack-editor";

type Params = { params: Promise<{ templateId: string }> };

/**
 * The template editor: one ordered stack of tiles. Nothing here decides where
 * the pages fall — that is the till's business, and it depends on the width of
 * the device selling. **Preview** is where the author sees the grid.
 *
 * Every article is offered in the picker, including ones with `tracksStock`
 * off — that flag is exactly what makes a poured glass sellable. The whole
 * catalogue is handed over at once because the picker searches it here rather
 * than asking the server per keystroke; the brand and the size of one piece
 * come along because they are what tell two rows reading the same name apart —
 * the 33 cl and the 50 cl of the same beer.
 *
 * The units and the conversion table come too: the picker can create an
 * article on the spot, in the catalogue's own dialog, and that dialog needs
 * them.
 */
export default async function PosTemplateEditorPage({ params }: Params) {
  await requireAdmin();
  const locale = await getLocale();
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

  const [articles, units, conversions] = await Promise.all([
    prisma.stockElement.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, brand: true, unitQty: true, unit: { select: { name: true } } },
    }),
    prisma.stockUnit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.stockUnitConversion.findMany({
      select: {
        fromUnitId: true,
        toUnitId: true,
        factor: true,
        toUnit: { select: { name: true } },
      },
    }),
  ]);

  const cells: EditorCell[] = template.cells.map((cell) => ({
    id: cell.id,
    kind: cell.kind,
    elementId: cell.elementId,
    label: cell.label,
    price: decimalToNumber(cell.price).toFixed(2),
  }));

  const articleOptions: ArticleOption[] = articles.map((article) => ({
    id: article.id,
    name: article.name,
    brand: article.brand,
    piece: formatPiece(decimalToNumber(article.unitQty), article.unit.name),
  }));

  return (
    <StackEditor
      locale={locale}
      templateId={template.id}
      templateName={template.name}
      cells={cells}
      articles={articleOptions}
      articleNames={Object.fromEntries(articles.map((article) => [article.id, article.name]))}
      units={units}
      conversions={conversions.map((conversion) => ({
        fromUnitId: conversion.fromUnitId,
        toUnitId: conversion.toUnitId,
        toUnitName: conversion.toUnit.name,
        factor: decimalToNumber(conversion.factor),
      }))}
      isReadOnly={Boolean(edition?.closedAt)}
    />
  );
}
