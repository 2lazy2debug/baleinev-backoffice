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

/** A scanned or typed code as digits only — spaces, dashes and stray keys out. */
export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Whether a code is a real GTIN: 8, 12, 13 or 14 digits whose last one is the
 * check digit the other digits add up to.
 *
 * Worth checking before a lookup, because both ways a code arrives here can be
 * wrong in the same way — a camera reads half a barcode at an angle, and a
 * typed EAN drops a digit — and either produces a plausible-looking number that
 * would file a new item under a code nothing will ever scan again.
 */
export function isValidBarcode(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) {
    return false;
  }

  const digits = [...code].map(Number);
  const check = digits.pop() as number;
  // Weights run 3,1,3,1... from the right of the payload, whatever its length.
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);

  return (10 - (sum % 10)) % 10 === check;
}
