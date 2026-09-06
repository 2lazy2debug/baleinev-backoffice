import { describe, expect, it } from "vitest";

import { assertBarcodeFree, elementFieldsFrom } from "@/lib/articles";

/** A `StockElement` form post, with sensible defaults for the required fields. */
function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", "Barrel of lager");
  fd.set("unitId", "unit_l");
  fd.set("unitQty", "30");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

const VALID_EAN = "4006381333931";

describe("elementFieldsFrom", () => {
  it("reads the plain fields", () => {
    const data = elementFieldsFrom(form({ brand: "Feldschlösschen", barcode: VALID_EAN }));
    expect(data).toMatchObject({
      name: "Barrel of lager",
      brand: "Feldschlösschen",
      barcode: VALID_EAN,
      unitId: "unit_l",
      unitQty: 30,
    });
  });

  it("stores an empty optional field as null, not \"\"", () => {
    const data = elementFieldsFrom(form({ brand: "", barcode: "" }));
    expect(data.brand).toBeNull();
    expect(data.barcode).toBeNull();
  });

  describe("tracksStock", () => {
    it("is true only when the checkbox posts \"on\"", () => {
      expect(elementFieldsFrom(form({ tracksStock: "on" })).tracksStock).toBe(true);
    });

    it("is false when the checkbox is absent (unchecked)", () => {
      expect(elementFieldsFrom(form()).tracksStock).toBe(false);
    });

    it("is false for any value other than \"on\"", () => {
      expect(elementFieldsFrom(form({ tracksStock: "true" })).tracksStock).toBe(false);
    });
  });

  it("parses expireable the same way", () => {
    expect(elementFieldsFrom(form({ expireable: "on" })).expireable).toBe(true);
    expect(elementFieldsFrom(form()).expireable).toBe(false);
  });

  it("refuses a barcode that is not a valid EAN", () => {
    expect(() => elementFieldsFrom(form({ barcode: "12345" }))).toThrow(/valid EAN/);
  });

  it("refuses a non-positive piece size", () => {
    expect(() => elementFieldsFrom(form({ unitQty: "0" }))).toThrow(/above zero/);
    expect(() => elementFieldsFrom(form({ unitQty: "-2" }))).toThrow(/above zero/);
  });

  it("requires a name", () => {
    const fd = form();
    fd.delete("name");
    expect(() => elementFieldsFrom(fd)).toThrow(/name is required/);
  });
});

describe("assertBarcodeFree", () => {
  const client = (owner: { id: string } | null) =>
    ({ stockElement: { findUnique: async () => owner } }) as never;

  it("passes when nothing owns the barcode", async () => {
    await expect(assertBarcodeFree(client(null), VALID_EAN)).resolves.toBeUndefined();
  });

  it("passes for an empty barcode without hitting the database", async () => {
    const client = { stockElement: { findUnique: () => { throw new Error("should not query"); } } } as never;
    await expect(assertBarcodeFree(client, null)).resolves.toBeUndefined();
  });

  it("throws when another article carries it", async () => {
    await expect(assertBarcodeFree(client({ id: "other" }), VALID_EAN)).rejects.toThrow(/already carries this barcode/);
  });

  it("allows the article that already owns it (an edit)", async () => {
    await expect(assertBarcodeFree(client({ id: "self" }), VALID_EAN, "self")).resolves.toBeUndefined();
  });
});
