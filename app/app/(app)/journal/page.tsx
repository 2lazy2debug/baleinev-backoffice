
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import JournalPageClient from "./client";

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

  const activeEdition = await prisma.edition.findFirst({
    where: { isActive: true },
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
  });

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.journal.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noActiveEdition}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
          {copy.journal.noActiveEdition}
        </p>
      </div>
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
      <header className="space-y-2 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.journal.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.journal.entriesFor} - {activeEdition.name}</h1>
        <p className="text-sm text-[var(--muted)]">
          {copy.journal.subtitle}
        </p>
      </header>

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
