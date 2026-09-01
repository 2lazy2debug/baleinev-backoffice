"use client";

import { useActionState, useCallback, useState } from "react";
import { Plus } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Checkbox, Field, Input, Modal, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { formatPiece } from "@/lib/stock";
import { initialActionState } from "@/lib/server-action-helpers";

import { addStockAction } from "./actions";

export type ElementOption = {
  id: string;
  name: string;
  brand: string;
  unitName: string;
  unitQty: number;
  expireable: boolean;
};

export type UnitOption = {
  id: string;
  name: string;
};

type Props = {
  locale: Locale;
  stockPlaceId: string;
  elements: ElementOption[];
  units: UnitOption[];
};

const FORM_ID = "add-stock-form";

/**
 * The one way stock comes in: pick an item, say how many, and — only when the
 * item expires — say until when.
 *
 * The item can also be invented here. The catalogue screen is where items are
 * kept tidy, but someone standing in front of a delivery of something the book
 * has never held should not have to leave the dialog to file it first: ticking
 * "new item" creates the catalogue entry and stocks it in the same submission.
 */
export function AddStockModal({ locale, stockPlaceId, elements, units }: Props) {
  const copy = dictionaries[locale].stock;
  const shellCopy = dictionaries[locale].shell;

  const [open, setOpen] = useState(false);
  const [creatingElement, setCreatingElement] = useState(false);
  const [elementId, setElementId] = useState("");
  const [newElementExpires, setNewElementExpires] = useState(false);

  const [state, formAction, pending] = useActionState(addStockAction, initialActionState);

  // Closing resets the dialog, not just its visibility: the next "new entry" is
  // a new entry, never the last one's half-filled form.
  const close = useCallback(() => {
    setOpen(false);
    setCreatingElement(false);
    setElementId("");
    setNewElementExpires(false);
  }, []);

  const markSubmitted = useCloseOnSuccess(state, pending, close);

  // Which item the dialog is about decides whether there is an expiry field at
  // all — a date on something that does not expire is a second, invisible shelf.
  const selected = elements.find((element) => element.id === elementId) ?? null;
  const expires = creatingElement ? newElementExpires : (selected?.expireable ?? false);

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>
        {copy.newEntry}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={copy.newEntry}
        size="md"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={close}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={pending}>
              {copy.add}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />
          <input type="hidden" name="stockPlaceId" value={stockPlaceId} />

          {creatingElement ? (
            <>
              <input type="hidden" name="createElement" value="on" />
              <Field label={copy.name}>
                <Input type="text" name="name" required autoFocus />
              </Field>
              <Field label={copy.brand}>
                <Input type="text" name="brand" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={copy.unitQty}>
                  <Input type="text" inputMode="decimal" name="unitQty" defaultValue="1" required />
                </Field>
                <Field label={copy.unit}>
                  <Select name="unitId" required defaultValue="">
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
              <Checkbox
                id="add-stock-expireable"
                name="expireable"
                label={copy.expireable}
                checked={newElementExpires}
                onChange={(event) => setNewElementExpires(event.target.checked)}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreatingElement(false)}>
                {copy.pickExistingItem}
              </Button>
            </>
          ) : (
            <>
              <Field label={copy.item}>
                <Select
                  name="elementId"
                  required
                  value={elementId}
                  onChange={(event) => setElementId(event.target.value)}
                >
                  <option value="" disabled>
                    {copy.selectItem}
                  </option>
                  {elements.map((element) => (
                    <option key={element.id} value={element.id}>
                      {[element.name, element.brand].filter(Boolean).join(" - ")} ·{" "}
                      {formatPiece(element.unitQty, element.unitName)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="button" variant="ghost" size="sm" icon={<Plus />} onClick={() => setCreatingElement(true)}>
                {copy.createItemInline}
              </Button>
            </>
          )}

          <Field label={copy.initialQuantity}>
            <Input type="number" name="quantity" min={1} step={1} defaultValue={1} required />
          </Field>

          {expires ? (
            <Field label={copy.expiryDate}>
              <Input type="date" name="expireDate" />
              <span className="block text-xs text-[var(--muted)]">{copy.expiryHint}</span>
            </Field>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
