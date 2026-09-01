"use client";

import { useActionState, useState } from "react";
import { Plus, Ruler } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { createStockPlaceAction, createStockUnitAction } from "../actions";

type Props = {
  locale: Locale;
};

/**
 * The two things this screen creates, both the way everything else in the app
 * creates: a button in the header and a dialog behind it.
 */
export function StockSettingsCreateButtons({ locale }: Props) {
  const copy = dictionaries[locale].stock;
  const shellCopy = dictionaries[locale].shell;

  const [placeOpen, setPlaceOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);

  const [placeState, placeFormAction, placePending] = useActionState(createStockPlaceAction, initialActionState);
  const [unitState, unitFormAction, unitPending] = useActionState(createStockUnitAction, initialActionState);

  const markPlaceSubmitted = useCloseOnSuccess(placeState, placePending, () => setPlaceOpen(false));
  const markUnitSubmitted = useCloseOnSuccess(unitState, unitPending, () => setUnitOpen(false));

  return (
    <>
      <Button type="button" variant="secondary" icon={<Ruler />} compactOnMobile onClick={() => setUnitOpen(true)}>
        {copy.addUnit}
      </Button>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setPlaceOpen(true)}>
        {copy.addPlace}
      </Button>

      <Modal
        open={placeOpen}
        onClose={() => setPlaceOpen(false)}
        title={copy.createPlace}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setPlaceOpen(false)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form="create-stock-place-form" variant="primary" disabled={placePending}>
              {copy.addPlace}
            </Button>
          </>
        }
      >
        <form id="create-stock-place-form" action={placeFormAction} onSubmit={markPlaceSubmitted} className="space-y-4">
          <FormError message={placeState.error} />
          <Field label={copy.name}>
            <Input type="text" name="name" required autoFocus />
          </Field>
        </form>
      </Modal>

      <Modal
        open={unitOpen}
        onClose={() => setUnitOpen(false)}
        title={copy.createUnit}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setUnitOpen(false)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form="create-stock-unit-form" variant="primary" disabled={unitPending}>
              {copy.addUnit}
            </Button>
          </>
        }
      >
        <form id="create-stock-unit-form" action={unitFormAction} onSubmit={markUnitSubmitted} className="space-y-4">
          <FormError message={unitState.error} />
          <Field label={copy.name}>
            <Input type="text" name="name" required autoFocus />
          </Field>
          <p className="text-xs text-[var(--muted)]">{copy.unitsHint}</p>
        </form>
      </Modal>
    </>
  );
}
