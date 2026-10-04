"use client";

import { useActionState } from "react";
import { MoneyAccountType } from "@prisma/client";
import { Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { Card, IconButton, SectionTitle } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

import { deleteMoneyAccountAction } from "./actions";
import { EditMoneyAccountModal } from "./edit-money-account-modal";

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
  const [deleteState, deleteFormAction, isDeletingAccount] = useActionState(deleteMoneyAccountAction, initialActionState);
  const isReadOnly = useEditionReadOnly();

  if (accounts.length === 0) {
    return <Card span="full" dashed>{copy.moneyAccounts.noMoneyAccounts}</Card>;
  }

  return (
    <>
      <FormError message={deleteState.error} className="col-span-12" />
      {accounts.map((account) => (
        <MoneyAccountCard
          key={account.id}
          account={account}
          copy={copy}
          locale={locale}
          isReadOnly={isReadOnly}
          isDeletingAccount={isDeletingAccount}
          deleteFormAction={deleteFormAction}
        />
      ))}
    </>
  );
}

type Copy = (typeof dictionaries)[Locale];

const typeLabels: Record<MoneyAccountType, keyof Copy["moneyAccounts"]> = {
  BANK: "bank",
  CASH: "cash",
  OTHER: "other",
};

function MoneyAccountCard({
  account,
  copy,
  locale,
  isReadOnly,
  isDeletingAccount,
  deleteFormAction,
}: {
  account: MoneyAccountItem;
  copy: Copy;
  locale: Locale;
  isReadOnly: boolean;
  isDeletingAccount: boolean;
  deleteFormAction: (formData: FormData) => void;
}) {
  return (
    <Card as="article" span="1/2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            {copy.moneyAccounts[typeLabels[account.type]]}
          </p>
          <SectionTitle className="mt-2">{account.name}</SectionTitle>
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
        </div>

        {isReadOnly ? null : (
          <div className="flex items-center gap-1">
            <EditMoneyAccountModal locale={locale} account={account} />
            <form action={deleteFormAction}>
            <input type="hidden" name="moneyAccountId" value={account.id} />
            <IconButton
              type="submit"
              tone="delete"
              label={account.canDelete ? copy.moneyAccounts.deleteAccount : copy.moneyAccounts.cannotDelete}
              disabled={!account.canDelete || isDeletingAccount}
            >
              <Trash2 />
            </IconButton>
            </form>
          </div>
        )}
      </div>
    </Card>
  );
}
