"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { getCurrentUserAccess, isAdmin, requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { fetchProductByBarcode } from "@/lib/open-food-facts";
import { isValidBarcode, normalizeBarcode } from "@/lib/stock";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

/**
 * Every write the stock app makes.
 *
 * Two rules run through all of it:
 *
 * - **Nothing changes a quantity without saying so.** Every path that touches
 *   `StockItem.quantity` goes through `applyMovement()`, which writes the row
 *   and its movement in one transaction. There is no second way to move stock.
 * - **Stock is edition-independent.** No action here resolves an edition, and a
 *   closed edition does not make any of this read-only.
 *
 * Who may do what: any signed-in user counts, adds and takes out, and keeps the
 * catalogue up to date. Deleting a catalogue entry is admin-only — the same
 * split the address book uses — and so is everything about units and places,
 * which is configuration rather than work.
 */

/** Every screen that reads stock, refreshed together. */
function revalidateStock() {
  revalidatePath("/stock");
  revalidatePath("/stock/items");
  revalidatePath("/stock/history");
  revalidatePath("/stock/settings");
}

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

function toPositiveQuantity(raw: string): number {
  const quantity = Number(raw.trim());

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a whole number above zero.");
  }

  return quantity;
}

function toCountedQuantity(raw: string): number {
  const quantity = Number(raw.trim());

  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("A quantity is a whole number, zero or more.");
  }

  return quantity;
}

function toUnitQty(raw: string): number {
  const unitQty = Number(raw.replace(",", ".").trim());

  if (!Number.isFinite(unitQty) || unitQty <= 0) {
    throw new Error("The size of one piece must be a number above zero.");
  }

  return unitQty;
}

/**
 * The expiry as a date-only value, or NULL.
 *
 * An element that does not expire never carries one — the field is not drawn on
 * those, so a stale value posted with it would put a second, invisible shelf
 * next to the first.
 */
function toExpireDate(raw: string | null, expireable: boolean): Date | null {
  if (!expireable || !raw) {
    return null;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    throw new Error("That expiry date could not be read.");
  }

  return date;
}

/**
 * A barcode belongs to one item. Checked before the write so the person gets a
 * sentence rather than the unique index's own words — and checked *inside* the
 * transaction that creates the item, where there is one.
 */
async function assertBarcodeFree(
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

/**
 * The one place a quantity changes.
 *
 * `delta` is signed here (the caller knows whether it is adding or taking out);
 * the movement stores the magnitude and the direction, because that is how the
 * history reads even after the row is gone. A zero delta writes nothing at all —
 * clicking + and then - should leave two movements, but re-saving an unchanged
 * quantity should leave none.
 */
async function applyMovement(
  tx: Prisma.TransactionClient,
  item: { id: string; stockPlaceId: string; elementId: string; expireDate: Date | null; quantity: number },
  delta: number,
  userId: string,
): Promise<number> {
  if (delta === 0) {
    return item.quantity;
  }

  // Taking out more than is there is a miscount, not an error worth blocking on:
  // the shelf goes to zero and the movement records what actually left it.
  const applied = Math.max(delta, -item.quantity);

  if (applied === 0) {
    return item.quantity;
  }

  const quantity = item.quantity + applied;

  await tx.stockItem.update({ where: { id: item.id }, data: { quantity } });
  await tx.stockMovement.create({
    data: {
      stockPlaceId: item.stockPlaceId,
      elementId: item.elementId,
      stockItemId: item.id,
      expireDate: item.expireDate,
      delta: Math.abs(applied),
      isIn: applied > 0,
      createdById: userId,
    },
  });

  return quantity;
}

/**
 * Adds pieces to a place: the row for that element *and that expiry date* if it
 * already exists, a new one otherwise.
 *
 * Undated rows are looked up rather than upserted, because Postgres counts two
 * NULLs as different values — the unique index cannot merge them, so this does.
 */
async function addToPlace(
  tx: Prisma.TransactionClient,
  where: { stockPlaceId: string; elementId: string; expireDate: Date | null },
  quantity: number,
  userId: string,
) {
  const existing = await tx.stockItem.findFirst({ where });

  if (existing) {
    await applyMovement(tx, existing, quantity, userId);
    return existing.id;
  }

  const created = await tx.stockItem.create({ data: { ...where, quantity } });
  await tx.stockMovement.create({
    data: {
      stockPlaceId: where.stockPlaceId,
      elementId: where.elementId,
      stockItemId: created.id,
      expireDate: where.expireDate,
      delta: quantity,
      isIn: true,
      createdById: userId,
    },
  });

  return created.id;
}

// ---------------------------------------------------------------------------
// Stock contents — what everybody does all day
// ---------------------------------------------------------------------------

/**
 * The "new entry" dialog: an existing catalogue entry, or one created on the
 * spot and stocked in the same submission.
 */
export async function addStockAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const stockPlaceId = getRequiredString(formData, "stockPlaceId");
    const quantity = toPositiveQuantity(getRequiredString(formData, "quantity"));
    const isNewElement = String(formData.get("createElement") ?? "") === "on";

    await prisma.$transaction(async (tx) => {
      let elementId: string;

      if (isNewElement) {
        const fields = elementFieldsFrom(formData);
        await assertBarcodeFree(tx, fields.barcode);
        elementId = (await tx.stockElement.create({ data: fields })).id;
      } else {
        elementId = getRequiredString(formData, "elementId");
      }

      const element = await tx.stockElement.findUnique({
        where: { id: elementId },
        select: { id: true, expireable: true },
      });

      if (!element) {
        throw new Error("That item no longer exists. Refresh and try again.");
      }

      await addToPlace(
        tx,
        {
          stockPlaceId,
          elementId: element.id,
          expireDate: toExpireDate(optionalString(formData, "expireDate"), element.expireable),
        },
        quantity,
        access.id,
      );
    });

    revalidateStock();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** The +/- buttons around a quantity. Always active, always logged. */
export async function adjustStockItemAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const stockItemId = getRequiredString(formData, "stockItemId");
    const delta = Number(getRequiredString(formData, "delta"));

    if (!Number.isInteger(delta)) {
      throw new Error("A quantity moves by whole pieces.");
    }

    await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.findUnique({ where: { id: stockItemId } });

      if (!item) {
        throw new Error("That entry no longer exists. Refresh and try again.");
      }

      await applyMovement(tx, item, delta, access.id);
    });

    revalidateStock();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** The unlocked quantity field, locked again: the difference is the movement. */
