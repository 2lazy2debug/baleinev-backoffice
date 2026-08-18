"use client";

import { useActionState } from "react";
import { MoneyAccountType } from "@prisma/client";
import { Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

import { deleteMoneyAccountAction, updateMoneyAccountAction } from "./actions";

type MoneyAccountItem = {
  id: string;
  type: MoneyAccountType;
  name: string;
  journalEntriesCount: number;
  openingBalance: number;
  balance: number;
  canDelete: boolean;
  iban: string | null;
  beneficiaryName: string | null;
  beneficiaryAddress: string | null;
  beneficiaryPostalCode: string | null;
  beneficiaryCity: string | null;
  beneficiaryCountry: string;
};

type Props = {
  locale: Locale;
  accounts: MoneyAccountItem[];
};

export function MoneyAccountsPageClient({ locale, accounts }: Props) {
  const copy = dictionaries[locale];
  const [updateState, updateFormAction, isSavingAccount] = useActionState(updateMoneyAccountAction, initialActionState);
  const [deleteState, deleteFormAction, isDeletingAccount] = useActionState(deleteMoneyAccountAction, initialActionState);
  const isReadOnly = useEditionReadOnly();

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)] md:col-span-2">
        {copy.moneyAccounts.noMoneyAccounts}
      </div>
    );
  }

  return (
    <>
      <FormError message={updateState.error} className="md:col-span-2" />
      <FormError message={deleteState.error} className="md:col-span-2" />
      {accounts.map((account) => (
        <article key={account.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{account.type}</p>
              <h2 className="mt-2 text-lg font-semibold">{account.name}</h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                {account.journalEntriesCount} {copy.moneyAccounts.journalEntries}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {copy.moneyAccounts.openingBalance}: {formatCurrency(account.openingBalance)}
              </p>
              {account.type === MoneyAccountType.BANK ? (
                <p className="mt-2 text-sm text-[var(--muted)]">{copy.moneyAccounts.iban}: {account.iban ?? "-"}</p>
              ) : null}
              <p className="mt-4 text-2xl font-semibold tracking-tight">{formatCurrency(account.balance)}</p>

              {isReadOnly ? null : (
              <form action={updateFormAction} className="mt-4 space-y-2">
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
                    defaultValue={account.openingBalance.toFixed(2)}
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
                <button
                  disabled={isSavingAccount}
                  className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[var(--panel)] disabled:opacity-60"
                >
                  {copy.shell.save}
                </button>
              </form>
              )}
            </div>

            {isReadOnly ? null : (
              <form action={deleteFormAction}>
                <input type="hidden" name="moneyAccountId" value={account.id} />
                <button
                  disabled={!account.canDelete || isDeletingAccount}
                  title={account.canDelete ? copy.moneyAccounts.deleteAccount : copy.moneyAccounts.cannotDelete}
                  className="rounded-md border border-rose-300 p-2 text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)] disabled:hover:bg-transparent"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </form>
            )}
          </div>
        </article>
      ))}
    </>
  );
}
