import { AccountType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import { CostCentersPageClient } from "./client";
import { EmptyPage, PageHeader } from "@/components/ui";

export default async function CostCentersPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
    include: {
      costCenters: {
        orderBy: { code: "asc" },
        include: {
          _count: { select: { journalEntries: true } },
          journalEntries: true,
        },
      },
    },
  }) : null;

  if (!activeEdition) {
    return (
      <EmptyPage eyebrow={copy.costCenters.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  const costCenters = activeEdition.costCenters.map((costCenter) => {
    const charges = costCenter.journalEntries.reduce((total, entry) => {
      return entry.accountType === AccountType.CHARGES
        ? total + decimalToNumber(entry.amount)
        : total;
    }, 0);
    const produits = costCenter.journalEntries.reduce((total, entry) => {
      return entry.accountType === AccountType.PRODUITS
        ? total + decimalToNumber(entry.amount)
        : total;
    }, 0);

    return {
      id: costCenter.id,
      code: costCenter.code,
      name: costCenter.name,
      journalEntriesCount: costCenter.journalEntries.length,
      charges,
      produits,
      canDelete: costCenter._count.journalEntries === 0,
    };
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={copy.costCenters.title}
        title={<>{copy.costCenters.forEdition} {activeEdition.name}</>}
        description={copy.costCenters.subtitle}
      />

      <CostCentersPageClient locale={locale} costCenters={costCenters} />
    </div>
  );
}
