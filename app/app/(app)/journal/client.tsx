"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { JournalTable } from "@/components/journal-table";
import { AddJournalEntryModal } from "@/components/add-journal-entry-modal";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

type JournalPageClientProps = {
  activeEdition: {
    id: string;
    name: string;
    departments: Array<{ id: string; name: string }>;
    moneyAccounts: Array<{ id: string; name: string; openingBalance: number }>;
    costCenters: Array<{ id: string; code: string }>;
    journalEntries: Array<{
      id: string;
      sequenceNumber: number;
      date: Date;
      department: { name: string } | null;
      accountType: "CHARGES" | "PRODUITS";
      amount: string;
      label: string;
      moneyAccount: { name: string };
      costCenter: { code: string } | null;
      isOpeningEntry: boolean;
      moneyAccountId: string;
      linkedInvoice: { id: string; invoiceNumber: string } | null;
      departmentId: string | null;
      costCenterId: string | null;
    }>;
  };
  accountBalances: Record<string, number>;
  locale: Locale;
  expensePrefill?: {
    expenseReportId: string;
    departmentId: string;
    date: string;
    amount: string;
    label: string;
    referenceNumber: string;
  } | null;
};

export default function JournalPageClient({ activeEdition, accountBalances, locale, expensePrefill }: JournalPageClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(Boolean(expensePrefill));
  const router = useRouter();
  const copy = dictionaries[locale].journal;

  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  const handleAfterSubmit = () => {
    router.refresh();
    handleModalClose();
  };

  return (
    <div className="relative flex-1 flex flex-col gap-4">
      {/* Plus button above table */}
      <button
        onClick={() => setIsModalOpen(true)}
        title={copy.addEntry}
        className="self-start w-10 h-10 rounded-full bg-[var(--accent)] text-white font-bold text-lg hover:bg-[var(--accent-strong)] flex items-center justify-center"
      >
        +
      </button>

      {/* Modal for adding entry */}
      <AddJournalEntryModal
        key={expensePrefill ? `prefill-${expensePrefill.referenceNumber}` : "default"}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        departments={activeEdition.departments}
        moneyAccounts={activeEdition.moneyAccounts}
        costCenters={activeEdition.costCenters}
        onAfterSubmit={handleAfterSubmit}
        locale={locale}
        fromExpenseReportId={expensePrefill?.expenseReportId ?? null}
        initialValues={expensePrefill ? {
          departmentId: expensePrefill.departmentId,
          accountType: "CHARGES",
          date: expensePrefill.date,
          amount: expensePrefill.amount,
          label: expensePrefill.label,
          referenceNumber: expensePrefill.referenceNumber,
        } : undefined}
      />

      {/* Journal table */}
      <div className="flex-1 min-h-0">
        <JournalTable
          entries={activeEdition.journalEntries}
          accountBalances={accountBalances}
          accountOpeningBalances={Object.fromEntries(
            activeEdition.moneyAccounts.map((account) => [account.id, account.openingBalance]),
          )}
          locale={locale}
          departments={activeEdition.departments}
          moneyAccounts={activeEdition.moneyAccounts}
          costCenters={activeEdition.costCenters}
        />
      </div>
    </div>
  );
}
