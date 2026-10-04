import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

import CreateEditionModal from "./create-edition-modal";
import { EditionsPageClient } from "./client";
import { PageHeader } from "@/components/ui";

export default async function EditionsPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editions = await prisma.edition.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { budgets: true, moneyAccounts: true, costCenters: true, journalEntries: true },
      },
    },
  });

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.editions.title}
        title={copy.editions.manageYears}
        description={copy.editions.subtitle}
        actions={
          <CreateEditionModal
            locale={locale}
            editions={editions.map((e) => ({ id: e.id, name: e.name, closed: e.closedAt !== null }))}
          />
        }
      />

      <EditionsPageClient editions={editions} copy={copy} />
    </div>
  );
}
