import { describe, expect, it } from "vitest";

import { itemTotalsFor, totalsFor, type SaleForTotals, type SaleLineForItemTotals } from "./pos";

const sale = (over: Partial<SaleForTotals>): SaleForTotals => ({
  method: "CASH",
  total: "0.00",
  changeDue: null,
  ...over,
});

const line = (over: Partial<SaleLineForItemTotals>): SaleLineForItemTotals => ({
  elementId: "el_1",
  label: "Beer 3dl",
  unitPrice: "4.50",
  quantity: 1,
  ...over,
});

describe("totalsFor", () => {
  it("keeps every accepted method, at 0 when unused", () => {
    const totals = totalsFor([sale({ method: "CASH", total: "12.00" })], ["CASH", "TWINT", "BANK"]);

    expect(totals.byMethod).toEqual({ CASH: 1200, TWINT: 0, BANK: 0 });
    expect(totals.total).toBe(1200);
    expect(totals.saleCount).toBe(1);
  });

  it("sums in rappen and lets the total go negative", () => {
    const totals = totalsFor(
      [
        sale({ method: "CASH", total: "0.10" }),
        sale({ method: "CASH", total: "0.20" }),
        sale({ method: "TWINT", total: "-5.00" }),
      ],
      ["CASH", "TWINT"],
    );

    expect(totals.byMethod.CASH).toBe(30);
    expect(totals.byMethod.TWINT).toBe(-500);
    expect(totals.total).toBe(-470);
  });

  it("adds up the per-method columns to the grand total", () => {
    const totals = totalsFor(
      [
        sale({ method: "CASH", total: "4.00" }),
        sale({ method: "TWINT", total: "6.50" }),
        sale({ method: "BANK", total: "10.00" }),
      ],
      ["CASH", "TWINT", "BANK"],
    );

    const columnSum = Object.values(totals.byMethod).reduce((a, b) => a + b, 0);
    expect(columnSum).toBe(totals.total);
  });

  it("sums changeDue across cash sales only", () => {
    const totals = totalsFor(
      [
        sale({ method: "CASH", total: "4.00", changeDue: "1.00" }),
        sale({ method: "CASH", total: "3.00", changeDue: "2.00" }),
        sale({ method: "TWINT", total: "6.50", changeDue: null }),
      ],
      ["CASH", "TWINT"],
    );

    expect(totals.changeGiven).toBe(300);
  });

  it("returns zeroes for a session with no sales — never NaN", () => {
    const totals = totalsFor([], ["CASH", "TWINT", "BANK"]);

    expect(totals).toEqual({
      byMethod: { CASH: 0, TWINT: 0, BANK: 0 },
      total: 0,
      saleCount: 0,
      changeGiven: 0,
    });
  });
})

describe("itemTotalsFor", () => {
  it("merges the same article across sales", () => {
    const items = itemTotalsFor([
      { lines: [line({ quantity: 2 })] },
      { lines: [line({ quantity: 3 })] },
    ]);

    expect(items).toEqual([{ key: "el_1", label: "Beer 3dl", quantity: 5, total: 2250 }]);
  });

  it("keeps different articles apart", () => {
    const items = itemTotalsFor([
      { lines: [line({ elementId: "el_1", label: "Beer 3dl", quantity: 1 }), line({ elementId: "el_2", label: "Wine", unitPrice: "6.00", quantity: 1 })] },
    ]);

    expect(items).toEqual([
      { key: "el_1", label: "Beer 3dl", quantity: 1, total: 450 },
      { key: "el_2", label: "Wine", quantity: 1, total: 600 },
    ]);
  });

  it("groups custom lines by their typed label, not an id", () => {
    const items = itemTotalsFor([
      { lines: [line({ elementId: null, label: "Tip", unitPrice: "1.00", quantity: 1 })] },
      { lines: [line({ elementId: null, label: "Tip", unitPrice: "1.00", quantity: 2 })] },
    ]);

    expect(items).toEqual([{ key: "custom:Tip", label: "Tip", quantity: 3, total: 300 }]);
  });

  it("sorts by quantity, most sold first", () => {
    const items = itemTotalsFor([
      {
        lines: [
          line({ elementId: "el_1", label: "Beer 3dl", quantity: 1 }),
          line({ elementId: "el_2", label: "Wine", unitPrice: "6.00", quantity: 5 }),
        ],
      },
    ]);

    expect(items.map((item) => item.key)).toEqual(["el_2", "el_1"]);
  });

  it("returns an empty list for a session with no sales", () => {
    expect(itemTotalsFor([])).toEqual([]);
  });
});
