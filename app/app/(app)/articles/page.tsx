import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { formatQuantity } from "@/lib/stock";
import { decimalToNumber } from "@/lib/utils";

import { PageHeader } from "@/components/ui";

import { ArticlesClient } from "./client";
import { CreateArticleButton } from "./create-article-button";

/**
 * The catalogue behind stock — everything the festival can stock or sell. Its
 * own app now, and admin-only: the one way a non-admin adds a `StockElement` is
 * the scan-to-create path inside "add stock", which is stock content rather than
 * configuration.
 */
export default async function ArticlesPage() {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const [elements, units, conversions, stocked] = await Promise.all([
    prisma.stockElement.findMany({ include: { unit: true }, orderBy: { name: "asc" } }),
    prisma.stockUnit.findMany({ orderBy: { name: "asc" } }),
    prisma.stockUnitConversion.findMany({ include: { toUnit: true }, orderBy: { toUnit: { name: "asc" } } }),
    // One roll-up for the whole list rather than a count per row: what makes an
    // article undeletable is the pieces sitting in *any* stock.
    prisma.stockItem.groupBy({ by: ["elementId"], _sum: { quantity: true } }),
  ]);

  const inStock = new Map(stocked.map((row) => [row.elementId, row._sum.quantity ?? 0]));
  const unitOptions = units.map((unit) => ({ id: unit.id, name: unit.name }));
  const conversionOptions = conversions.map((conversion) => ({
    fromUnitId: conversion.fromUnitId,
    toUnitId: conversion.toUnitId,
    toUnitName: conversion.toUnit.name,
    factor: decimalToNumber(conversion.factor),
  }));

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.articles.title}
        title={copy.articles.title}
        description={copy.articles.subtitle}
        actions={<CreateArticleButton locale={locale} units={unitOptions} conversions={conversionOptions} />}
      />

      <ArticlesClient
        locale={locale}
        units={unitOptions}
        conversions={conversionOptions}
        items={elements.map((element) => ({
          id: element.id,
          name: element.name,
          brand: element.brand ?? "",
          barcode: element.barcode ?? "",
          unitId: element.unitId,
          unitName: element.unit.name,
          unitQty: formatQuantity(decimalToNumber(element.unitQty)),
          expireable: element.expireable,
          tracksStock: element.tracksStock,
          inStock: inStock.get(element.id) ?? 0,
        }))}
      />
    </div>
  );
}
