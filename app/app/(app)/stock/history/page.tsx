import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { formatExpiry, formatPiece, toDateInputValue } from "@/lib/stock";
import { decimalToNumber } from "@/lib/utils";

import { PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";

import { StockHistoryClient } from "./client";

/** How far back the screen reads. Beyond this the log is a report, not a screen. */
const MOVEMENT_LIMIT = 300;

export default async function StockHistoryPage() {
  await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const [movements, places] = await Promise.all([
    prisma.stockMovement.findMany({
      take: MOVEMENT_LIMIT,
      orderBy: { createdAt: "desc" },
      include: {
        element: { include: { unit: true } },
        stockPlace: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.stockPlace.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Timestamps are formatted here rather than in the client: a movement carries
  // a time of day, and a browser in another timezone would render a different
  // string over the server's markup.
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CH" : "en-CH", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={copy.stock.title}
        title={copy.stock.historyTitle}
        description={copy.stock.historySubtitle}
        actions={
          <Link
            href="/stock"
            title={copy.stock.backToStock}
            aria-label={copy.stock.backToStock}
            className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
          >
            <ArrowLeft />
            <span className="hidden lg:inline">{copy.stock.backToStock}</span>
          </Link>
        }
      />

      <StockHistoryClient
        locale={locale}
        places={places}
        movements={movements.map((movement) => ({
          id: movement.id,
          when: when.format(movement.createdAt),
          placeId: movement.stockPlace.id,
          placeName: movement.stockPlace.name,
          itemName: movement.element.name,
          brand: movement.element.brand ?? "",
          piece: formatPiece(decimalToNumber(movement.element.unitQty), movement.element.unit.name),
          expiry: movement.expireDate ? formatExpiry(toDateInputValue(movement.expireDate), locale) : "",
          isIn: movement.isIn,
          delta: movement.delta,
          by: movement.createdBy?.name ?? "",
        }))}
      />
    </div>
  );
}
