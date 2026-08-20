import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { ensureDefaultInvoiceTemplate } from "@/lib/document-templates";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import InvoicesClient from "./client";
import { EmptyPage } from "@/components/ui";

export default async function InvoicesPage() {
  await requireAdmin();

  const locale = await getLocale();
  const copy = getDictionary(locale);
  const defaultTemplate = await ensureDefaultInvoiceTemplate();

  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
    include: {
      moneyAccounts: {
        orderBy: { name: "asc" },
      },
    },
  }) : null;

  if (!activeEdition) {
    return (
      <EmptyPage eyebrow={copy.invoices.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  const accounts = activeEdition.moneyAccounts
    .filter((account) => account.type === "BANK")
    .map((account) => ({
      id: account.id,
      name: account.name,
      iban: account.iban,
      beneficiaryName: account.beneficiaryName,
      beneficiaryAddress: account.beneficiaryAddress,
      beneficiaryPostalCode: account.beneficiaryPostalCode,
      beneficiaryCity: account.beneficiaryCity,
      beneficiaryCountry: account.beneficiaryCountry,
    }));

  const invoices = await prisma.invoice.findMany({
    where: { editionId: activeEdition.id },
    orderBy: { createdAt: "desc" },
    include: {
      linkedJournalEntry: {
        select: {
          id: true,
          sequenceNumber: true,
          label: true,
          date: true,
        },
      },
    },
  });

  const earningEntries = await prisma.journalEntry.findMany({
    where: {
      editionId: activeEdition.id,
      accountType: "PRODUITS",
      isOpeningEntry: false,
    },
    orderBy: [{ date: "desc" }, { sequenceNumber: "desc" }],
    include: {
      linkedInvoice: {
        select: { id: true },
      },
    },
  });

  const history = invoices.map((invoice) => {
    const rawItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    const lineItems = rawItems
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const row = item as Record<string, unknown>;
        const description = String(row.description ?? "").trim();
        const quantity = Number(row.quantity ?? 0);
        const unitPrice = Number(row.unitPrice ?? 0);

        if (!description || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
          return null;
        }

        return {
          description,
          quantity,
          unitPrice,
        };
      })
      .filter((item): item is { description: string; quantity: number; unitPrice: number } => item !== null);

    return {
      id: invoice.id,
      moneyAccountId: invoice.moneyAccountId,
      bankAccountName: invoice.bankAccountName,
      iban: invoice.iban,
      creditorName: invoice.creditorName,
      creditorAddress: invoice.creditorAddress,
      creditorPostalCode: invoice.creditorPostalCode,
      creditorCity: invoice.creditorCity,
      creditorCountry: invoice.creditorCountry,
      invoiceNumber: invoice.invoiceNumber,
      header: invoice.header ?? "",
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "",
      supplierName: invoice.supplierName,
      supplierAddress: invoice.supplierAddress,
      supplierPostalCode: invoice.supplierPostalCode,
      supplierCity: invoice.supplierCity,
      supplierCountry: invoice.supplierCountry,
      reference: invoice.paymentReference ?? "",
      message: invoice.message ?? "",
      totalAmount: decimalToNumber(invoice.totalAmount),
      lineItems,
      qrPayload: invoice.qrPayload,
      createdAt: invoice.createdAt.toISOString(),
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
      linkedJournalEntryId: invoice.linkedJournalEntryId,
      linkedJournalEntryLabel: invoice.linkedJournalEntry
        ? `#${invoice.linkedJournalEntry.sequenceNumber} - ${invoice.linkedJournalEntry.label}`
        : null,
    };
  });

  const payableEntries = earningEntries.map((entry) => ({
    id: entry.id,
    sequenceNumber: entry.sequenceNumber,
    label: entry.label,
    date: entry.date.toISOString().slice(0, 10),
    amount: decimalToNumber(entry.amount),
    linkedInvoiceId: entry.linkedInvoice?.id ?? null,
  }));

  return (
    <InvoicesClient
      locale={locale}
      editionId={activeEdition.id}
      accounts={accounts}
      history={history}
      earningEntries={payableEntries}
      defaultTemplate={{ id: defaultTemplate.id, name: defaultTemplate.name }}
    />
  );
}
