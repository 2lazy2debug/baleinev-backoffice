/**
 * What a scanned EAN says about a product, when the world knows it.
 *
 * Open Food Facts is an open catalogue keyed by exactly the code printed on the
 * box, so a scan of something nobody has filed yet can still arrive in the
 * "new item" form with its name, its brand and the size of one piece already in
 * place. Everything here is best-effort: a miss, a timeout or a product with
 * half its fields empty all mean "type the rest yourself", never an error the
 * person has to clear before carrying on.
 *
 * Server-side only — the browser would hit CORS, and the stock screens have no
 * business talking to a third party of their own.
 */

const API = "https://world.openfoodfacts.org/api/v2/product";

// The service asks callers to identify themselves, and asking for the fields we
// read keeps a scan to a few hundred bytes instead of the ~100 kB a full product
// document weighs. `quantity_value`/`quantity_unit` are the parsed pair the API
// documents; `product_quantity`/`product_quantity_unit` is what it actually
// fills in today, and `quantity` is the free text both are derived from — we
// read all three, best first.
const USER_AGENT = "Baleinev Backoffice - stock scanner - https://baleinev.ch";
const FIELDS = [
  "product_name",
  "product_name_en",
  "brands",
  "quantity",
  "quantity_value",
  "quantity_unit",
  "product_quantity",
  "product_quantity_unit",
].join(",");

/** What the "new item" form can be filled with. Any field may be empty. */
export type ProductDraft = {
  name: string;
  brand: string;
  /** The size of one piece, as the text the form's field takes ("1.5", ""). */
  unitQty: string;
  /** The unit as the catalogue names it ("l", "ml", "g"), or "" if unknown. */
  unitName: string;
};

/** How Open Food Facts spells a unit, mapped onto the catalogue's own names. */
const UNIT_ALIASES: Record<string, string> = {
  l: "l",
  liter: "l",
  litre: "l",
  liters: "l",
  litres: "l",
  ml: "ml",
  cl: "cl",
  g: "g",
  gr: "g",
  gram: "g",
  grams: "g",
  gramme: "g",
  grammes: "g",
  kg: "kg",
  m: "m",
  m2: "m2",
};

function normalizeUnit(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  return UNIT_ALIASES[value] ?? "";
}

function toNumberText(raw: unknown): string {
  const value = Number(String(raw ?? "").replace(",", ".").trim());
  return Number.isFinite(value) && value > 0 ? String(value) : "";
}

/**
 * The free-text quantity, when the parsed pair is missing: "1,5 L", "330ml",
 * "6 x 33 cl" (of which we take the 33 cl — a piece is a bottle, not the pack).
 */
function fromQuantityText(raw: unknown): { unitQty: string; unitName: string } {
  const text = String(raw ?? "").trim().toLowerCase();
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(l|ml|cl|dl|kg|g|gr)\b/g)];
  const last = matches.at(-1);

  if (!last) {
    return { unitQty: "", unitName: "" };
  }

  return { unitQty: toNumberText(last[1]), unitName: normalizeUnit(last[2]) };
}

type ProductPayload = {
  status?: number;
  product?: Record<string, unknown>;
};

/**
 * The product behind a barcode, or null when it is unknown, unreachable or
 * takes too long — a scan in a cellar with one bar of signal must not leave the
 * dialog hanging.
 */
export async function fetchProductByBarcode(barcode: string): Promise<ProductDraft | null> {
  let payload: ProductPayload;

  try {
    const response = await fetch(`${API}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    payload = (await response.json()) as ProductPayload;
  } catch {
    return null;
  }

  const product = payload?.status === 1 ? payload.product : null;

  if (!product) {
    return null;
  }

  const parsed = {
    unitQty: toNumberText(product.quantity_value ?? product.product_quantity),
    unitName: normalizeUnit(product.quantity_unit ?? product.product_quantity_unit),
  };
  const size = parsed.unitQty && parsed.unitName ? parsed : fromQuantityText(product.quantity);

  return {
    name: String(product.product_name_en || product.product_name || "").trim(),
    // Brands are one comma-separated string, most specific first.
    brand: String(product.brands ?? "").split(",")[0]?.trim() ?? "",
    unitQty: size.unitQty,
    unitName: size.unitName,
  };
}
