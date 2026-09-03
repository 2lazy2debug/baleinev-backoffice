"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Modal } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { createDepartmentAction } from "./actions";
import { DepartmentFormFields } from "./department-form-fields";

const FORM_ID = "create-department-form";

export function CreateDepartmentModal({ locale }: { locale: Locale }) {
  const copy = dictionaries[locale].departments;
  const shellCopy = dictionaries[locale].shell;

  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createDepartmentAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.create}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.createTitle}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={pending}>
              {copy.createButton}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />
          <DepartmentFormFields locale={locale} />
        </form>
      </Modal>
    </>
  );
}
