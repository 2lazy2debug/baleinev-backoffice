-- POS sessions and selling: the till at /pos.
--
-- 104 of the cash-manager chain. A `PosSession` is one stretch of selling on one
-- `PosTemplate`: a fixed set of accepted payment methods, and — only when CASH
-- is one of them — one `CashRegister` behind the drawer. Several sessions run at
-- once and several phones share one; the session is the till, not the device, so
-- membership lives on `User.selectedPosSessionId` rather than in a URL.
--
-- Every finished transaction is a `PosSale` with its `PosSaleLine`s (label and
-- unit price snapshotted, so history reads after a re-price; `elementId` null for
-- a custom sale) and, cash only, its `PosSaleChange` sheet — the coins and notes
-- the app told the seller to hand back. `total`, `cashGiven` and `changeDue` may
-- all be negative or zero: a deposit handed back is a sale like any other.
--
-- Closing a session writes NOTHING to the journal. What it took in cash is read
-- later, when the *register* is closed (106). Closing only sets `closedAt` and,
-- in the action, clears `selectedPosSessionId` for every phone that was in it.
--
-- FK choices:
--   * PosSession.editionId       -> Cascade  : a session belongs to its edition,
--                                like every financial table.
--   * PosSession.templateId      -> Restrict : a template a session has used
--                                cannot be deleted under it — `deletePosTemplateAction`
--                                checks and returns a sentence.
--   * PosSession.cashRegisterId  -> Restrict : the drawer a session is taking
--                                money into must not vanish; `closeCashRegisterAction`
--                                refuses while a session on it is still running.
--   * PosSession.openedById      -> SetNull  : deleting a user keeps the session,
--                                loses only the name of who opened it.
--   * PosSale.sessionId          -> Cascade  : a sale has no life without its session.
--   * PosSale.soldById           -> SetNull  : same as openedById.
--   * PosSaleLine.saleId / PosSaleChange.saleId -> Cascade : rows of a sale.
--   * PosSaleLine.elementId      -> SetNull  : the line snapshots its label and
--                                price, so it still reads after the article is gone.
--   * User.selectedPosSessionId  -> SetNull  : closing/deleting a session drops
--                                the seller back to the picker, never deletes them.
--
-- Uniques:
--   * PosSessionPayment (sessionId, method)  : one row per accepted method.
--   * PosSaleChange     (saleId, denomination) : one row per denomination handed back.

-- CreateEnum
CREATE TYPE "PosSessionStatus" AS ENUM ('OPEN', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PosPaymentMethod" AS ENUM ('CASH', 'TWINT', 'BANK');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "selectedPosSessionId" TEXT;

-- CreateTable
CREATE TABLE "PosSession" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "cashRegisterId" TEXT,
    "name" TEXT NOT NULL,
    "status" "PosSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedById" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSessionPayment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "method" "PosPaymentMethod" NOT NULL,

    CONSTRAINT "PosSessionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSale" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "soldById" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "PosPaymentMethod" NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "cashGiven" DECIMAL(10,2),
    "changeDue" DECIMAL(10,2),

    CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "elementId" TEXT,
    "label" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "PosSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleChange" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "denomination" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "PosSaleChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosSession_editionId_status_idx" ON "PosSession"("editionId", "status");

-- CreateIndex
CREATE INDEX "PosSession_cashRegisterId_idx" ON "PosSession"("cashRegisterId");

-- CreateIndex
CREATE UNIQUE INDEX "PosSessionPayment_sessionId_method_key" ON "PosSessionPayment"("sessionId", "method");

-- CreateIndex
CREATE INDEX "PosSale_sessionId_soldAt_idx" ON "PosSale"("sessionId", "soldAt");

-- CreateIndex
CREATE INDEX "PosSaleLine_saleId_idx" ON "PosSaleLine"("saleId");

-- CreateIndex
CREATE INDEX "PosSaleLine_elementId_idx" ON "PosSaleLine"("elementId");

-- CreateIndex
CREATE UNIQUE INDEX "PosSaleChange_saleId_denomination_key" ON "PosSaleChange"("saleId", "denomination");

-- CreateIndex
CREATE INDEX "User_selectedPosSessionId_idx" ON "User"("selectedPosSessionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_selectedPosSessionId_fkey" FOREIGN KEY ("selectedPosSessionId") REFERENCES "PosSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PosTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSessionPayment" ADD CONSTRAINT "PosSessionPayment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PosSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PosSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleLine" ADD CONSTRAINT "PosSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleLine" ADD CONSTRAINT "PosSaleLine_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "StockElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleChange" ADD CONSTRAINT "PosSaleChange_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

