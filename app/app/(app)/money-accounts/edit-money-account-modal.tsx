"use client";

import { useActionState, useState } from "react";
import { MoneyAccountType } from "@prisma/client";
import { Pencil } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, IconButton, Input, Modal, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { updateMoneyAccountAction } from "./actions";

type EditableAccount = {
  id: string;
  type: MoneyAccountType;
  name: string;
  openingBalance: number;
  iban: string | null;
  beneficiaryName: string | null;
  beneficiaryAddress: string | null;
  beneficiaryPostalCode: string | null;
  beneficiaryCity: string | null;
  beneficiaryCountry: string;
};

type Props = {
  locale: Locale;
  account: EditableAccount;
};

export function EditMoneyAccountModal({ locale, account }: Props) {
  const copy = dictionaries[locale];
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MoneyAccountType>(account.type);
  const [state, formAction, isPending] = useActionState(updateMoneyAccountAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, isPending, () => setOpen(false));
  const formId = `edit-money-account-${account.id}`;

  return (
    <>
      <IconButton type="button" tone="neutral" label={copy.moneyAccounts.edit} onClick={() => setOpen(true)}>
        <Pencil />
      </IconButton>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.moneyAccounts.edit}
        size="lg"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.shell.cancel}
            </Button>
            <Button type="submit" form={formId} variant="primary" disabled={isPending}>
              {copy.shell.save}
            </Button>
          </>
        }
      >
        <form id={formId} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <input type="hidden" name="moneyAccountId" value={account.id} />
          <FormError message={state.error} />
          <Field label={copy.moneyAccounts.accountName}>
            <Input type="text" name="name" defaultValue={account.name} required />
          </Field>
          <Field label={copy.moneyAccounts.type}>
            <Select name="type" value={type} onChange={(e) => setType(e.target.value as MoneyAccountType)}>
              <option value="BANK">{copy.moneyAccounts.bank}</option>
              <option value="CASH">{copy.moneyAccounts.cash}</option>
              <option value="OTHER">{copy.moneyAccounts.other}</option>
            </Select>
          </Field>
          <Field label={copy.moneyAccounts.openingBalanceLong}>
            <Input type="number" step="0.01" name="openingBalance" defaultValue={account.openingBalance.toFixed(2)} />
          </Field>
          {type === MoneyAccountType.BANK ? (
            <>
              <Field label={copy.moneyAccounts.iban}>
                <Input
                  type="text"
                  name="iban"
                  defaultValue={account.iban ?? ""}
                  placeholder="CH00 0000 0000 0000 0000 0"
                  className="uppercase"
                />
              </Field>
              <Field label={copy.moneyAccounts.beneficiaryName}>
                <Input type="text" name="beneficiaryName" defaultValue={account.beneficiaryName ?? ""} />
              </Field>
              <Field label={copy.moneyAccounts.beneficiaryAddress}>
                <Input type="text" name="beneficiaryAddress" defaultValue={account.beneficiaryAddress ?? ""} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-[110px_1fr_90px]">
                <Field label={copy.moneyAccounts.beneficiaryPostalCode}>
                  <Input type="text" name="beneficiaryPostalCode" defaultValue={account.beneficiaryPostalCode ?? ""} />
                </Field>
                <Field label={copy.moneyAccounts.beneficiaryCity}>
                  <Input type="text" name="beneficiaryCity" defaultValue={account.beneficiaryCity ?? ""} />
                </Field>
                <Field label={copy.moneyAccounts.country}>
                  <Input
                    type="text"
                    name="beneficiaryCountry"
                    maxLength={2}
                    defaultValue={account.beneficiaryCountry}
                    className="uppercase"
                  />
                </Field>
              </div>
            </>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
