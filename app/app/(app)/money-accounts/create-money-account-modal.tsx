"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { createMoneyAccountAction } from "./actions";

type Props = {
  locale: Locale;
};

export default function CreateMoneyAccountModal({ locale }: Props) {
  const copy = dictionaries[locale];
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"BANK" | "CASH" | "OTHER">("BANK");
  const [createState, createFormAction, isCreating] = useActionState(createMoneyAccountAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(createState, isCreating, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <Plus />
        {copy.moneyAccounts.add}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.moneyAccounts.create}
        size="lg"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.shell.cancel}
            </Button>
            <Button type="submit" form="create-money-account-form" variant="primary" disabled={isCreating}>
              {copy.moneyAccounts.add}
            </Button>
          </>
        }
      >
        <form id="create-money-account-form" action={createFormAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={createState.error} />
          <Field label={copy.moneyAccounts.accountName}>
            <Input type="text" name="name" placeholder="Compte courant" required />
          </Field>

          <Field label={copy.moneyAccounts.type}>
            <Select name="type" value={type} onChange={(e) => setType(e.target.value as "BANK" | "CASH" | "OTHER")}>
              <option value="BANK">{copy.moneyAccounts.bank}</option>
              <option value="CASH">{copy.moneyAccounts.cash}</option>
              <option value="OTHER">{copy.moneyAccounts.other}</option>
            </Select>
          </Field>

          <Field label={copy.moneyAccounts.openingBalanceLong}>
            <Input type="number" name="openingBalance" step="0.01" defaultValue="0" />
          </Field>

          {type === "BANK" ? (
            <>
              <Field label={copy.moneyAccounts.iban}>
                <Input type="text" name="iban" placeholder="CH00 0000 0000 0000 0000 0" className="uppercase" />
              </Field>

              <Field label={copy.moneyAccounts.beneficiaryName}>
                <Input type="text" name="beneficiaryName" placeholder="Baleinev Festival" />
              </Field>

              <Field label={copy.moneyAccounts.beneficiaryAddress}>
                <Input type="text" name="beneficiaryAddress" placeholder="Rue de la Baleine 1" />
              </Field>

              <div className="grid gap-3 sm:grid-cols-[110px_1fr_90px]">
                <Field label={copy.moneyAccounts.beneficiaryPostalCode}>
                  <Input type="text" name="beneficiaryPostalCode" placeholder="1000" />
                </Field>
                <Field label={copy.moneyAccounts.beneficiaryCity}>
                  <Input type="text" name="beneficiaryCity" placeholder="Lausanne" />
                </Field>
                <Field label={copy.moneyAccounts.country}>
                  <Input type="text" name="beneficiaryCountry" maxLength={2} defaultValue="CH" className="uppercase" />
                </Field>
              </div>
            </>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
