"use client";

import { useMemo } from "react";

import { JournalTable } from "@/components/journal-table";
import { type Locale } from "@/lib/i18n-dictionaries";

type JournalPageClientProps = {
  activeEdition: {
    id: string;
    name: string;
    budgets: Array<{ id: string; name: string }>;
    moneyAccounts: Array<{ id: string; name: string; openingBalance: number }>;
    costCenters: Array<{ id: string; code: string }>;
    journalEntries: Array<{
      id: string;
      sequenceNumber: number;
      date: Date;
      budget: { name: string } | null;
      accountType: "CHARGES" | "PRODUITS";
      amount: string;
      label: string;
      counterparty: string | null;
      moneyAccount: { name: string };
      costCenter: { code: string } | null;
      isOpeningEntry: boolean;
      moneyAccountId: string;
      linkedInvoice: { id: string; invoiceNumber: string } | null;
      budgetId: string | null;
      costCenterId: string | null;
    }>;
  };
  accountBalances: Record<string, number>;
  locale: Locale;
  /** Admins only — bulk edit rewrites every entry of the ledger at once. */
  isAdmin: boolean;
};

export default function JournalPageClient({ activeEdition, accountBalances, locale, isAdmin }: JournalPageClientProps) {
  const accountOpeningBalances = useMemo(
    () => Object.fromEntries(activeEdition.moneyAccounts.map((account) => [account.id, account.openingBalance])),
    [activeEdition.moneyAccounts],
  );

  return (
    <div className="relative flex-1 flex flex-col gap-4">
      {/* Journal table */}
      <div className="flex-1 min-h-0">
        <JournalTable
          entries={activeEdition.journalEntries}
          accountBalances={accountBalances}
          accountOpeningBalances={accountOpeningBalances}
          locale={locale}
          budgets={activeEdition.budgets}
          moneyAccounts={activeEdition.moneyAccounts}
          costCenters={activeEdition.costCenters}
          canBulkEdit={isAdmin}
        />
      </div>
    </div>
  );
}
