/**
 * How a POS template's stack of tiles falls into pages.
 *
 * A template is one **ordered list**, not a grid: nothing stored knows about
 * pages. The page break is decided at draw time, from the column count the
 * device is selling at — an iPad on the counter at 6 columns fits twenty tiles
 * on a page where a phone in the crowd at 3 fits eleven, and both are reading
 * the same template. That is why this is a function of `columns` and lives
 * here rather than as a constant in the schema.
 *
 * Import-free on purpose: the till, the template editor's preview and the
 * tests all share exactly this arithmetic, and none of them may re-derive it.
 */

/**
 * Rows on one page of the till, at every column count. Four, because that is
 * what a counter tablet held comfortably once the tiles stopped being authored
 * three to a row.
 */
export const POS_ROWS = 4;

/** How wide the till may be laid out. A device setting — see `till-columns.ts`. */
export const COLUMN_CHOICES = [2, 3, 4, 5, 6] as const;

export type TillColumns = (typeof COLUMN_CHOICES)[number];

/** What a device that has never been asked sells at. */
export const DEFAULT_COLUMNS: TillColumns = 3;

/**
 * Whatever came out of `localStorage` — a string, `null`, or something a past
 * version wrote — narrowed to a count we can draw. Anything else is the default.
 */
export function normalizeColumns(value: unknown): TillColumns {
  const parsed = typeof value === "number" ? value : Number(value);
  return (COLUMN_CHOICES as readonly number[]).includes(parsed)
    ? (parsed as TillColumns)
    : DEFAULT_COLUMNS;
}

/** Every slot the grid draws on one page, the custom-sale tile included. */
export function slotsPerPage(columns: number): number {
  return columns * POS_ROWS;
}

/**
 * Template tiles on one page. One slot short of the grid, because the **last
 * slot of every page is "Custom sale"** — drawn by the renderer, never stored,
 * always in the same corner so a bar hits it without looking.
 */
export function tilesPerPage(columns: number): number {
  return slotsPerPage(columns) - 1;
}

/** Pages a stack of `tileCount` tiles needs at this width. Always at least one. */
export function pageCount(tileCount: number, columns: number): number {
  return Math.max(1, Math.ceil(tileCount / tilesPerPage(columns)));
}

/**
 * How many slots the grid actually draws for a page holding `tileCount` tiles.
 *
 * Whole rows, never part of one, and never more than a page — so Custom sale
 * always sits in the **bottom-right corner of the grid**, which is the property
 * a bar relies on when it hits it without looking. A page that is not full is
 * drawn short rather than padded out with four rows of nothing: two tiles and a
 * Custom sale stranded at the bottom of a 24-slot void is not the same screen.
 */
export function drawnSlots(tileCount: number, columns: number): number {
  return Math.min(slotsPerPage(columns), Math.ceil((tileCount + 1) / columns) * columns);
}

/** The slice of the stack page `page` (0-based) shows. */
export function tilesOnPage<T>(tiles: T[], page: number, columns: number): T[] {
  const perPage = tilesPerPage(columns);
  return tiles.slice(page * perPage, page * perPage + perPage);
}
