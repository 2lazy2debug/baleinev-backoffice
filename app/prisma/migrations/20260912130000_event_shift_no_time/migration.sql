-- Timeless shifts ("renfort", "surplus") have no hours. Storing "00:00" would
-- be a lie the rest of the app would have to keep checking, so startTime and
-- endTime become nullable and a noTime flag marks the shift explicitly.
-- Existing rows keep their times and get noTime = false, so nothing changes
-- for data already in the table.
ALTER TABLE "EventShift" ADD COLUMN "noTime" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventShift" ALTER COLUMN "startTime" DROP NOT NULL;
ALTER TABLE "EventShift" ALTER COLUMN "endTime" DROP NOT NULL;
