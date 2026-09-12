-- Staffing log: who put whom on a shift, and when. Admin-only, read-only,
-- `/events/logs` — same shape as `StockMovement`.
--
-- Every FK is SET NULL, not CASCADE: `StaffAssignment` itself cascades away
-- when a shift or day is deleted, but the log of it having happened must
-- outlive that. eventName / shiftLabel / actorName / subjectName are
-- denormalised snapshots for the same reason — the history of a thing that
-- is gone still has to read.

-- CreateEnum
CREATE TYPE "EventStaffAction" AS ENUM ('SIGNUP', 'WITHDRAW', 'ASSIGN', 'UNASSIGN');

-- CreateTable
CREATE TABLE "EventStaffLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "shiftId" TEXT,
    "actorId" TEXT,
    "subjectId" TEXT,
    "action" "EventStaffAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventName" TEXT NOT NULL,
    "shiftLabel" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,

    CONSTRAINT "EventStaffLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventStaffLog_eventId_createdAt_idx" ON "EventStaffLog"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EventStaffLog_createdAt_idx" ON "EventStaffLog"("createdAt");

-- AddForeignKey
ALTER TABLE "EventStaffLog" ADD CONSTRAINT "EventStaffLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaffLog" ADD CONSTRAINT "EventStaffLog_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "EventShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaffLog" ADD CONSTRAINT "EventStaffLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaffLog" ADD CONSTRAINT "EventStaffLog_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
