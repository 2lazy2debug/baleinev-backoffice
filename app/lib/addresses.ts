/**
 * Address-book helpers, kept import-free so the table, the pickers and the
 * server actions can all read the same rules — a client component that needs a
 * display name must not drag Prisma into the browser bundle. The one helper
 * that touches the database lives in `city-book.ts` next door.
 */

/** What a Swiss festival's address book is mostly full of, so a new row starts there. */
export const DEFAULT_COUNTRY = "CH";

/**
 * How an address names itself in a list, a picker or a page title.
 *
 * A row is a person, an organisation, or a person at an organisation — the
 * plan requires only that one of the two exists. This is the one place that
 * decides what to show, so no screen glues the three name columns together
 * itself.
 */
export function addressDisplayName(address: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
}): string {
  const person = [address.firstName, address.lastName].filter(Boolean).join(" ").trim();
  const company = address.companyName?.trim() ?? "";

  if (company && person) {
    return `${company} — ${person}`;
  }

  return company || person || "—";
}

/**
 * The recipient block a document prints: the organisation on its own line, the
 * person under it. An invoice addresses a company *and* a contact, and it needs
 * them stacked — where a list needs them on one line, `addressDisplayName` is
 * the one to use.
 */
export function addressNameBlock(address: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
}): string {
  return [address.companyName?.trim(), addressPersonName(address)].filter(Boolean).join("\n");
}

/** Just the person half, for the list column that holds first + last name. */
export function addressPersonName(address: { firstName?: string | null; lastName?: string | null }): string {
  return [address.firstName, address.lastName].filter(Boolean).join(" ").trim();
}

/** Prefix and number as one string, for a table cell or a `tel:` link. */
export function formatPhone(prefix?: string | null, number?: string | null): string {
  return [prefix, number].map((part) => part?.trim()).filter(Boolean).join(" ");
}

/**
 * The postal line of an address — "1004 Lausanne" — with nothing left dangling
 * when half of it is missing.
 */
export function formatPostalLine(postalCode?: string | null, city?: string | null): string {
  return [postalCode, city].map((part) => part?.trim()).filter(Boolean).join(" ");
}
