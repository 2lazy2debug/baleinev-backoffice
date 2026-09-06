-- Add `StockElement.tracksStock`.
--
-- 101 splits the catalogue out of the stock app so a till can sell things that
-- are never counted on a shelf. Everything that exists today *is* stocked, so
-- the default is true and no backfill is needed.

ALTER TABLE "StockElement" ADD COLUMN "tracksStock" BOOLEAN NOT NULL DEFAULT true;
