import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireAdmin } from "@/lib/access";
import { getDictionary, getLocale } from "@/lib/i18n";
import { getInvoiceTemplateHtml, invoiceTemplatePlaceholders } from "@/lib/invoice-template";

import { PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";

import { InvoiceSettingsClient } from "./client";

/** The invoices app's configuration: the one HTML layout every invoice PDF uses. Admins only. */
export default async function InvoiceSettingsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const templateHtml = await getInvoiceTemplateHtml();

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.invoices.title}
        title={copy.invoices.settingsTitle}
        description={copy.invoices.settingsSubtitle}
        actions={
          <Link
            href="/invoices"
            title={copy.invoices.backToInvoices}
            aria-label={copy.invoices.backToInvoices}
            className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
          >
            <ArrowLeft />
            <span className="hidden lg:inline">{copy.invoices.backToInvoices}</span>
          </Link>
        }
      />

      <InvoiceSettingsClient locale={locale} templateHtml={templateHtml} placeholders={invoiceTemplatePlaceholders} />
    </div>
  );
}
