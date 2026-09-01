-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "companyName" TEXT,
    "street" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CH',
    "postalCode" TEXT,
    "city" TEXT,
    "phonePrefix" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressBankAccount" (
    "id" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "street" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CH',
    "iban" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CH',
    "postalCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Address_companyName_idx" ON "Address"("companyName");

-- CreateIndex
CREATE INDEX "Address_lastName_idx" ON "Address"("lastName");

-- CreateIndex
CREATE INDEX "Address_postalCode_idx" ON "Address"("postalCode");

-- CreateIndex
CREATE INDEX "AddressBankAccount_addressId_idx" ON "AddressBankAccount"("addressId");

-- CreateIndex
CREATE INDEX "City_country_postalCode_idx" ON "City"("country", "postalCode");

-- CreateIndex
CREATE INDEX "City_country_name_idx" ON "City"("country", "name");

-- CreateIndex
CREATE UNIQUE INDEX "City_country_postalCode_name_key" ON "City"("country", "postalCode", "name");

-- AddForeignKey
ALTER TABLE "AddressBankAccount" ADD CONSTRAINT "AddressBankAccount_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE CASCADE ON UPDATE CASCADE;
