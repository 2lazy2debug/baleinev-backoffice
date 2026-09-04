-- The EAN/GTIN-13 on a catalogue entry, so a scan can find it.
--
-- Nullable: most of what a festival stocks (cables, tables, crates) has no
-- barcode at all, and an item stays perfectly usable without one. Unique because
-- the scanner asks exactly one question — "is this already filed?" — and two
-- entries sharing a code would have two answers.
ALTER TABLE "StockElement" ADD COLUMN "barcode" TEXT;

CREATE UNIQUE INDEX "StockElement_barcode_key" ON "StockElement"("barcode");
