-- Cash registers: a counted till on a CASH money account.
--
-- 102 of the cash-manager chain. A register is opened against a `MoneyAccount`
-- whose type is CASH, by counting a float into it denomination by denomination,
-- and closed later by counting what is left. Counting is not booking: this
-- migration adds no journal columns and no amounts of its own — a `CashRegister`
-- carries only its two `CashCount` sheets, and the journal entries a closed till
-- produces are 106's job.
--
-- FK choices:
--   * editionId  -> Cascade : a register belongs to its edition; deleting the
--                             edition (already Cascade for every financial table)
--                             takes its tills with it.
--   * moneyAccountId -> Restrict : the same rule JournalEntry.moneyAccountId
--                             already uses. A cash account that has held a till
--                             must not be deleted out from under it.
--   * openedById / closedById -> SetNull : deleting a user must never delete the
--                             registers they opened; the count still stands, the
--                             name of who did it is what is lost.
--   * CashCount.registerId -> Cascade : a count sheet has no life without its
--                             register.
--
-- There is deliberately no unique index on `CashRegister.name`: two bars both
-- called "Bar 1", in two editions or on two nights, are two registers and the
-- app must not argue about it. The `(registerId, kind, denomination)` unique on
-- CashCount is the real guard — one row per denomination per end of life.

-- CreateEnum
CREATE TYPE "CashCountKind" AS ENUM ('OPENING', 'CLOSING');

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "moneyAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "openedById" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "id" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "kind" "CashCountKind" NOT NULL,
    "denomination" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashRegister_editionId_moneyAccountId_idx" ON "CashRegister"("editionId", "moneyAccountId");

-- CreateIndex
CREATE INDEX "CashRegister_editionId_closedAt_idx" ON "CashRegister"("editionId", "closedAt");

-- CreateIndex
CREATE INDEX "CashCount_registerId_idx" ON "CashCount"("registerId");

-- CreateIndex
CREATE UNIQUE INDEX "CashCount_registerId_kind_denomination_key" ON "CashCount"("registerId", "kind", "denomination");

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