export async function setStockItemQuantityAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const stockItemId = getRequiredString(formData, "stockItemId");
    const quantity = toCountedQuantity(getRequiredString(formData, "quantity"));

    await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.findUnique({ where: { id: stockItemId } });

      if (!item) {
        throw new Error("That entry no longer exists. Refresh and try again.");
      }

      await applyMovement(tx, item, quantity - item.quantity, access.id);
    });

    revalidateStock();
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** Takes the whole row out of the place: everything left leaves as one movement. */
export async function removeStockItemAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const stockItemId = getRequiredString(formData, "stockItemId");

    await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.findUnique({ where: { id: stockItemId } });

      if (!item) {
        throw new Error("That entry no longer exists. Refresh and try again.");
      }

      await applyMovement(tx, item, -item.quantity, access.id);
      // The movement survives: `stockItemId` is SetNull, and it carries the
      // element and the expiry date of its own.
      await tx.stockItem.delete({ where: { id: item.id } });
    });

    revalidateStock();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

/**
 * What a scanned code turns out to be. One of three answers, and the dialog that
 * asked has a different next step for each:
 *
 * - `known` — the catalogue already has it, so the entry is picked and the
 *   person is left in front of the quantity field.
 * - `unknown` — nothing is filed under this code, so the same dialog switches to
 *   its "new item" half with whatever Open Food Facts knows already typed in.
 *   `prefilled` says whether that lookup found anything, because a form that
 *   filled itself and a form that stayed empty need different words.
 * - `invalid` — the digits are not a GTIN at all. Nothing was looked up.
 */
export type BarcodeLookup =
  | { status: "known"; barcode: string; elementId: string }
  | {
      status: "unknown";
      barcode: string;
      prefilled: boolean;
      name: string;
      brand: string;
      unitQty: string;
      unitId: string;
    }
  | { status: "invalid" };

/**
 * The one thing a scan does: says whether this code is already in the catalogue,
 * and fills in what it can when it is not.
 *
 * It reads and looks up, it never writes — the item is still created by the
 * form the person then submits, through the same action as any other item.
 */
export async function lookupBarcodeAction(raw: string): Promise<BarcodeLookup> {
  await getCurrentUserAccess();

  const barcode = normalizeBarcode(raw);

  if (!isValidBarcode(barcode)) {
    return { status: "invalid" };
  }

  const existing = await prisma.stockElement.findUnique({ where: { barcode }, select: { id: true } });

  if (existing) {
    return { status: "known", barcode, elementId: existing.id };
  }

  const product = await fetchProductByBarcode(barcode);

  // The unit only counts as known when the catalogue actually has one by that
  // name: a draft pointing at a unit nobody defined would not survive the form.
  const unit = product?.unitName
    ? await prisma.stockUnit.findUnique({ where: { name: product.unitName }, select: { id: true } })
    : null;

  return {
    status: "unknown",
    barcode,
    prefilled: Boolean(product?.name || product?.brand || product?.unitQty),
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    unitQty: product?.unitQty ?? "",
    unitId: unit?.id ?? "",
  };
}

