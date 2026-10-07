-- The invoice layout becomes one setting of the invoices app instead of a row in a
-- template library. The current default template is carried over verbatim.
CREATE TABLE "InvoiceSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "templateHtml" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "InvoiceSettings" ("id", "templateHtml", "updatedAt")
SELECT 'default', "html", CURRENT_TIMESTAMP
FROM "DocumentTemplate"
WHERE "documentType" = 'INVOICE'
ORDER BY "isDefault" DESC, "createdAt" ASC
LIMIT 1;
