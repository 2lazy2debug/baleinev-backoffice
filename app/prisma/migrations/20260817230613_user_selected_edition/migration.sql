-- AlterTable
ALTER TABLE "Edition" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "selectedEditionId" TEXT;

-- CreateIndex
CREATE INDEX "User_selectedEditionId_idx" ON "User"("selectedEditionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_selectedEditionId_fkey" FOREIGN KEY ("selectedEditionId") REFERENCES "Edition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the edition that was active becomes the default. Existing users are
-- left with a NULL selectedEditionId on purpose — they seed from the default on
-- their next request, so nobody is moved by this migration.
UPDATE "Edition" SET "isDefault" = "isActive";
