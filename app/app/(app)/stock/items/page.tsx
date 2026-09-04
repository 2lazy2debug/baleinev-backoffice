import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentUserAccess, isAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { formatQuantity } from "@/lib/stock";
import { decimalToNumber } from "@/lib/utils";

import { PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";

import { StockItemsClient } from "./client";
import { CreateItemButton } from "./create-item-button";

/**
 * The catalogue behind every stock entry. Open to everyone signed in: the person
 * holding a thing the book has never held is the one who can name it.
 */
export default async function StockItemsPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const [elements, units, stocked] = await Promise.all([
    prisma.stockElement.findMany({ include: { unit: true }, orderBy: { name: "asc" } }),
    prisma.stockUnit.findMany({ orderBy: { name: "asc" } }),
    // One roll-up for the whole list rather than a count per row: what makes an
    // item undeletable is the pieces sitting in *any* stock.
    prisma.stockItem.groupBy({ by: ["elementId"], _sum: { quantity: true } }),
  ]);

  const inStock = new Map(stocked.map((row) => [row.elementId, row._sum.quantity ?? 0]));
  const unitOptions = units.map((unit) => ({ id: unit.id, name: unit.name }));

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.stock.title}
        title={copy.stock.itemsTitle}
        description={copy.stock.itemsSubtitle}
        actions={
          <>
            <Link
              href="/stock"
              title={copy.stock.backToStock}
              aria-label={copy.stock.backToStock}
              className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
            >
              <ArrowLeft />
              <span className="hidden lg:inline">{copy.stock.backToStock}</span>
            </Link>
            <CreateItemButton locale={locale} units={unitOptions} />
          </>
        }
      />

      <StockItemsClient
        locale={locale}
        units={unitOptions}
        canDelete={isAdmin(access)}
        items={elements.map((element) => ({
          id: element.id,
          name: element.name,
          brand: element.brand ?? "",
          barcode: element.barcode ?? "",
          unitId: element.unitId,
          unitName: element.unit.name,
          unitQty: formatQuantity(decimalToNumber(element.unitQty)),
          expireable: element.expireable,
          inStock: inStock.get(element.id) ?? 0,
        }))}
      />
    </div>
  );
}
