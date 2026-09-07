-- An event carries a page of information: `Event.info`.
--
-- 109. One nullable Markdown column, read by everyone through the header's
-- info button and written by admins only. NULL means "no information yet",
-- which is what every existing event gets and what the modal renders as its
-- empty state — nothing to backfill.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "info" TEXT;
