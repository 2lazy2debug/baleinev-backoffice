"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Checkbox, Field, Input, Modal, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { createEditionAction } from "./actions";

type Props = {
  locale: Locale;
  editions: { id: string; name: string; closed: boolean }[];
};

export default function CreateEditionModal({ locale, editions }: Props) {
  const copy = dictionaries[locale];
  const [open, setOpen] = useState(false);
  const [createState, createFormAction, isCreating] = useActionState(createEditionAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(createState, isCreating, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.editions.createButton}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.editions.create}
        size="md"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.shell.cancel}
            </Button>
            <Button type="submit" form="create-edition-form" variant="primary" disabled={isCreating}>
              {copy.editions.createButton}
            </Button>
          </>
        }
      >
        <form id="create-edition-form" action={createFormAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={createState.error} />
          <Field label={copy.editions.editionName}>
            <Input
              type="text"
              name="name"
              placeholder="2025-2026"
              required
              pattern="\d{4}-\d{4}"
              title={copy.editions.editionNameHint}
            />
            <span className="mt-2 block text-xs text-[var(--muted)]">{copy.editions.editionNameHint}</span>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={copy.editions.startDate}>
              <Input type="date" name="startDate" />
            </Field>

            <Field label={copy.editions.endDate}>
              <Input type="date" name="endDate" />
            </Field>
          </div>

          <Field label={copy.editions.drivingRatePerKm}>
            <Input type="number" name="drivingRatePerKm" step="0.01" min="0.01" defaultValue="0.30" required />
          </Field>

          <Field label={copy.editions.carryOverFrom}>
            <Select name="carryOverFromId" defaultValue="">
              <option value="">{copy.editions.carryOverNone}</option>
              {editions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {edition.closed ? `${edition.name} — ${copy.editions.closed.toLowerCase()}` : edition.name}
                </option>
              ))}
            </Select>
            <span className="mt-2 block text-xs text-[var(--muted)]">{copy.editions.carryOverHint}</span>
          </Field>

          <div className="space-y-1">
            <Checkbox id="isDefault" name="isDefault" label={copy.editions.makeDefault} />
            <p className="text-xs text-[var(--muted)]">{copy.editions.defaultHint}</p>
          </div>
        </form>
      </Modal>
    </>
  );
}
