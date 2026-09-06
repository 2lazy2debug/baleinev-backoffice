"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Modal } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { createBudgetAction } from "./actions";
import { BudgetFormFields } from "./budget-form-fields";

const FORM_ID = "create-budget-form";

export function CreateBudgetModal({
  locale,
  departments,
}: {
  locale: Locale;
  departments: { id: string; name: string }[];
}) {
  const copy = dictionaries[locale].budget;
  const shellCopy = dictionaries[locale].shell;

  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createBudgetAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.createBudget}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.createBudgetTitle}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={pending}>
              {copy.createBudgetButton}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />
          <BudgetFormFields locale={locale} departments={departments} />
        </form>
      </Modal>
    </>
  );
}
