import { AccountType, MoneyAccountType } from "@prisma/client";
import { Trash2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber, formatCurrency } from "@/lib/utils";

import { deleteMoneyAccountAction, updateMoneyAccountAction } from "./actions";
import CreateMoneyAccountForm from "./create-money-account-form";

export default async function MoneyAccountsPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const activeEdition = await prisma.edition.findFirst({
    where: { isActive: true },
    include: {
      moneyAccounts: {
        orderBy: { name: "asc" },
        include: {
          journalEntries: true,
        },
      },
    },
  });

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.moneyAccounts.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noActiveEdition}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
          {copy.common.createAndActivateEdition}
        </p>
      </div>
    );
  }

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
          {activeEdition.moneyAccounts.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[var(--line)] bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)] md:col-span-2">
              {copy.moneyAccounts.noMoneyAccounts}
            </div>
          ) : (
            activeEdition.moneyAccounts.map((account) => {
              const balance = account.journalEntries.reduce((total, entry) => {
                const amount = decimalToNumber(entry.amount);
                return entry.accountType === AccountType.PRODUITS ? total + amount : total - amount;
              }, decimalToNumber(account.openingBalance));

              const openingBalance = decimalToNumber(account.openingBalance);
              const canDelete = account.journalEntries.length === 0;

              return (
                <article key={account.id} className="rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{account.type}</p>
                      <h2 className="mt-2 text-lg font-semibold">{account.name}</h2>
                      <p className="mt-3 text-sm text-[var(--muted)]">
                        {account.journalEntries.length} {copy.moneyAccounts.journalEntries}
                      </p>
                      <p className="mt-2 text-sm text-[var(--muted)]">{copy.moneyAccounts.openingBalance}: {formatCurrency(openingBalance)}</p>
                      {account.type === MoneyAccountType.BANK ? (
                        <p className="mt-2 text-sm text-[var(--muted)]">{copy.moneyAccounts.iban}: {account.iban ?? "-"}</p>
                      ) : null}
                      <p className="mt-4 text-2xl font-semibold tracking-tight">{formatCurrency(balance)}</p>

                      <form action={updateMoneyAccountAction} className="mt-4 space-y-2">
                        <input type="hidden" name="moneyAccountId" value={account.id} />
                        <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                          <input
                            type="text"
                            name="name"
                            defaultValue={account.name}
                            required
                            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                          />
                          <input
                            type="number"
                            step="0.01"
                            name="openingBalance"
                            defaultValue={openingBalance.toFixed(2)}
                            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                          />
                        </div>
                        {account.type === MoneyAccountType.BANK ? (
                          <>
                            <input
                              type="text"
                              name="iban"
                              defaultValue={account.iban ?? ""}
                              placeholder="CH00 0000 0000 0000 0000 0"
                              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm uppercase outline-none transition focus:border-[var(--accent)]"
                            />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                name="beneficiaryName"
                                defaultValue={account.beneficiaryName ?? ""}
                                placeholder={copy.moneyAccounts.beneficiaryName}
                                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                              />
                              <input
                                type="text"
                                name="beneficiaryAddress"
                                defaultValue={account.beneficiaryAddress ?? ""}
                                placeholder={copy.moneyAccounts.beneficiaryAddress}
                                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                              />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[110px_1fr_90px]">
                              <input
                                type="text"
                                name="beneficiaryPostalCode"
                                defaultValue={account.beneficiaryPostalCode ?? ""}
                                placeholder={copy.moneyAccounts.beneficiaryPostalCode}
                                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                              />
                              <input
                                type="text"
                                name="beneficiaryCity"
                                defaultValue={account.beneficiaryCity ?? ""}
                                placeholder={copy.moneyAccounts.beneficiaryCity}
                                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
                              />
                              <input
                                type="text"
                                name="beneficiaryCountry"
                                maxLength={2}
                                defaultValue={account.beneficiaryCountry}
                                placeholder="CH"
                                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm uppercase outline-none transition focus:border-[var(--accent)]"
                              />
                            </div>
                          </>
                        ) : null}
                        <button className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[var(--panel)]">
                          {copy.shell.save}
                        </button>
                      </form>
                    </div>

                    <form action={deleteMoneyAccountAction}>
                      <input type="hidden" name="moneyAccountId" value={account.id} />
                      <button
                        disabled={!canDelete}
                        title={canDelete ? copy.moneyAccounts.deleteAccount : copy.moneyAccounts.cannotDelete}
                        className="rounded-full border border-rose-300 p-2 text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)] disabled:hover:bg-transparent"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <section className="rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-6">
          <h2 className="text-xl font-semibold">{copy.moneyAccounts.create}</h2>
          <CreateMoneyAccountForm locale={locale} />
        </section>
      </section>
    </div>
  );
}
