import type { PosPaymentMethod } from "@prisma/client";

import { toRappen } from "@/lib/cash";

/**
 * The read side of the POS. Both history screens — the session list and one
 * session's detail — need the same per-method roll-up, and neither may compute
 * it twice or in a way the other can drift from.
 *
 * Everything here is **integer rappen**: each `Decimal` is run through
 * `toRappen()` before it is added, never summed as francs. `0.1 + 0.2` is how a
 * night's takings end up a rappen off.
 */

/** The slice of a `PosSale` this roll-up reads: the method and the two amounts. */
export type SaleForTotals = {
  method: PosPaymentMethod;
  total: { toString(): string } | number;
  /**
   * Cash sales only; null on every other method. Optional so the session list,
   * which never shows `changeGiven`, can skip selecting it — `changeGiven` is
   * then `0`.
   */
  changeDue?: { toString(): string } | number | null;
};

export type PosTotals = {
  /** Rappen, per method. Every method the session accepts is present, at 0 if unused. */
  byMethod: Record<PosPaymentMethod, number>;
  /** Rappen. The sum, which may be negative. */
  total: number;
  saleCount: number;
  /** Rappen. The sum of `changeDue` across cash sales — what left the drawer as change. */
  changeGiven: number;
};

/**
 * Rolls a session's sales up by payment method.
 *
 * `methods` is the set the session accepts: every one is a key of `byMethod`,
 * at `0` when nothing was sold that way — "Twint took nothing tonight" is an
 * answer, and a missing row is not. A sale whose method is somehow not in that
 * set still lands in `total` and gets its own key, so the columns always add up
 * to the total.
 */
export function totalsFor(sales: SaleForTotals[], methods: PosPaymentMethod[]): PosTotals {
  const byMethod = Object.fromEntries(methods.map((method) => [method, 0])) as Record<PosPaymentMethod, number>;

  let total = 0;
  let changeGiven = 0;

  for (const sale of sales) {
    const amount = toRappen(sale.total);
    total += amount;
    byMethod[sale.method] = (byMethod[sale.method] ?? 0) + amount;

    if (sale.changeDue != null) {
      changeGiven += toRappen(sale.changeDue);
    }
  }

  return { byMethod, total, saleCount: sales.length, changeGiven };
}
