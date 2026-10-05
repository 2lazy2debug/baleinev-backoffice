"use client";

import { useActionState, useState } from "react";
import { DocumentType } from "@prisma/client";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { createDocumentTemplateAction } from "./actions";

type Props = {
  locale: Locale;
  defaultInvoiceHtml: string;
};

export default function CreateTemplateModal({ locale, defaultInvoiceHtml }: Props) {
  const copy = dictionaries[locale];
  const [open, setOpen] = useState(false);
  const [createState, createFormAction, isCreating] = useActionState(createDocumentTemplateAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(createState, isCreating, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.templates.createButton}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.templates.create}
        size="xl"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.shell.cancel}
            </Button>
            <Button type="submit" form="create-template-form" variant="primary" disabled={isCreating}>
              {copy.templates.createButton}
            </Button>
          </>
        }
      >
        <form id="create-template-form" action={createFormAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={createState.error} />
          <Field required label={copy.templates.name}>
            <Input type="text" name="name" required />
          </Field>

          <Field label={copy.templates.documentType}>
            <Select name="documentType" defaultValue={DocumentType.INVOICE}>
              <option value={DocumentType.INVOICE}>{copy.templates.invoiceType}</option>
            </Select>
          </Field>

          <Field label={copy.templates.outputFormat}>
            <Input type="text" value={copy.templates.pdfFormat} disabled className="text-[var(--muted)]" />
          </Field>

          <Field required label={copy.templates.html}>
            <Textarea
              name="html"
              defaultValue={defaultInvoiceHtml}
              required
              rows={18}
              size="sm"
              className="min-h-[320px] font-mono"
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
