-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "addressTypeId" TEXT;

-- CreateTable
CREATE TABLE "AddressType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AddressType_name_key" ON "AddressType"("name");

-- CreateIndex
CREATE INDEX "Address_addressTypeId_idx" ON "Address"("addressTypeId");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_addressTypeId_fkey" FOREIGN KEY ("addressTypeId") REFERENCES "AddressType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The five the app starts with. Data, not schema — and it ships in the migration
-- for the same reason the stock units did: a migration is the only step the
-- deploy pipeline runs on its own, so a value left to `npm run db:seed` would
-- never reach a running box. Admins add the rest from the address book's
-- settings. ON CONFLICT keeps a re-run, and a name an admin added first, safe.
INSERT INTO "AddressType" ("id", "name", "createdAt", "updatedAt") VALUES
(gen_random_uuid()::text, 'Sponsor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'Supplier', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'Partner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'Artist', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'Staff', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
