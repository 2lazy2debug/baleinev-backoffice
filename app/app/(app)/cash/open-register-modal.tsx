"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { openCashRegisterAction } from "./actions";
import { DenominationCounter } from "./denomination-counter";

type CashAccountOption = { id: string; name: string };

type Props = {
  locale: Locale;
  cashAccounts: CashAccountOption[];
};

export default function OpenRegisterModal({ locale, cashAccounts }: Props) {
  const copy = dictionaries[locale];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [state, formAction, pending] = useActionState(openCashRegisterAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, () => {
    setOpen(false);
    setCounts({});
    router.refresh();
  });

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.cash.open}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.cash.open}
        size="lg"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.shell.cancel}
            </Button>
            <Button type="submit" form="open-register" variant="primary" disabled={pending}>
              {copy.cash.open}
            </Button>
          </>
        }
      >
        <form id="open-register" action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />

          <Field label={copy.cash.cashAccount}>
            <Select name="moneyAccountId" required defaultValue="">
              <option value="" disabled>
                {copy.cash.cashAccount}
              </option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={copy.cash.registerName}>
            <Input type="text" name="name" required />
          </Field>

          <div className="space-y-2">
            <span className="text-sm font-medium">{copy.cash.float}</span>
            <DenominationCounter locale={locale} name="opening" value={counts} onChange={setCounts} />
          </div>
        </form>
      </Modal>
    </>
  );
}
