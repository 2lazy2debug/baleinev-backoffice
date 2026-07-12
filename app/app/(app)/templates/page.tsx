import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { ensureDefaultInvoiceTemplate, invoiceTemplatePlaceholders } from "@/lib/document-templates";
import { getDictionary, getLocale } from "@/lib/i18n";

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
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.templates.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.templates.manage}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">{copy.templates.subtitle}</p>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">{copy.templates.seededNote}</p>
      </header>

      <TemplatesPageClient templates={templates} placeholders={invoiceTemplatePlaceholders} copy={copy} />
    </div>
  );
}
