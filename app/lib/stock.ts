/**
 * How a stock quantity is written, everywhere.
 *
 * An element carries the size of *one piece* (a 1.5 l bottle is unit = l,
 * unitQty = 1.5) and a stock row counts pieces, so a row has two numbers that
 * must never be confused: six pieces, and the nine litres they add up to.
 *
 * Import-free on purpose — the table, the cardlets, the modals and the history
 * screen all read the same rules without dragging Prisma into a browser bundle.
 */

/** Trims the trailing zeros a Decimal(12,3) drags along: "1.500" -> "1.5". */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return String(Number(value.toFixed(3)));
}

/** What one piece is: "1.5 l". */
export function formatPiece(unitQty: number, unitName: string): string {
  return `${formatQuantity(unitQty)} ${unitName}`;
}

/** What the shelf holds: "9 l". */
export function formatTotal(quantity: number, unitQty: number, unitName: string): string {
  return `${formatQuantity(quantity * unitQty)} ${unitName}`;
}

/** A @db.Date column as the `yyyy-mm-dd` an <input type="date"> reads and writes. */
export function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** The expiry as a person reads it, in the locale the app is running in. */
export function formatExpiry(date: string | null, locale: string): string {
  if (!date) {
    return "";
  }

  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
