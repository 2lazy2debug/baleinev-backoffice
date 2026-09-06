"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { createPosTemplateAction } from "../actions";

const FORM_ID = "create-pos-template";

/** The one shape for creating in this app: a header button and a <Modal>. */
export function CreateTemplateModal({ locale }: { locale: Locale }) {
  const copy = dictionaries[locale];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createPosTemplateAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, () => {
    setOpen(false);
    router.refresh();
  });

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.pos.newTemplate}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.pos.newTemplate}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.shell.cancel}
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={pending}>
              {copy.pos.newTemplate}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />
          <Field label={copy.pos.templateName}>
            <Input type="text" name="name" required autoFocus />
          </Field>
        </form>
      </Modal>
    </>
  );
}
