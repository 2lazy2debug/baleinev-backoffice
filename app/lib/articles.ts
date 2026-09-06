import type { Prisma } from "@prisma/client";

import { isValidBarcode, normalizeBarcode } from "@/lib/stock";
import { getRequiredString } from "@/lib/server-action-helpers";

/**
 * The catalogue fields shared by the two forms that write a `StockElement`: the
 * articles app's own dialog, and the "new item" half of the stock app's "add
 * stock" dialog. Both post the same field names; only who is allowed to submit
 * them differs.
 */

/** An empty optional field is stored as NULL, never as "". */
function optionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

/**
 * A barcode as it is stored: digits only, or NULL. A code that is not a real
 * GTIN is refused rather than saved — an item filed under a mistyped number is
 * an item the scanner will never find again.
 */
function toBarcode(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const barcode = normalizeBarcode(raw);

  if (!isValidBarcode(barcode)) {
    throw new Error("That barcode is not a valid EAN. Check the digits, or leave it empty.");
  }

  return barcode;
}

function toUnitQty(raw: string): number {
  const unitQty = Number(raw.replace(",", ".").trim());

  if (!Number.isFinite(unitQty) || unitQty <= 0) {
    throw new Error("The size of one piece must be a number above zero.");
  }

  return unitQty;
}

export function elementFieldsFrom(formData: FormData) {
  return {
    name: getRequiredString(formData, "name"),
    brand: optionalString(formData, "brand"),
    barcode: toBarcode(optionalString(formData, "barcode")),
    unitId: getRequiredString(formData, "unitId"),
    unitQty: toUnitQty(getRequiredString(formData, "unitQty")),
    expireable: String(formData.get("expireable") ?? "") === "on",
    tracksStock: String(formData.get("tracksStock") ?? "") === "on",
  };
}

/**
 * A barcode belongs to one item. Checked before the write so the person gets a
 * sentence rather than the unique index's own words — and checked *inside* the
 * transaction that creates the item, where there is one.
 */
export async function assertBarcodeFree(
  client: Prisma.TransactionClient,
  barcode: string | null,
  elementId?: string,
) {
  if (!barcode) {
    return;
  }

  const owner = await client.stockElement.findUnique({ where: { barcode }, select: { id: true } });

  if (owner && owner.id !== elementId) {
    throw new Error("Another item already carries this barcode. Edit that item instead.");
  }
}
