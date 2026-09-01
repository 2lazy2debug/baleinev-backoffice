import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

import { PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";

import { StockSettingsClient } from "./client";
import { StockSettingsCreateButtons } from "./create-buttons";

/** Stock configuration: the places, and the units. Admins only. */
export default async function StockSettingsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const [places, units] = await Promise.all([
    prisma.stockPlace.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.stockUnit.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { elements: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={copy.stock.title}
        title={copy.stock.settingsTitle}
        description={copy.stock.settingsSubtitle}
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
            <StockSettingsCreateButtons locale={locale} />
          </>
        }
      />

      <StockSettingsClient
        locale={locale}
        places={places.map((place) => ({ id: place.id, name: place.name, itemCount: place._count.items }))}
        units={units.map((unit) => ({ id: unit.id, name: unit.name, inUse: unit._count.elements > 0 }))}
      />
    </div>
  );
}
