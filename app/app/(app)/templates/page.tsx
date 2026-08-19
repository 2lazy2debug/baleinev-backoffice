import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { ensureDefaultInvoiceTemplate, invoiceTemplatePlaceholders } from "@/lib/document-templates";
import { getDictionary, getLocale } from "@/lib/i18n";

import { PageHeader } from "@/components/ui";

import { TemplatesPageClient } from "./client";

export default async function TemplatesPage() {
  await requireAdmin();

  const locale = await getLocale();
  const copy = getDictionary(locale);

  await ensureDefaultInvoiceTemplate();

  const templates = await prisma.documentTemplate.findMany({
    orderBy: [{ documentType: "asc" }, { isDefault: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={copy.templates.title}
        title={copy.templates.manage}
        description={
          <>
            {copy.templates.subtitle} {copy.templates.seededNote}
          </>
        }
      />

      <TemplatesPageClient templates={templates} placeholders={invoiceTemplatePlaceholders} copy={copy} />
    </div>
  );
}