function elementFieldsFrom(formData: FormData) {
  return {
    name: getRequiredString(formData, "name"),
    brand: optionalString(formData, "brand"),
    barcode: toBarcode(optionalString(formData, "barcode")),
    unitId: getRequiredString(formData, "unitId"),
    unitQty: toUnitQty(getRequiredString(formData, "unitQty")),
    expireable: String(formData.get("expireable") ?? "") === "on",
  };
}

export async function createStockElementAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await getCurrentUserAccess();
    const data = elementFieldsFrom(formData);
    await assertBarcodeFree(prisma, data.barcode);
    await prisma.stockElement.create({ data });

    revalidateStock();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Editing an item that has already been stocked is allowed on every field but
 * one: turning off `expireable` would leave dated rows behind that nothing draws
 * a date for, so that switch is refused while any of them exist.
 */
export async function updateStockElementAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await getCurrentUserAccess();
    const elementId = getRequiredString(formData, "elementId");
    const data = elementFieldsFrom(formData);

    await assertBarcodeFree(prisma, data.barcode, elementId);

    if (!data.expireable) {
      const dated = await prisma.stockItem.count({ where: { elementId, expireDate: { not: null } } });

      if (dated > 0) {
        throw new Error("This item is in stock with an expiry date. Take those entries out before turning expiry off.");
      }
    }

    await prisma.stockElement.update({ where: { id: elementId }, data });

    revalidateStock();
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteStockElementAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();

    if (!isAdmin(access)) {
      throw new Error("Only an admin can delete an item.");
    }

    const elementId = getRequiredString(formData, "elementId");
    const stocked = await prisma.stockItem.count({ where: { elementId } });

    if (stocked > 0) {
      throw new Error("This item is in a stock. Take it out of every stock before deleting it.");
    }

    // Its movements go with it: they describe an item that no longer exists,
    // and there is nothing left for the history to name them by.
    await prisma.stockElement.delete({ where: { id: elementId } });

    revalidateStock();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Configuration — admins only
// ---------------------------------------------------------------------------

export async function createStockPlaceAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await prisma.stockPlace.create({ data: { name: getRequiredString(formData, "name") } });

    revalidateStock();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function renameStockPlaceAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await prisma.stockPlace.update({
      where: { id: getRequiredString(formData, "stockPlaceId") },
      data: { name: getRequiredString(formData, "name") },
    });

    revalidateStock();
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Deletes a place, moving whatever is in it somewhere else first.
 *
 * No entry is ever orphaned, so an empty place goes on its own and a full one
 * needs a destination. The one case with no answer is the last place still
 * holding stock — there is nowhere to move it to, and the fix is to create the
 * next place first.
 *
 * The move is two-legged in the same transaction, but only the leg that lands
 * survives: deleting a place takes its own movements with it, since there is no
 * place left for them to describe.
 */
export async function deleteStockPlaceAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await requireAdmin();
    const stockPlaceId = getRequiredString(formData, "stockPlaceId");
    const moveToId = optionalString(formData, "moveToId");

    await prisma.$transaction(async (tx) => {
      const items = await tx.stockItem.findMany({ where: { stockPlaceId } });

      if (items.length > 0) {
        if (!moveToId) {
          throw new Error("Pick the stock its contents move to.");
        }

        if (moveToId === stockPlaceId) {
          throw new Error("A stock cannot be moved into itself.");
        }

        const destination = await tx.stockPlace.findUnique({ where: { id: moveToId }, select: { id: true } });

        if (!destination) {
          throw new Error("That destination stock no longer exists. Refresh and try again.");
        }

        for (const item of items) {
          await addToPlace(
            tx,
            { stockPlaceId: destination.id, elementId: item.elementId, expireDate: item.expireDate },
            item.quantity,
            access.id,
          );
        }
      }

      await tx.stockPlace.delete({ where: { id: stockPlaceId } });
    });

    revalidateStock();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function createStockUnitAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await prisma.stockUnit.create({ data: { name: getRequiredString(formData, "name") } });

    revalidateStock();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** Renaming a unit renames it on every item measured in it — that is the point. */
export async function renameStockUnitAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await prisma.stockUnit.update({
      where: { id: getRequiredString(formData, "unitId") },
      data: { name: getRequiredString(formData, "name") },
    });

    revalidateStock();
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
