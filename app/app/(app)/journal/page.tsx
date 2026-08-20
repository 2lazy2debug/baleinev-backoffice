
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import JournalPageClient from "./client";
import { EmptyPage, PageHeader } from "@/components/ui";

type JournalPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JournalPage({ searchParams }: JournalPageProps) {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const fromExpenseReport = typeof resolvedSearchParams.fromExpenseReport === "string"
    ? resolvedSearchParams.fromExpenseReport
    : null;

  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
    include: {
      departments: { orderBy: { name: "asc" } },
      moneyAccounts: { orderBy: { name: "asc" } },
      costCenters: { orderBy: { code: "asc" } },
      journalEntries: {
        orderBy: [{ sequenceNumber: "asc" }],
        include: {
          department: { select: { name: true } },
          moneyAccount: { select: { name: true } },
          costCenter: { select: { code: true } },
          linkedInvoice: { select: { id: true, invoiceNumber: true } },
        },
      },
    },
  }) : null;

  if (!activeEdition) {
    return (
      <EmptyPage eyebrow={copy.journal.title} title={copy.common.noEditionSelected}>
        {copy.journal.pickEditionHint}
      </EmptyPage>
    );
  }

  const prefillExpenseReport = fromExpenseReport
    ? await prisma.expenseReport.findFirst({
      where: {
        id: fromExpenseReport,
        editionId: activeEdition.id,
        status: "APPROVED",
      },
      select: {
        id: true,
        departmentId: true,
        date: true,
        amount: true,
        description: true,
      },
    })
    : null;

  // Calculate account balances including opening balances
  const accountBalances: Record<string, number> = {};
  
  for (const account of activeEdition.moneyAccounts) {
    let balance = decimalToNumber(account.openingBalance);
    
    // Add all journal entries for this account
    for (const entry of activeEdition.journalEntries) {
      if (entry.moneyAccountId === account.id) {
        const amount = decimalToNumber(entry.amount);
        balance += entry.accountType === "PRODUITS" ? amount : -amount;
      }
    }
    
    accountBalances[account.name] = balance;
  }

  return (
    <div className="space-y-6 flex flex-col h-full">
      <PageHeader
        eyebrow={copy.journal.title}
        title={<>{copy.journal.entriesFor} - {activeEdition.name}</>}
        description={copy.journal.subtitle}
      />

      <JournalPageClient
        activeEdition={{
          id: activeEdition.id,
          name: activeEdition.name,
          departments: activeEdition.departments,
            moneyAccounts: activeEdition.moneyAccounts.map((account) => ({
              id: account.id,
              name: account.name,
              openingBalance: decimalToNumber(account.openingBalance),
            })),
          costCenters: activeEdition.costCenters,
          journalEntries: activeEdition.journalEntries.map((entry) => ({
            id: entry.id,
            sequenceNumber: entry.sequenceNumber,
            date: entry.date,
            department: entry.department,
            accountType: entry.accountType,
            amount: entry.amount.toString(),
            label: entry.label,
            counterparty: entry.counterparty,
            moneyAccount: entry.moneyAccount,
            costCenter: entry.costCenter,
            isOpeningEntry: entry.isOpeningEntry,
            moneyAccountId: entry.moneyAccountId,
            linkedInvoice: entry.linkedInvoice,
            departmentId: entry.departmentId ?? null,
            costCenterId: entry.costCenterId ?? null,
          })),
        }}
        accountBalances={accountBalances}
        locale={locale}
        expensePrefill={prefillExpenseReport ? {
          expenseReportId: prefillExpenseReport.id,
          departmentId: prefillExpenseReport.departmentId,
          date: prefillExpenseReport.date.toISOString().slice(0, 10),
          amount: decimalToNumber(prefillExpenseReport.amount).toFixed(2),
          label: prefillExpenseReport.description,
          referenceNumber: `NDF-${prefillExpenseReport.id.slice(-6).toUpperCase()}`,
        } : null}
      />
    </div>
  );
}
