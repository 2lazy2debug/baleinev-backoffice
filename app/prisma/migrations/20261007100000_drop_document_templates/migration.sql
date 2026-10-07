-- The template library is gone: the invoice layout lives in "InvoiceSettings"
-- (previous migration), so invoices no longer point at a template.
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_templateId_fkey";

ALTER TABLE "Invoice" DROP COLUMN "templateId";

DROP TABLE "DocumentTemplate";

DROP TYPE "DocumentOutputFormat";

DROP TYPE "DocumentType";
