import { AccountType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import { CostCentersPageClient } from "./client";

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
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.costCenters.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noEditionSelected}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
          {copy.common.pickEditionHint}
        </p>
      </div>
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
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.costCenters.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.costCenters.forEdition} {activeEdition.name}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">
          {copy.costCenters.subtitle}
        </p>
      </header>

      <CostCentersPageClient locale={locale} costCenters={costCenters} />
    </div>
  );
}
