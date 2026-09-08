import { describe, expect, it } from "vitest";

import {
  DEFAULT_COLUMNS,
  POS_ROWS,
  drawnSlots,
  normalizeColumns,
  pageCount,
  slotsPerPage,
  tilesOnPage,
  tilesPerPage,
} from "./pos-layout";

describe("normalizeColumns", () => {
  it("takes a count the till can draw, as a number or a string", () => {
    expect(normalizeColumns(6)).toBe(6);
    expect(normalizeColumns("5")).toBe(5);
  });

  it("falls back to the default for anything else", () => {
    for (const value of [null, undefined, "", "wide", 0, 1, 7, 3.5, {}]) {
      expect(normalizeColumns(value)).toBe(DEFAULT_COLUMNS);
    }
  });
});

describe("page size", () => {
  it("is columns x rows, one slot of which is Custom sale", () => {
    expect(slotsPerPage(3)).toBe(3 * POS_ROWS);
    expect(tilesPerPage(3)).toBe(3 * POS_ROWS - 1);
    expect(tilesPerPage(6)).toBe(23);
  });

  it("fits more tiles per page as the device gets wider", () => {
    expect(tilesPerPage(2)).toBeLessThan(tilesPerPage(6));
  });
});

describe("pageCount", () => {
  it("is one page for an empty template", () => {
    expect(pageCount(0, 3)).toBe(1);
  });

  it("fills a page before starting the next", () => {
    expect(pageCount(11, 3)).toBe(1);
    expect(pageCount(12, 3)).toBe(2);
  });

  it("re-pages the same template when the device changes width", () => {
    expect(pageCount(20, 3)).toBe(2);
    expect(pageCount(20, 6)).toBe(1);
  });
});

describe("drawnSlots", () => {
  it("draws whole rows, so Custom sale is in the grid's bottom-right corner", () => {
    // Two tiles at 3 columns: one row, and the third slot is Custom sale.
    expect(drawnSlots(2, 3)).toBe(3);
    // Three tiles no longer fit a row with it, so a second row opens.
    expect(drawnSlots(3, 3)).toBe(6);
  });

  it("never draws more than a page", () => {
    expect(drawnSlots(tilesPerPage(3), 3)).toBe(slotsPerPage(3));
    expect(drawnSlots(99, 3)).toBe(slotsPerPage(3));
  });

  it("draws one row for an empty template rather than a page of nothing", () => {
    expect(drawnSlots(0, 6)).toBe(6);
  });
});

describe("tilesOnPage", () => {
  const stack = Array.from({ length: 14 }, (_, index) => index);

  it("slices the stack in order, without holes", () => {
    expect(tilesOnPage(stack, 0, 3)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(tilesOnPage(stack, 1, 3)).toEqual([11, 12, 13]);
  });

  it("gives an empty page past the end rather than throwing", () => {
    expect(tilesOnPage(stack, 9, 3)).toEqual([]);
  });
});
