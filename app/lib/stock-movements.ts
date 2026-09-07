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
 *
 * **Counting clamps at zero; selling does not.** Somebody counting a shelf is
 * looking at it, and a shelf cannot hold less than nothing — a "-" past the last
 * piece is a slip, and it is absorbed. The till passes `allowNegative`, because
 * what it reports is not a count: the beer left the building whether or not the
 * delivery was ever filed, and a row reading -3 is the only record that says so.
 */
export async function applyMovement(
  tx: Prisma.TransactionClient,
  item: { id: string; stockPlaceId: string; elementId: string; expireDate: Date | null; quantity: number },
  delta: number,
  userId: string,
  options: { allowNegative?: boolean } = {},
): Promise<number> {
  if (delta === 0) {
    return item.quantity;
  }

  // Clamped: never past zero, and never *back* towards it either — a row already
  // below zero absorbs a further Out whole rather than counting up.
  const applied = options.allowNegative ? delta : Math.max(delta, Math.min(0, -item.quantity));

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
 * The pieces a sale took that the shelf did not have.
 *
 * They land on the **undated** row for that element — created below zero when
 * there is none — as an ordinary Out, so `/stock/history` reads it like any
 * other removal and the count itself says how short it is.
 *
 * Undated rather than on the dated row it just emptied, for two reasons: pieces
 * that do not exist cannot turn, so a date on them would be a lie; and a
 * delivery filed later with a date of its own lands on its own row, leaving the
 * debt standing where somebody can see it instead of quietly swallowing it.
 */
async function recordShortfall(
  tx: Prisma.TransactionClient,
  where: { stockPlaceId: string; elementId: string },
  quantity: number,
  userId: string,
) {
  const undated = await tx.stockItem.findFirst({ where: { ...where, expireDate: null } });

  if (undated) {
    await applyMovement(tx, undated, -quantity, userId, { allowNegative: true });
    return;
  }

  const created = await tx.stockItem.create({ data: { ...where, expireDate: null, quantity: -quantity } });
  await tx.stockMovement.create({
    data: {
      stockPlaceId: where.stockPlaceId,
      elementId: where.elementId,
      stockItemId: created.id,
      expireDate: null,
      delta: quantity,
      isIn: false,
      createdById: userId,
    },
  });
}

/**
 * Takes pieces off a shelf, oldest expiry date first.
 *
 * Undated rows are last: something with a date on it is the thing to sell before
 * it turns, and a row with no date has nothing to be late for.
 *
 * **It never refuses, and what the shelf could not cover goes negative.** A till
 * that stopped selling because a delivery was never filed is worse than a count
 * that is wrong, and the pieces left the building either way — so the shortfall
 * is written down rather than swallowed (see `recordShortfall`). A shelf reading
 * -3 is not a number to trust: it is the app saying somebody miscounted or a
 * delivery is missing, and it stays there until a person fixes it.
 *
 * Returns how many pieces the shelf actually held, so `quantity - result` is the
 * shortfall. Rows that reach zero are left where they are: the stock screens
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

  if (remaining > 0) {
    await recordShortfall(tx, where, remaining, userId);
  }

  return quantity - remaining;
}
