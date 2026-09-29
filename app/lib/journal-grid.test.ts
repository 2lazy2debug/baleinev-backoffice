import { describe, expect, it } from "vitest";

import { buildRunningBalances, filterEntries, isDraftDirty, sortEntries, visibleRowRange, type EntryDraft } from "./journal-grid";

type GridEntry = {
  id: string;
  sequenceNumber: number;
  date: Date;
  budget: { name: string } | null;
  budgetId: string | null;
  accountType: "CHARGES" | "PRODUITS";
  amount: string;
  label: string;
  counterparty: string | null;
  moneyAccount: { name: string };
  moneyAccountId: string;
  costCenter: { code: string } | null;
  costCenterId: string | null;
};

function entry(overrides: Partial<GridEntry> = {}): GridEntry {
  return {
    id: "e1",
    sequenceNumber: 1,
    date: new Date("2030-01-01"),
    budget: { name: "Bar" },
    budgetId: "budget_1",
    accountType: "CHARGES",
    amount: "10.00",
    label: "Some label",
    counterparty: "Supplier A",
    moneyAccount: { name: "Cash" },
    moneyAccountId: "account_1",
    costCenter: { code: "C01" },
    costCenterId: "cc_1",
    ...overrides,
  };
}

function draft(overrides: Partial<EntryDraft> = {}): EntryDraft {
  return {
    date: "2030-01-01",
    budgetId: "budget_1",
    accountType: "CHARGES",
    amount: "10.00",
    label: "Some label",
    counterparty: "Supplier A",
    moneyAccountId: "account_1",
    costCenterId: "cc_1",
    ...overrides,
  };
}

describe("buildRunningBalances", () => {
  it("carries the opening balance forward", () => {
    const result = buildRunningBalances([entry({ id: "e1", sequenceNumber: 1, amount: "10.00", accountType: "PRODUITS" })], {
      account_1: 100,
    });
    expect(result.e1).toBe(110);
  });

  it("keeps two accounts separate", () => {
    const result = buildRunningBalances(
      [
        entry({ id: "e1", sequenceNumber: 1, moneyAccountId: "a", amount: "10.00", accountType: "PRODUITS" }),
        entry({ id: "e2", sequenceNumber: 2, moneyAccountId: "b", amount: "5.00", accountType: "PRODUITS" }),
      ],
      { a: 0, b: 0 },
    );
    expect(result.e1).toBe(10);
    expect(result.e2).toBe(5);
  });

  it("orders by sequenceNumber, not array order", () => {
    const result = buildRunningBalances(
      [
        entry({ id: "second", sequenceNumber: 2, amount: "5.00", accountType: "PRODUITS" }),
        entry({ id: "first", sequenceNumber: 1, amount: "10.00", accountType: "PRODUITS" }),
      ],
      { account_1: 0 },
    );
    expect(result.first).toBe(10);
    expect(result.second).toBe(15);
  });

  it("breaks a sequenceNumber tie by id", () => {
    const result = buildRunningBalances(
      [
        entry({ id: "b", sequenceNumber: 1, amount: "5.00", accountType: "PRODUITS" }),
        entry({ id: "a", sequenceNumber: 1, amount: "10.00", accountType: "PRODUITS" }),
      ],
      { account_1: 0 },
    );
    expect(result.a).toBe(10);
    expect(result.b).toBe(15);
  });
});

describe("isDraftDirty", () => {
  it("returns false for an identical draft", () => {
    expect(isDraftDirty(draft(), draft())).toBe(false);
  });

  it.each(Object.keys(draft()) as Array<keyof EntryDraft>)("returns true when %s changes", (field) => {
    const changed = draft({ [field]: `${draft()[field]}-changed` } as Partial<EntryDraft>);
    expect(isDraftDirty(draft(), changed)).toBe(true);
  });
});

describe("filterEntries", () => {
  it("returns everything when no filter is set", () => {
    const entries = [entry({ id: "a" }), entry({ id: "b" })];
    expect(filterEntries(entries, {})).toHaveLength(2);
  });

  it("matches label case-insensitively", () => {
    const entries = [entry({ label: "Rent Payment" })];
    expect(filterEntries(entries, { label: "rent" })).toHaveLength(1);
    expect(filterEntries(entries, { label: "nope" })).toHaveLength(0);
  });

  it("keeps entries with no cost centre when filtering by cost centre", () => {
    const withCostCenter = entry({ id: "a", costCenter: { code: "C01" } });
    const withoutCostCenter = entry({ id: "b", costCenter: null });
    const result = filterEntries([withCostCenter, withoutCostCenter], { costCenter: "C99" });
    expect(result.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("sortEntries", () => {
  it("keeps original order when sortBy is null", () => {
    const entries = [entry({ id: "b", sequenceNumber: 2 }), entry({ id: "a", sequenceNumber: 1 })];
    expect(sortEntries(entries, null).map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("sorts by amount ascending numerically, not lexically", () => {
    const entries = [entry({ id: "big", amount: "100.00" }), entry({ id: "small", amount: "9.00" })];
    expect(sortEntries(entries, { column: "amount", direction: "asc" }).map((e) => e.id)).toEqual(["small", "big"]);
  });

  it("sorts by amount descending", () => {
    const entries = [entry({ id: "small", amount: "9.00" }), entry({ id: "big", amount: "100.00" })];
    expect(sortEntries(entries, { column: "amount", direction: "desc" }).map((e) => e.id)).toEqual(["big", "small"]);
  });
});

describe("visibleRowRange", () => {
  it("renders the first screen plus overscan while the list starts below the viewport top", () => {
    expect(visibleRowRange(-300, 1000, 50, 700, 20)).toEqual({ start: 0, end: 34 });
  });

  it("windows around the viewport once scrolled into the middle", () => {
    // rows 200..220 are on screen
    expect(visibleRowRange(10_000, 1000, 50, 700, 20)).toEqual({ start: 180, end: 240 });
  });

  it("clamps to the list's end", () => {
    expect(visibleRowRange(34_000, 1000, 50, 700, 20)).toEqual({ start: 660, end: 700 });
  });

  it("returns an empty range when the list is scrolled far past", () => {
    expect(visibleRowRange(100_000, 1000, 50, 700, 20)).toEqual({ start: 700, end: 700 });
  });

  it("returns an empty range for an empty list", () => {
    expect(visibleRowRange(0, 1000, 50, 0, 20)).toEqual({ start: 0, end: 0 });
  });
});
