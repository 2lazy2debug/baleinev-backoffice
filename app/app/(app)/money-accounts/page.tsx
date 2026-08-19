import { AccountType } from "@prisma/client";

import { requireMoneyAccountManager } from "@/lib/access";
import { Card, CardGrid, PageHeader, SectionTitle } from "@/components/ui";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import { MoneyAccountsPageClient } from "./client";
import { WritableEditionOnly } from "@/components/edition-read-only";

import CreateMoneyAccountForm from "./create-money-account-form";

export default async function MoneyAccountsPage() {
  await requireMoneyAccountManager();

  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
    include: {
      moneyAccounts: {
        orderBy: { name: "asc" },
        include: {
          journalEntries: true,
          invoices: true,
        },
      },
    },
  }) : null;

  if (!activeEdition) {
    return (
      <PageHeader
        eyebrow={copy.moneyAccounts.title}
        title={copy.common.noEditionSelected}
        description={copy.common.pickEditionHint}
      />
    );
  }

  const accounts = activeEdition.moneyAccounts.map((account) => {
    const openingBalance = decimalToNumber(account.openingBalance);
    const balance = account.journalEntries.reduce((total, entry) => {
      const amount = decimalToNumber(entry.amount);
      return entry.accountType === AccountType.PRODUITS ? total + amount : total - amount;
    }, openingBalance);

    return {
      id: account.id,
      type: account.type,
      name: account.name,
      journalEntriesCount: account.journalEntries.length,
      openingBalance,
      balance,
      canDelete: account.journalEntries.length === 0 && account.invoices.length === 0,
      iban: account.iban,
      beneficiaryName: account.beneficiaryName,
      beneficiaryAddress: account.beneficiaryAddress,
      beneficiaryPostalCode: account.beneficiaryPostalCode,
      beneficiaryCity: account.beneficiaryCity,
      beneficiaryCountry: account.beneficiaryCountry,
    };
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={copy.moneyAccounts.title}
        title={<>{copy.moneyAccounts.forEdition} {activeEdition.name}</>}
        description={copy.moneyAccounts.subtitle}
      />

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          <CardGrid>
            <MoneyAccountsPageClient locale={locale} accounts={accounts} />
          </CardGrid>
        </div>

        <WritableEditionOnly>
          <div>
            <Card as="section">
              <SectionTitle>{copy.moneyAccounts.create}</SectionTitle>
              <CreateMoneyAccountForm locale={locale} />
            </Card>
          </div>
        </WritableEditionOnly>
      </section>
    </div>
  );
}
