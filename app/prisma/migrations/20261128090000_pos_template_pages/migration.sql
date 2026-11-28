-- POS templates get named pages.
--
-- A template was one stack, paged only by the device's grid. It is now a list
-- of pages — "Beers", "Softs", "Deposits" — each its own stack, shown as a tab
-- on the till. `PosTemplateCell.position` becomes an index into its page
-- rather than into the whole template.
--
-- Every existing template gets one untitled page holding all its tiles, in the
-- order they already had, so nothing a bar sees changes until someone adds a
-- second page.

-- CreateTable
CREATE TABLE "PosTemplatePage" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT,

    CONSTRAINT "PosTemplatePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosTemplatePage_templateId_position_key" ON "PosTemplatePage"("templateId", "position");

-- AddForeignKey
ALTER TABLE "PosTemplatePage" ADD CONSTRAINT "PosTemplatePage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PosTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One first page per template. The id only has to be unique; it is never parsed.
INSERT INTO "PosTemplatePage" ("id", "templateId", "position", "title")
SELECT 'pg_' || "id", "id", 0, NULL FROM "PosTemplate";

-- Every tile onto its template's first page. Positions were already dense
-- across the template, so they stay valid as an index into that one page.
ALTER TABLE "PosTemplateCell" ADD COLUMN "pageId" TEXT;
UPDATE "PosTemplateCell" SET "pageId" = 'pg_' || "templateId";
ALTER TABLE "PosTemplateCell" ALTER COLUMN "pageId" SET NOT NULL;

-- DropIndex
DROP INDEX "public"."PosTemplateCell_templateId_position_key";

-- CreateIndex
CREATE INDEX "PosTemplateCell_templateId_idx" ON "PosTemplateCell"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "PosTemplateCell_pageId_position_key" ON "PosTemplateCell"("pageId", "position");

-- AddForeignKey
ALTER TABLE "PosTemplateCell" ADD CONSTRAINT "PosTemplateCell_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "PosTemplatePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
