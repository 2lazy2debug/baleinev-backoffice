import Link from "next/link";
import { History, Package, Settings } from "lucide-react";

import { getCurrentUserAccess, isAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { toDateInputValue } from "@/lib/stock";
import { decimalToNumber } from "@/lib/utils";

import { EmptyPage, buttonClasses, iconButtonClasses } from "@/components/ui";

import { AddStockModal } from "./add-stock-modal";
import { StockClient } from "./client";
import { StockPlacePicker, StockPlaceSwitcher } from "./stock-place-switcher";

/**
 * The stock app. Global, not edition-scoped — a shelf does not empty when an
 * edition closes — and open to everyone signed in.
 *
 * Three screens in one route: nothing to work with yet, the one-time stock
 * picker, and the contents of the stock this user last opened.
 */
export default async function StockPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const [places, user] = await Promise.all([
    prisma.stockPlace.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.user.findUnique({ where: { id: access.id }, select: { selectedStockPlaceId: true } }),
  ]);

  if (places.length === 0) {
    return (
      <EmptyPage eyebrow={copy.stock.title} title={copy.stock.noPlaces}>
        {isAdmin(access) ? (
          <div className="space-y-4">
            <p>{copy.stock.noPlacesHintAdmin}</p>
            <Link href="/stock/settings" className={buttonClasses("primary")}>
              {copy.stock.settingsTitle}
            </Link>
          </div>
        ) : (
          copy.stock.noPlacesHint
        )}
      </EmptyPage>
    );
  }

  const options = places.map((place) => ({
    id: place.id,
    name: place.name,
    itemCount: place._count.items,
  }));

  const selected = places.find((place) => place.id === user?.selectedStockPlaceId) ?? null;

  // First visit, or the stock this user was in has been deleted: ask once, then
  // never again — the answer is remembered on the user.
  if (!selected) {
    return <StockPlacePicker locale={locale} places={options} />;
  }

  const [items, elements, units, conversions] = await Promise.all([
    prisma.stockItem.findMany({
      where: { stockPlaceId: selected.id },
      include: { element: { include: { unit: true } } },
      orderBy: [{ element: { name: "asc" } }, { expireDate: "asc" }],
    }),
    prisma.stockElement.findMany({ include: { unit: true }, orderBy: { name: "asc" } }),
    prisma.stockUnit.findMany({ orderBy: { name: "asc" } }),
    prisma.stockUnitConversion.findMany({ include: { toUnit: true }, orderBy: { toUnit: { name: "asc" } } }),
  ]);

  const actions = (
    <>
      <AddStockModal
        locale={locale}
        stockPlaceId={selected.id}
        elements={elements.map((element) => ({
          id: element.id,
          name: element.name,
          brand: element.brand ?? "",
          unitName: element.unit.name,
          unitQty: decimalToNumber(element.unitQty),
          expireable: element.expireable,
        }))}
        units={units.map((unit) => ({ id: unit.id, name: unit.name }))}
        conversions={conversions.map((conversion) => ({
          fromUnitId: conversion.fromUnitId,
          toUnitId: conversion.toUnitId,
          toUnitName: conversion.toUnit.name,
          factor: decimalToNumber(conversion.factor),
        }))}
      />
      <StockPlaceSwitcher locale={locale} places={options} selectedId={selected.id} />
      <Link
        href="/stock/items"
        title={copy.stock.itemsTitle}
        aria-label={copy.stock.itemsTitle}
        className={iconButtonClasses("neutral", "md")}
      >
        <Package />
      </Link>
      <Link
        href="/stock/history"
        title={copy.stock.historyTitle}
        aria-label={copy.stock.historyTitle}
        className={iconButtonClasses("neutral", "md")}
      >
        <History />
      </Link>
      {isAdmin(access) ? (
        <Link
          href="/stock/settings"
          title={copy.stock.settingsTitle}
          aria-label={copy.stock.settingsTitle}
          className={iconButtonClasses("neutral", "md")}
        >
          <Settings />
        </Link>
      ) : null}
    </>
  );

  return (
    <div className="space-y-4 lg:space-y-8">
      <StockClient
        locale={locale}
        places={options}
        currentPlaceId={selected.id}
        eyebrow={copy.stock.title}
        title={selected.name}
        description={copy.stock.subtitle}
        actions={actions}
        rows={items.map((item) => ({
          id: item.id,
          name: item.element.name,
          brand: item.element.brand ?? "",
          unitName: item.element.unit.name,
          unitQty: decimalToNumber(item.element.unitQty),
          expireable: item.element.expireable,
          expireDate: item.expireDate ? toDateInputValue(item.expireDate) : null,
          quantity: item.quantity,
        }))}
      />
    </div>
  );
}
