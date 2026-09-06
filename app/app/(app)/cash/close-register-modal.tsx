"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Checkbox, Modal } from "@/components/ui";
import { CASH_DENOMINATIONS, countTotal, fromRappen } from "@/lib/cash";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

import { closeCashRegisterAction } from "./actions";
import type { CashRegisterRow } from "./client";
import { DenominationCounter } from "./denomination-counter";

const FORM_ID = "close-register";

type Props = {
  locale: Locale;
  register: CashRegisterRow | null;
  onClose: () => void;
};

export default function CloseRegisterModal({ locale, register, onClose }: Props) {
  const copy = dictionaries[locale];
  const router = useRouter();
  const [state, formAction, pending] = useActionState(closeCashRegisterAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, () => {
    onClose();
    router.refresh();
  });

  // The count sheet follows the register the dialog points at: opening it on
  // another register starts from a blank sheet. Reset during render rather than
  // in an effect (see article-form-modal for the same pattern).
  const [sheet, setSheet] = useState<Record<number, number>>({});
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const registerId = register?.id ?? null;
  if (sheetFor !== registerId) {
    setSheetFor(registerId);
    setSheet({});
  }

  const total = countTotal(
    CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: sheet[denomination] ?? 0 })),
  );

  return (
    <Modal
      open={register !== null}
      onClose={onClose}
      title={copy.cash.close}
      size="lg"
      mobileFullScreen
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.shell.cancel}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={pending}>
            {copy.cash.close}
          </Button>
        </>
      }
    >
      {register ? (
        <form id={FORM_ID} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />
          <input type="hidden" name="registerId" value={register.id} />

          <p className="text-sm text-[var(--muted)]">
            <span className="font-medium text-[var(--ink)]">{register.name}</span> · {copy.cash.float}:{" "}
            {formatCurrency(fromRappen(register.floatTotal))}
          </p>

          <div className="space-y-2">
            <span className="text-sm font-medium">{copy.cash.counted}</span>
            <DenominationCounter locale={locale} name="closing" value={sheet} onChange={setSheet} />
          </div>

          {total === 0 ? <Checkbox name="confirmEmpty" value="on" label={copy.cash.confirmEmpty} /> : null}
        </form>
      ) : null}
    </Modal>
  );
}
