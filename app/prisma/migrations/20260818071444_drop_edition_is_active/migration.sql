-- Drops the global "active edition" flag that `isDefault` replaced (plan 002,
-- steps 1 and 5). Deliberately its own release: the additive half shipped
-- first, so no deploy ever runs code against a schema missing a column it
-- still reads.

-- AlterTable
ALTER TABLE "Edition" DROP COLUMN "isActive";
