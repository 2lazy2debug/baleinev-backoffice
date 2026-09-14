-- "Not me, not this shift." The other answer to a shift, private to the person
-- who picked it: a reader sees only their own row, an admin sees everyone's —
-- enforced in the `page.tsx` query, not here.
--
-- The two ADD VALUE statements go first and alone: Postgres lets a transaction
-- add an enum value but not use it in the same transaction, and
-- `prisma migrate deploy` runs this whole file in one. Nothing below mentions
-- the new values, which is what keeps that legal.

-- AlterEnum
ALTER TYPE "EventStaffAction" ADD VALUE 'UNAVAILABLE';
ALTER TYPE "EventStaffAction" ADD VALUE 'AVAILABLE';

-- CreateTable
CREATE TABLE "ShiftUnavailability" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftUnavailability_shiftId_userId_key" ON "ShiftUnavailability"("shiftId", "userId");

-- CreateIndex
CREATE INDEX "ShiftUnavailability_userId_idx" ON "ShiftUnavailability"("userId");

-- AddForeignKey
ALTER TABLE "ShiftUnavailability" ADD CONSTRAINT "ShiftUnavailability_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "EventShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftUnavailability" ADD CONSTRAINT "ShiftUnavailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
