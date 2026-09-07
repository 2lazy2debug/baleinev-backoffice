import { describe, expect, it } from "vitest";

import { totalsFor, type SaleForTotals } from "./pos";

const sale = (over: Partial<SaleForTotals>): SaleForTotals => ({
  method: "CASH",
  total: "0.00",
  changeDue: null,
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
