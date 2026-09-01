-- AlterTable
ALTER TABLE "User" ADD COLUMN     "selectedStockPlaceId" TEXT;

-- CreateTable
CREATE TABLE "StockPlace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockElement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "unitId" TEXT NOT NULL,
    "unitQty" DECIMAL(12,3) NOT NULL,
    "expireable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "stockPlaceId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "expireDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "stockPlaceId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "stockItemId" TEXT,
    "expireDate" DATE,
    "delta" INTEGER NOT NULL,
    "isIn" BOOLEAN NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockPlace_name_key" ON "StockPlace"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StockUnit_name_key" ON "StockUnit"("name");

-- CreateIndex
CREATE INDEX "StockElement_name_idx" ON "StockElement"("name");

-- CreateIndex
CREATE INDEX "StockElement_unitId_idx" ON "StockElement"("unitId");

-- CreateIndex
CREATE INDEX "StockItem_stockPlaceId_idx" ON "StockItem"("stockPlaceId");

-- CreateIndex
CREATE INDEX "StockItem_elementId_idx" ON "StockItem"("elementId");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_stockPlaceId_elementId_expireDate_key" ON "StockItem"("stockPlaceId", "elementId", "expireDate");

-- CreateIndex
CREATE INDEX "StockMovement_stockPlaceId_createdAt_idx" ON "StockMovement"("stockPlaceId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_elementId_idx" ON "StockMovement"("elementId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "User_selectedStockPlaceId_idx" ON "User"("selectedStockPlaceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_selectedStockPlaceId_fkey" FOREIGN KEY ("selectedStockPlaceId") REFERENCES "StockPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockElement" ADD CONSTRAINT "StockElement_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "StockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_stockPlaceId_fkey" FOREIGN KEY ("stockPlaceId") REFERENCES "StockPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "StockElement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockPlaceId_fkey" FOREIGN KEY ("stockPlaceId") REFERENCES "StockPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "StockElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The seven units the app starts with. They are *data*, not schema, and they
-- ship here because a migration is the only step the deploy pipeline runs on its
-- own — `npm run db:seed` is a first-install command, so a unit left to it would
-- never reach a running box. Admins add the rest from Stock settings.
-- ON CONFLICT keeps a re-run, and a unit an admin happened to add first, safe.
INSERT INTO "StockUnit" ("id", "name", "createdAt", "updatedAt") VALUES
(gen_random_uuid()::text, 'pce', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'l', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'ml', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'kg', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'g', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'm', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'm2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
