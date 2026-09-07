-- Closing a register into the journal.
--
-- 106 of the cash-manager chain. Counting a till back in still writes nothing
-- (102, 104). Booking it does: an admin opens a closed register and the app
-- writes three `JournalEntry` rows — the float that went in, what the drawer
-- should have returned, and the user-correction gap — all on the register's
-- cash `MoneyAccount`, dated its `closedAt`. A register is booked exactly once.
--
-- Three nullable columns, two foreign keys, one index. No backfill: every
-- register that exists today is unbooked, which is true.
--
--   * CashRegister.journaledAt    : when the three entries were written. Null
--                                   until then; `journalCashRegisterAction`
--                                   refuses a second press on a non-null value.
--   * CashRegister.journaledById  : who pressed the button. FK -> User,
--                                   SetNull — deleting the admin keeps the
--                                   booking, loses only the name.
--   * JournalEntry.cashRegisterId : set on the three entries a register
--                                   produces, so "where did this line come
--                                   from?" survives a re-worded label. FK ->
--                                   CashRegister, SetNull.
--
-- SetNull on both FKs on purpose: deleting an edition cascades its registers
-- *and* its journal entries, and a Restrict in the middle of that cascade is a
-- deploy that fails at two in the morning.

-- AlterTable
ALTER TABLE "CashRegister" ADD COLUMN     "journaledAt" TIMESTAMP(3),
ADD COLUMN     "journaledById" TEXT;

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "cashRegisterId" TEXT;

-- CreateIndex
CREATE INDEX "JournalEntry_cashRegisterId_idx" ON "JournalEntry"("cashRegisterId");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_journaledById_fkey" FOREIGN KEY ("journaledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
