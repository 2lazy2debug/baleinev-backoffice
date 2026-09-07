import { describe, expect, it, vi } from "vitest";

import { registerFigures } from "./cash-register";

type Counts = Array<{ kind: "OPENING" | "CLOSING"; denomination: number; quantity: number }>;

/** A stand-in Prisma client: two count sheets, one cash-sale sum, one session count. */
function db(counts: Counts, cashSumFrancs: string | null, sessionCount = 1) {
  return {
    cashCount: { findMany: vi.fn().mockResolvedValue(counts) },
    posSale: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { total: cashSumFrancs } }),
    },
    posSession: { count: vi.fn().mockResolvedValue(sessionCount) },
  } as never;
}

describe("registerFigures", () => {
  it("adds the sheets and the cash sales, all in rappen", async () => {
    // float 100.00, cash sales 250.00, counted back 340.00
    const figures = await registerFigures(
      db(
        [
          { kind: "OPENING", denomination: 10000, quantity: 1 },
          { kind: "CLOSING", denomination: 10000, quantity: 3 },
          { kind: "CLOSING", denomination: 2000, quantity: 2 },
        ],
        "250.00",
      ),
      "reg_1",
    );

    expect(figures).toEqual({
      float: 10000,
      cashTaken: 25000,
      expected: 35000,
      actual: 34000,
      gap: 1000,
      sessionCount: 1,
    });
  });

  it("treats a null cash sum as zero, not NaN", async () => {
    const figures = await registerFigures(
      db([{ kind: "OPENING", denomination: 5000, quantity: 1 }], null),
      "reg_1",
    );

    expect(figures.cashTaken).toBe(0);
    expect(figures.expected).toBe(5000);
    expect(figures.gap).toBe(5000); // nothing counted back yet
  });

  it("lets a refund-only till drive expected negative", async () => {
    // float 100.00, cash sales −150.00, counted back 0
    const figures = await registerFigures(
      db([{ kind: "OPENING", denomination: 10000, quantity: 1 }], "-150.00"),
      "reg_1",
    );

    expect(figures.expected).toBe(-5000);
    expect(figures.gap).toBe(-5000);
  });
});
