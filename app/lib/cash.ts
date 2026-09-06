/**
 * The twelve Swiss denominations a till holds, in rappen, largest first. There
 * is no 1000 note here on purpose — the festival does not accept one.
 *
 * Every amount in the cash and POS apps is an integer number of rappen. Prices
 * are `Decimal(10,2)` in the database and rappen everywhere in code: adding
 * francs as floats is how a till ends the night one rappen short.
 */
export const CASH_DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5] as const;

export type DenominationCount = { denomination: number; quantity: number };

/** A `Decimal(10,2)` (or anything with toString) as whole rappen. */
export function toRappen(value: { toString(): string } | number): number {
  return Math.round(Number(value.toString()) * 100);
}

/** Rappen back to the francs a `Decimal(10,2)` column wants. */
export function fromRappen(rappen: number): number {
  return rappen / 100;
}

/** "CHF 0.05", "CHF 200.00" — one denomination, for a counter label. */
export function formatDenomination(rappen: number): string {
  return `CHF ${(rappen / 100).toFixed(2)}`;
}

/** Sums a count sheet. Empty sheet is 0, never NaN. */
export function countTotal(counts: DenominationCount[]): number {
  return counts.reduce((total, { denomination, quantity }) => total + denomination * quantity, 0);
}
