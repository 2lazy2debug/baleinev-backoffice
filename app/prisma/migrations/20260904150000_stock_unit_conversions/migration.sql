-- The conversion table: "one `from` is `factor` `to`".
--
-- One row is one direction, because that is what the item dialog offers — a
-- bottle the scanner filed as 1500 ml proposes 1.5 l, and the row that says so
-- is ml → l. The reverse is its own row, so an admin can keep only the
-- direction the shelves actually use.
--
-- Nothing here converts stock on its own: a factor fills in a field a person is
-- looking at, before they save. Editing this table never moves a quantity.
CREATE TABLE "StockUnitConversion" (
    "id" TEXT NOT NULL,
    "fromUnitId" TEXT NOT NULL,
    "toUnitId" TEXT NOT NULL,
    "factor" DECIMAL(18,9) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockUnitConversion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockUnitConversion_fromUnitId_toUnitId_key" ON "StockUnitConversion"("fromUnitId", "toUnitId");
CREATE INDEX "StockUnitConversion_fromUnitId_idx" ON "StockUnitConversion"("fromUnitId");

ALTER TABLE "StockUnitConversion" ADD CONSTRAINT "StockUnitConversion_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "StockUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockUnitConversion" ADD CONSTRAINT "StockUnitConversion_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "StockUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The metric pairs among the seven units the stock app ships with, both ways.
-- They are *data*, and they ship here for the same reason the units themselves
-- did: a migration is the only step the deploy pipeline runs on its own.
-- Written from the unit names so a box whose unit ids were generated at install
-- gets them too, and skipped where an admin has already filed the pair.
INSERT INTO "StockUnitConversion" ("id", "fromUnitId", "toUnitId", "factor", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, f."id", t."id", pair.factor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
    ('ml', 'l', 0.001),
    ('l', 'ml', 1000),
    ('g', 'kg', 0.001),
    ('kg', 'g', 1000)
) AS pair(from_name, to_name, factor)
JOIN "StockUnit" f ON f."name" = pair.from_name
JOIN "StockUnit" t ON t."name" = pair.to_name
ON CONFLICT ("fromUnitId", "toUnitId") DO NOTHING;
