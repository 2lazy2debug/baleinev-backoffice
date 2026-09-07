import { describe, expect, it } from "vitest";

import { COLUMN_CHOICES, DEFAULT_COLUMNS, columnClasses, normalizeColumns } from "./till-columns";

describe("normalizeColumns", () => {
  it("keeps every offered count, read back as the string localStorage stores", () => {
    for (const count of COLUMN_CHOICES) {
      expect(normalizeColumns(String(count))).toBe(count);
      expect(normalizeColumns(count)).toBe(count);
    }
  });

  it("falls back to the default for anything unusable", () => {
    for (const value of [null, undefined, "", "three", 0, 1, 7, 3.5, NaN, {}]) {
      expect(normalizeColumns(value)).toBe(DEFAULT_COLUMNS);
    }
  });

  it("has a static Tailwind class for every offered count", () => {
    for (const count of COLUMN_CHOICES) {
      expect(columnClasses[count]).toBe(`grid-cols-${count}`);
    }
  });
});
