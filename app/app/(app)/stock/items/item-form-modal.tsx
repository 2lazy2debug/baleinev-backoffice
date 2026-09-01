"use client";

import { useActionState } from "react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Checkbox, Field, Input, Modal, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

import { createStockElementAction, updateStockElementAction } from "../actions";

export type UnitOption = {
  id: string;
  name: string;
};

export type ItemDraft = {
  id: string;
  name: string;
  brand: string;
  unitId: string;
  unitQty: string;
  expireable: boolean;
};

type Props = {
  locale: Locale;
  units: UnitOption[];
  open: boolean;
  onClose: () => void;
  /** The item being edited, or null to create one. */
  item: ItemDraft | null;
};

const FORM_ID = "stock-item-form";

/**
 * What an item *is*, in one dialog — used both by the header's create button and
 * by the pencil on a row.
 *
 * Editing is a dialog on every breakpoint rather than an inline row editor: five
 * fields, one of them a checkbox, do not fit a table cell on a phone, and a
 * second mobile-only editor is exactly the drift the design rules forbid.
 */
export function ItemFormModal({ locale, units, open, onClose, item }: Props) {
  const copy = dictionaries[locale].stock;
  const shellCopy = dictionaries[locale].shell;

  async function submit(previous: ActionState, formData: FormData): Promise<ActionState> {
    return item ? updateStockElementAction(previous, formData) : createStockElementAction(previous, formData);
  }

  const [state, formAction, pending] = useActionState(submit, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, onClose);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? copy.editItem : copy.createItem}
      size="md"
      mobileFullScreen
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {shellCopy.cancel}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={pending}>
            {shellCopy.save}
          </Button>
        </>
      }
    >
      {/* Keyed on the item so the uncontrolled fields reset between two rows
          opened one after the other. */}
      <form
        key={item?.id ?? "new"}
        id={FORM_ID}
        action={formAction}
        onSubmit={markSubmitted}
        className="space-y-4"
      >
        <FormError message={state.error} />
        {item ? <input type="hidden" name="elementId" value={item.id} /> : null}

        <Field label={copy.name}>
          <Input type="text" name="name" defaultValue={item?.name ?? ""} required autoFocus />
        </Field>
        <Field label={copy.brand}>
          <Input type="text" name="brand" defaultValue={item?.brand ?? ""} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={copy.unitQty}>
            <Input type="text" inputMode="decimal" name="unitQty" defaultValue={item?.unitQty ?? "1"} required />
          </Field>
          <Field label={copy.unit}>
            <Select name="unitId" defaultValue={item?.unitId ?? ""} required>
              <option value="" disabled>
                {copy.unit}
              </option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="space-y-1">
          <Checkbox
            id="stock-item-expireable"
            name="expireable"
            label={copy.expireable}
            defaultChecked={item?.expireable ?? false}
          />
          <p className="text-xs text-[var(--muted)]">{copy.expireableHint}</p>
        </div>
      </form>
    </Modal>
  );
}
