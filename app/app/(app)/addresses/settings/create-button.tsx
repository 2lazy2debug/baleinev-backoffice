"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { createAddressTypeAction } from "../actions";

const FORM_ID = "create-address-type-form";

/** The one thing this screen creates, the way everything else in the app creates. */
export function AddressSettingsCreateButton({ locale }: { locale: Locale }) {
  const copy = dictionaries[locale].addresses;
  const shellCopy = dictionaries[locale].shell;

  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createAddressTypeAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.addContactType}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.createContactType}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={pending}>
              {copy.addContactType}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />
          <Field label={copy.name}>
            <Input type="text" name="name" required autoFocus />
          </Field>
        </form>
      </Modal>
    </>
  );
}
