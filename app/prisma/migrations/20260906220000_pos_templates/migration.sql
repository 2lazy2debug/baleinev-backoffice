-- POS templates: a saved till layout a bar opens on for the night.
--
-- 103 of the cash-manager chain. A `PosTemplate` is a paginated 3x3 grid of
-- tiles; each `PosTemplateCell` points at a `StockElement` and carries its own
-- label and price. The price lives on the cell, never on the article — the same
-- beer is CHF 4 at one bar and CHF 5 at another on the same night — and a
-- negative price is legal, a deposit handed back that takes money out of the
-- till.
--
-- `position` is a 0-based slot index across the whole template. Eight slots
-- make a page (`POS_PAGE_SLOTS` in app/lib/cash.ts); the ninth tile of every
-- page is the "custom sale" button, which the renderer draws and this schema
-- never stores. A page may have holes: removing a tile frees its slot and
-- leaves the others where they are.
--
-- FK choices:
--   * PosTemplate.editionId    -> Cascade  : a template belongs to its edition,
--                              like every other financial table; deleting the
--                              edition takes its templates with it.
--   * PosTemplateCell.templateId -> Cascade : a tile has no life without its
--                              template.
--   * PosTemplateCell.elementId  -> Restrict : an article a template sells
--                              cannot be deleted out from under it. The articles
--                              app checks for this and gives a sentence instead
--                              of letting the constraint throw.
--
-- Uniques:
--   * (editionId, name)        : one template name per edition.
--   * (templateId, position)   : one tile per slot — this is what makes
--                              `setPosTemplateCellAction` a clean upsert.

-- CreateTable
CREATE TABLE "PosTemplate" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosTemplateCell" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "elementId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PosTemplateCell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosTemplate_editionId_idx" ON "PosTemplate"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "PosTemplate_editionId_name_key" ON "PosTemplate"("editionId", "name");

-- CreateIndex
CREATE INDEX "PosTemplateCell_elementId_idx" ON "PosTemplateCell"("elementId");

-- CreateIndex
CREATE UNIQUE INDEX "PosTemplateCell_templateId_position_key" ON "PosTemplateCell"("templateId", "position");

-- AddForeignKey
ALTER TABLE "PosTemplate" ADD CONSTRAINT "PosTemplate_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTemplateCell" ADD CONSTRAINT "PosTemplateCell_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PosTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTemplateCell" ADD CONSTRAINT "PosTemplateCell_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "StockElement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
