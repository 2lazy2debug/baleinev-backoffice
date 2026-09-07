-- A sale moves stock: `PosSession.stockPlaceId`.
--
-- 107 of the cash-manager chain. A session gains an optional shelf. While it is
-- set, `recordPosSaleAction` writes an ordinary `StockMovement` out of that
-- place for every sold line whose article is counted in stock — one per line,
-- oldest expiry first, clamped at zero exactly as the +/- buttons are.
--
-- One nullable column, one FK, one index. Nothing else moves:
--   * NULL is the default and every session that exists today gets it. That is
--     correct — those sessions moved no stock and this does not retro-file them.
--   * onDelete SetNull: deleting a `StockPlace` must not take a night's sales
--     with it. The sales record what was sold regardless of where it came from,
--     and a session whose shelf is gone simply stops writing movements.

-- AlterTable
ALTER TABLE "PosSession" ADD COLUMN "stockPlaceId" TEXT;

-- CreateIndex
CREATE INDEX "PosSession_stockPlaceId_idx" ON "PosSession"("stockPlaceId");

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_stockPlaceId_fkey" FOREIGN KEY ("stockPlaceId") REFERENCES "StockPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
