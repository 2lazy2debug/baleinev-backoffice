"use client";

import { Replace } from "lucide-react";

import { Field, Input, Menu, Select } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { convertQuantity, formatPiece } from "@/lib/stock";

export type UnitOption = {
  id: string;
  name: string;
};

/** One direction of the conversion table, as the dialogs need to read it. */
export type ConversionOption = {
  fromUnitId: string;
  toUnitId: string;
  toUnitName: string;
  factor: number;
};

type Props = {
  locale: Locale;
  units: UnitOption[];
  conversions: ConversionOption[];
  unitQty: string;
  unitId: string;
  onChange: (next: { unitQty: string; unitId: string }) => void;
};

/**
 * "One piece is" — the size and the unit, and the button that rewrites both.
 *
 * The two fields are one control: a scanner hands back a bottle as 1500 ml when
 * every shelf in the building calls it 1.5 l, and correcting that by hand means
 * retyping the number *and* changing the select, in that order, without slipping
 * a zero. The convert button does the pair in one gesture, from whatever the
 * admin filed in the conversion table.
 *
 * It only ever writes into the form. Nothing on a shelf moves, and an item saved
 * before a factor was corrected keeps the numbers it was saved with.
 */
export function UnitSizeFields({ locale, units, conversions, unitQty, unitId, onChange }: Props) {
  const copy = dictionaries[locale].stock;

  const current = units.find((unit) => unit.id === unitId) ?? null;
  const quantity = Number(unitQty.replace(",", ".").trim());
  const convertible = Number.isFinite(quantity) && quantity > 0;

  // What this unit can become, each row showing the number it would leave
  // behind — the rounding is the field's, so what is offered is what is saved.
  const options = convertible
    ? conversions
        .filter((conversion) => conversion.fromUnitId === unitId)
        .map((conversion) => ({
          value: conversion.toUnitId,
          label: conversion.toUnitName,
          hint: formatPiece(convertQuantity(quantity, conversion.factor), conversion.toUnitName),
        }))
    : [];

  function convert(toUnitId: string) {
    const conversion = conversions.find((row) => row.fromUnitId === unitId && row.toUnitId === toUnitId);

    if (!conversion) {
      return;
    }

    onChange({ unitQty: String(convertQuantity(quantity, conversion.factor)), unitId: conversion.toUnitId });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={copy.unitQty}>
        <Input
          type="text"
          inputMode="decimal"
          name="unitQty"
          value={unitQty}
          onChange={(event) => onChange({ unitQty: event.target.value, unitId })}
          required
        />
      </Field>
      <div className="flex items-end gap-2">
        <Field label={copy.unit} className="min-w-0 flex-1">
          <Select
            name="unitId"
            value={unitId}
            onChange={(event) => onChange({ unitQty, unitId: event.target.value })}
            required
          >
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
        {options.length > 0 ? (
          <Menu
            label={current ? `${copy.convert} (${current.name})` : copy.convert}
            icon={<Replace />}
            options={options}
            onSelect={convert}
          />
        ) : null}
      </div>
    </div>
  );
}
