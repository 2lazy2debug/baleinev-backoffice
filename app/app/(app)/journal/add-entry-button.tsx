"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";

import { AddJournalEntryModal } from "@/components/add-journal-entry-modal";
import { Button } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

type AddJournalEntryButtonProps = {
  budgets: Array<{ id: string; name: string }>;
  moneyAccounts: Array<{ id: string; name: string }>;
  costCenters: Array<{ id: string; code: string }>;
  locale: Locale;
  /** An approved expense report being booked — opens the modal prefilled on arrival. */
  expensePrefill?: {
    expenseReportId: string;
    budgetId: string | null;
    date: string;
    amount: string;
    label: string;
    referenceNumber: string;
  } | null;
};

/** The journal's create trigger, rendered in `<PageHeader actions>` like every other app's. */
export function AddJournalEntryButton({ budgets, moneyAccounts, costCenters, locale, expensePrefill }: AddJournalEntryButtonProps) {
  const [isOpen, setIsOpen] = useState(Boolean(expensePrefill));
  const router = useRouter();
  const copy = dictionaries[locale].journal;

  const handleClose = () => setIsOpen(false);

  return (
    <>
      <Button variant="primary" icon={<Plus />} compactOnMobile onClick={() => setIsOpen(true)}>
        {copy.addEntry}
      </Button>
      <AddJournalEntryModal
        key={expensePrefill ? `prefill-${expensePrefill.referenceNumber}` : "default"}
        isOpen={isOpen}
        onClose={handleClose}
        budgets={budgets}
        moneyAccounts={moneyAccounts}
        costCenters={costCenters}
        onAfterSubmit={() => {
          router.refresh();
          handleClose();
        }}
        locale={locale}
        fromExpenseReportId={expensePrefill?.expenseReportId ?? null}
        initialValues={expensePrefill ? {
          budgetId: expensePrefill.budgetId ?? undefined,
          accountType: "CHARGES",
          date: expensePrefill.date,
          amount: expensePrefill.amount,
          label: expensePrefill.label,
          referenceNumber: expensePrefill.referenceNumber,
        } : undefined}
      />
    </>
  );
}
