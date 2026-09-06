import { describe, expect, it } from "vitest";

import { countTotal, makeChange } from "./cash";

describe("makeChange", () => {
  it("returns nothing for zero or negative input", () => {
    expect(makeChange(0)).toEqual([]);
    expect(makeChange(-500)).toEqual([]);
    expect(makeChange(Number.NaN)).toEqual([]);
  });

  it("makes CHF 6.55 as 1×5.00, 1×1.00, 1×0.50, 1×0.05", () => {
    expect(makeChange(655)).toEqual([
      { denomination: 500, quantity: 1 },
      { denomination: 100, quantity: 1 },
      { denomination: 50, quantity: 1 },
      { denomination: 5, quantity: 1 },
    ]);
  });

  it("uses the fewest pieces, largest first", () => {
    expect(makeChange(20000)).toEqual([{ denomination: 20000, quantity: 1 }]);
    expect(makeChange(40000)).toEqual([{ denomination: 20000, quantity: 2 }]);
  });

  it("sums back to the input for any multiple of the smallest coin (5 rp)", () => {
    for (const amount of [5, 95, 655, 12345, 9995, 700]) {
      expect(countTotal(makeChange(amount))).toBe(amount);
    }
  });

  it("cannot represent below 5 rappen — the smallest Swiss coin — and drops the remainder", () => {
    expect(countTotal(makeChange(9999))).toBe(9995);
  });

  it("floors a fractional rappen rather than inventing a coin", () => {
    expect(countTotal(makeChange(12.9))).toBe(10);
  });
});
