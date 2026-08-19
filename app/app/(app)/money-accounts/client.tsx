"use client";

import { useActionState, useState } from "react";
import { MoneyAccountType } from "@prisma/client";
import { Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { Button, Card, IconButton, Input, Select } from "@/components/ui";
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
    return <Card span="full" dashed>{copy.moneyAccounts.noMoneyAccounts}</Card>;
  }

  return (
    <>
      <FormError message={updateState.error} className="col-span-12" />
      <FormError message={deleteState.error} className="col-span-12" />
      {accounts.map((account) => (
        <MoneyAccountCard
          key={account.id}
          account={account}
          copy={copy}
          isReadOnly={isReadOnly}
          isSavingAccount={isSavingAccount}
          isDeletingAccount={isDeletingAccount}
          updateFormAction={updateFormAction}
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
  isReadOnly,
  isSavingAccount,
  isDeletingAccount,
  updateFormAction,
  deleteFormAction,
}: {
  account: MoneyAccountItem;
  copy: Copy;
  isReadOnly: boolean;
  isSavingAccount: boolean;
  isDeletingAccount: boolean;
  updateFormAction: (formData: FormData) => void;
  deleteFormAction: (formData: FormData) => void;
}) {
  const [type, setType] = useState<MoneyAccountType>(account.type);

  return (
    <Card as="article" span="1/2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            {copy.moneyAccounts[typeLabels[account.type]]}
          </p>
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
            <div className="grid gap-2 sm:grid-cols-[1fr_150px_150px]">
              <Input type="text" name="name" defaultValue={account.name} required size="sm" />
              <Select name="type" value={type} onChange={(e) => setType(e.target.value as MoneyAccountType)} size="sm">
                <option value="BANK">{copy.moneyAccounts.bank}</option>
                <option value="CASH">{copy.moneyAccounts.cash}</option>
                <option value="OTHER">{copy.moneyAccounts.other}</option>
              </Select>
              <Input
                type="number"
                step="0.01"
                name="openingBalance"
                defaultValue={account.openingBalance.toFixed(2)}
                size="sm"
              />
            </div>
            {type === MoneyAccountType.BANK ? (
              <>
                <Input
                  type="text"
                  name="iban"
                  defaultValue={account.iban ?? ""}
                  placeholder="CH00 0000 0000 0000 0000 0"
                  className="uppercase"
                  size="sm"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    type="text"
                    name="beneficiaryName"
                    defaultValue={account.beneficiaryName ?? ""}
                    placeholder={copy.moneyAccounts.beneficiaryName}
                    size="sm"
                  />
                  <Input
                    type="text"
                    name="beneficiaryAddress"
                    defaultValue={account.beneficiaryAddress ?? ""}
                    placeholder={copy.moneyAccounts.beneficiaryAddress}
                    size="sm"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-[110px_1fr_90px]">
                  <Input
                    type="text"
                    name="beneficiaryPostalCode"
                    defaultValue={account.beneficiaryPostalCode ?? ""}
                    placeholder={copy.moneyAccounts.beneficiaryPostalCode}
                    size="sm"
                  />
                  <Input
                    type="text"
                    name="beneficiaryCity"
                    defaultValue={account.beneficiaryCity ?? ""}
                    placeholder={copy.moneyAccounts.beneficiaryCity}
                    size="sm"
                  />
                  <Input
                    type="text"
                    name="beneficiaryCountry"
                    maxLength={2}
                    defaultValue={account.beneficiaryCountry}
                    placeholder="CH"
                    className="uppercase"
                    size="sm"
                  />
                </div>
              </>
            ) : null}
            <Button type="submit" variant="secondary" size="sm" disabled={isSavingAccount}>
              {copy.shell.save}
            </Button>
          </form>
          )}
        </div>

        {isReadOnly ? null : (
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
        )}
      </div>
    </Card>
  );
}
