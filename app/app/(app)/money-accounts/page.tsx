import { AccountType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import { MoneyAccountsPageClient } from "./client";
import { WritableEditionOnly } from "@/components/edition-read-only";

import CreateMoneyAccountForm from "./create-money-account-form";

export default async function MoneyAccountsPage() {
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
        },
      },
    },
  }) : null;

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.moneyAccounts.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noEditionSelected}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
          {copy.common.pickEditionHint}
        </p>
      </div>
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
      canDelete: account.journalEntries.length === 0,
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
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.moneyAccounts.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.moneyAccounts.forEdition} {activeEdition.name}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">
          {copy.moneyAccounts.subtitle}
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4 md:grid-cols-2">
          <MoneyAccountsPageClient locale={locale} accounts={accounts} />
        </div>

        <WritableEditionOnly>
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
            <h2 className="text-xl font-semibold">{copy.moneyAccounts.create}</h2>
            <CreateMoneyAccountForm locale={locale} />
          </section>
        </WritableEditionOnly>
      </section>
    </div>
  );
}
