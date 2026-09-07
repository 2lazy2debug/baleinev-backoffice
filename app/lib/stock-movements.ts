import type { Prisma } from "@prisma/client";

/**
 * The three helpers that move stock, and nothing else.
 *
 * **Nothing changes a quantity without saying so.** Every path that touches
 * `StockItem.quantity` — the stock app's own actions and a POS sale alike — goes
 * through `applyMovement()`, which writes the row and its movement in one
 * transaction. There is no second way to move stock.
 *
 * They live in `lib/` rather than in `stock/actions.ts` because two modules call
 * them and every export of a `"use server"` file is a public endpoint: a helper
 * that exists so one module can call another has no business being reachable by
 * action id. Each takes the caller's `Prisma.TransactionClient`, so the stock
 * screens and `recordPosSaleAction` each move stock inside their own
 * transaction.
 */

/**
 * The one place a quantity changes.
 *
 * `delta` is signed here (the caller knows whether it is adding or taking out);
 * the movement stores the magnitude and the direction, because that is how the
 * history reads even after the row is gone. A zero delta writes nothing at all —
 * clicking + and then - should leave two movements, but re-saving an unchanged
 * quantity should leave none.
 */
export async function applyMovement(
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
export async function addToPlace(
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

/**
 * Takes pieces off a shelf, oldest expiry date first.
 *
 * Undated rows are last: something with a date on it is the thing to sell before
 * it turns, and a row with no date has nothing to be late for.
 *
 * Returns how many pieces were actually taken, which is less than `quantity`
 * when the shelf was short. It never refuses and never goes negative —
 * `applyMovement` already clamps, and a miscount is a count to fix, not a sale
 * to block. Rows that reach zero are left where they are: the stock screens
 * already show a zero row, and a sale is not the moment to tidy the shelf.
 *
 * The POS calls it once per sold line inside the sale transaction — see
 * `recordPosSaleAction`.
 */
export async function removeFromPlace(
  tx: Prisma.TransactionClient,
  where: { stockPlaceId: string; elementId: string },
  quantity: number,
  userId: string,
): Promise<number> {
  const rows = await tx.stockItem.findMany({
    where: { ...where, quantity: { gt: 0 } },
    orderBy: { expireDate: { sort: "asc", nulls: "last" } },
  });

  let remaining = quantity;

  for (const row of rows) {
    if (remaining <= 0) {
      break;
    }

    const take = Math.min(remaining, row.quantity);
    await applyMovement(tx, row, -take, userId);
    remaining -= take;
  }

  return quantity - remaining;
}
