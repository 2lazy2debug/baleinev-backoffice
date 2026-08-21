"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { createCostCenterAction } from "./actions";

type Props = {
  locale: Locale;
};

export default function CreateCostCenterModal({ locale }: Props) {
  const copy = dictionaries[locale];
  const [open, setOpen] = useState(false);
  const [createState, createFormAction, isCreating] = useActionState(createCostCenterAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(createState, isCreating, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <Plus />
        {copy.costCenters.add}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.costCenters.create}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.shell.cancel}
            </Button>
            <Button type="submit" form="create-cost-center-form" variant="primary" disabled={isCreating}>
              {copy.costCenters.add}
            </Button>
          </>
        }
      >
        <form id="create-cost-center-form" action={createFormAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={createState.error} />
          <Field label={copy.costCenters.code}>
            <Input type="text" name="code" placeholder="AFTER" required />
          </Field>

          <Field label={copy.costCenters.name}>
            <Input type="text" name="name" placeholder="After party" required />
          </Field>
        </form>
      </Modal>
    </>
  );
}
