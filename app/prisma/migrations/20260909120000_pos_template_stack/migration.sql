-- POS templates become a stack, not a grid.
--
-- A template used to be a paginated 3x3: `position` was a slot index on an
-- 8-slot page, holes and all, and the editor authored the pages. It is now one
-- **ordered list** of tiles — `position` is a dense 0-based index into that
-- list — and where the page breaks fall is decided when the till draws it,
-- from the column count that device sells at. That is what lets an iPad at 6
-- columns fit twenty tiles on a page while a phone at 3 fits eleven, from the
-- same template.
--
-- Two things change here:
--
--   * `kind` — `SPACER` is a tile with nothing behind it, blank space the
--     author drops into the stack to push what follows onto the next row or
--     page. `elementId` becomes nullable because a spacer points at no article.
--
--   * the existing positions are **compacted**. They were spread across 8-slot
--     pages and could have holes; as an order index a hole is a phantom tile.
--     Row order is preserved, so every template keeps the sequence it was
--     authored in.
--
-- The compaction runs in two passes with the whole table parked above
-- 1000000 first. `(templateId, position)` is a plain (non-deferrable) unique
-- index, so PostgreSQL checks it row by row inside a single UPDATE: shifting
-- positions down in place would collide with the rows not yet moved. Parking
-- them out of the way first means every final value lands in free space. The
-- same trick is what `renumber()` in app/(app)/pos/actions.ts does on a
-- reorder.

-- CreateEnum
CREATE TYPE "PosCellKind" AS ENUM ('ARTICLE', 'SPACER');

-- AlterTable
ALTER TABLE "PosTemplateCell" ADD COLUMN "kind" "PosCellKind" NOT NULL DEFAULT 'ARTICLE';

-- AlterTable: a spacer points at no article
ALTER TABLE "PosTemplateCell" ALTER COLUMN "elementId" DROP NOT NULL;

-- Compact the page-slot positions into a dense order index.
UPDATE "PosTemplateCell" SET "position" = "position" + 1000000;

UPDATE "PosTemplateCell" AS cell
SET "position" = ordered."rank"
FROM (
    SELECT "id", (row_number() OVER (PARTITION BY "templateId" ORDER BY "position") - 1) AS "rank"
    FROM "PosTemplateCell"
) AS ordered
WHERE cell."id" = ordered."id";
