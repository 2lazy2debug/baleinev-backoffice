import { notFound } from "next/navigation";

import { Card, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import { JournalEntryEditForm } from "./edit-form";

type JournalEntryEditPageProps = {
  params: Promise<{ journalEntryId: string }>;
};

export default async function JournalEntryEditPage({ params }: JournalEntryEditPageProps) {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const { journalEntryId } = await params;

  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
    include: {
      departments: { orderBy: { name: "asc" } },
      moneyAccounts: { orderBy: { name: "asc" } },
      costCenters: { orderBy: { code: "asc" } },
    },
  }) : null;

  if (!activeEdition) {
    notFound();
  }

  const entry = await prisma.journalEntry.findFirst({
    where: {
      id: journalEntryId,
      editionId: activeEdition.id,
    },
  });

  if (!entry || entry.isOpeningEntry) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={copy.journal.title}
        title={<>{copy.journal.edit} #{entry.sequenceNumber}</>}
        description={copy.journal.subtitle}
      />

      <Card as="section">
        <JournalEntryEditForm
          copy={copy.journal}
          commonCopy={copy.common}
          shellCopy={copy.shell}
          entry={{
            id: entry.id,
            departmentId: entry.departmentId,
            accountType: entry.accountType,
            date: entry.date.toISOString().slice(0, 10),
            amount: decimalToNumber(entry.amount).toFixed(2),
            moneyAccountId: entry.moneyAccountId,
            label: entry.label,
            counterparty: entry.counterparty,
            referenceNumber: entry.referenceNumber,
            costCenterId: entry.costCenterId,
          }}
          departments={activeEdition.departments}
          moneyAccounts={activeEdition.moneyAccounts}
          costCenters={activeEdition.costCenters}
        />
      </Card>
    </div>
  );
}
