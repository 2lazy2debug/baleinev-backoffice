import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

import { EditionsPageClient } from "./client";

export default async function EditionsPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editions = await prisma.edition.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { departments: true, moneyAccounts: true, costCenters: true, journalEntries: true },
      },
    },
  });

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.editions.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.editions.manageYears}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">
          {copy.editions.subtitle}
        </p>
      </header>

      <EditionsPageClient editions={editions} copy={copy} />
    </div>
  );
}
