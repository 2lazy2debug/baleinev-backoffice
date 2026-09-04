"use client";

import { useActionState, useState } from "react";
import { Plus, Replace, Ruler } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { createStockPlaceAction, createStockUnitAction, createStockUnitConversionAction } from "../actions";

export type UnitOption = {
  id: string;
  name: string;
};

type Props = {
  locale: Locale;
  /** The units a conversion can be filed between. */
  units: UnitOption[];
};

/**
 * The three things this screen creates, all the way everything else in the app
 * creates: a button in the header and a dialog behind it.
 *
 * A conversion needs two units to sit between, so its button waits until there
 * are two — a disabled button that says what is missing beats one that opens a
 * dialog with nothing to pick.
 */
export function StockSettingsCreateButtons({ locale, units }: Props) {
  const copy = dictionaries[locale].stock;
  const shellCopy = dictionaries[locale].shell;

  const [placeOpen, setPlaceOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);

  const [placeState, placeFormAction, placePending] = useActionState(createStockPlaceAction, initialActionState);
  const [unitState, unitFormAction, unitPending] = useActionState(createStockUnitAction, initialActionState);

  const [conversionState, conversionFormAction, conversionPending] = useActionState(
    createStockUnitConversionAction,
    initialActionState,
  );

  const markPlaceSubmitted = useCloseOnSuccess(placeState, placePending, () => setPlaceOpen(false));
  const markUnitSubmitted = useCloseOnSuccess(unitState, unitPending, () => setUnitOpen(false));
  const markConversionSubmitted = useCloseOnSuccess(conversionState, conversionPending, () =>
    setConversionOpen(false),
  );

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        icon={<Replace />}
        compactOnMobile
        disabled={units.length < 2}
        onClick={() => setConversionOpen(true)}
      >
        {copy.addConversion}
      </Button>
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

      <Modal
        open={conversionOpen}
        onClose={() => setConversionOpen(false)}
        title={copy.createConversion}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConversionOpen(false)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form="create-stock-conversion-form" variant="primary" disabled={conversionPending}>
              {copy.addConversion}
            </Button>
          </>
        }
      >
        <form
          id="create-stock-conversion-form"
          action={conversionFormAction}
          onSubmit={markConversionSubmitted}
          className="space-y-4"
        >
          <FormError message={conversionState.error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={copy.convertFrom}>
              <Select name="fromUnitId" required defaultValue="">
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
            <Field label={copy.convertTo}>
              <Select name="toUnitId" required defaultValue="">
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
          <Field label={copy.factor}>
            <Input type="text" inputMode="decimal" name="factor" placeholder="0.001" required />
            <span className="block text-xs text-[var(--muted)]">{copy.factorHint}</span>
          </Field>
        </form>
      </Modal>
    </>
  );
}
