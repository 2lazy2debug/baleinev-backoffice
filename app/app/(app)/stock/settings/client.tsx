"use client";

import { useActionState, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  Field,
  IconButton,
  Input,
  Modal,
  Panel,
  SectionTitle,
  Select,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

import { deleteStockPlaceAction, renameStockPlaceAction, renameStockUnitAction } from "../actions";

export type PlaceRow = {
  id: string;
  name: string;
  itemCount: number;
};

export type UnitRow = {
  id: string;
  name: string;
  /** Whether any item is measured in it — which is what makes a rename visible. */
  inUse: boolean;
};

type Props = {
  locale: Locale;
  places: PlaceRow[];
  units: UnitRow[];
};

const DELETE_FORM_ID = "delete-stock-place-form";

/**
 * The two lists behind the stock app: the places things sit in, and the units
 * they are measured in.
 *
 * Deleting a place is the only complicated one, and it is complicated on
 * purpose: nothing may be left without a stock, so a place with contents asks
 * where they go before it will go itself.
 */
export function StockSettingsClient({ locale, places, units }: Props) {
  const copy = dictionaries[locale].stock;
  const shellCopy = dictionaries[locale].shell;

  // One "which row is unlocked" state per list — a rename is the same gesture as
  // the quantity edit on the stock screen: unlock, type, lock.
  const [editingPlace, setEditingPlace] = useState<{ id: string; name: string } | null>(null);
  const [editingUnit, setEditingUnit] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<PlaceRow | null>(null);

  async function savePlace(previous: ActionState): Promise<ActionState> {
    if (!editingPlace) {
      return { error: null };
    }

    const formData = new FormData();
    formData.set("stockPlaceId", editingPlace.id);
    formData.set("name", editingPlace.name);

    const result = await renameStockPlaceAction(previous, formData);
    if (!result.error) {
      setEditingPlace(null);
    }
    return result;
  }

  async function saveUnit(previous: ActionState): Promise<ActionState> {
    if (!editingUnit) {
      return { error: null };
    }

    const formData = new FormData();
    formData.set("unitId", editingUnit.id);
    formData.set("name", editingUnit.name);

    const result = await renameStockUnitAction(previous, formData);
    if (!result.error) {
      setEditingUnit(null);
    }
    return result;
  }

  const [placeState, placeFormAction, isSavingPlace] = useActionState(savePlace, initialActionState);
  const [unitState, unitFormAction, isSavingUnit] = useActionState(saveUnit, initialActionState);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteStockPlaceAction, initialActionState);
  const markDeleteSubmitted = useCloseOnSuccess(deleteState, isDeleting, () => setDeleting(null));

  // Where the contents of the place being deleted can go. Empty means this is
  // the last stock standing, which is the one case with no answer.
  const destinations = places.filter((place) => place.id !== deleting?.id);
  const needsDestination = (deleting?.itemCount ?? 0) > 0;
  const isBlocked = needsDestination && destinations.length === 0;

  return (
    <>
      <CardGrid>
        <Card span="1/2" className="space-y-4">
          <SectionTitle>{copy.places}</SectionTitle>
          <FormError message={placeState.error} />

          <div className="flex flex-col gap-2">
            {places.map((place) => {
              const editing = editingPlace?.id === place.id ? editingPlace : null;

              return (
                <Panel key={place.id} nested as="div" className="flex items-center gap-2 p-2">
                  {editing ? (
                    <Input
                      size="sm"
                      value={editing.name}
                      autoFocus
                      onChange={(event) => setEditingPlace({ id: place.id, name: event.target.value })}
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{place.name}</p>
                      <p className="text-2xs text-[var(--muted)]">
                        {place.itemCount === 0 ? copy.emptyPlace : `${place.itemCount} ${copy.entries}`}
                      </p>
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-2">
                    {editing ? (
                      <>
                        <IconButton
                          tone="save"
                          label={shellCopy.save}
                          disabled={isSavingPlace}
                          onClick={() => placeFormAction()}
                        >
                          <Check />
                        </IconButton>
                        <IconButton tone="neutral" label={shellCopy.cancel} onClick={() => setEditingPlace(null)}>
                          <X />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton
                          tone="accent"
                          label={copy.rename}
                          onClick={() => setEditingPlace({ id: place.id, name: place.name })}
                        >
                          <Pencil />
                        </IconButton>
                        <IconButton tone="delete" label={copy.deletePlace} onClick={() => setDeleting(place)}>
                          <Trash2 />
                        </IconButton>
                      </>
                    )}
                  </div>
                </Panel>
              );
            })}

            {places.length === 0 ? <p className="text-sm text-[var(--muted)]">{copy.placesEmpty}</p> : null}
          </div>
        </Card>

        <Card span="1/2" className="space-y-4">
          <SectionTitle>{copy.units}</SectionTitle>
          <p className="text-sm text-[var(--muted)]">{copy.unitsHint}</p>
          <FormError message={unitState.error} />

          <div className="flex flex-col gap-2">
            {units.map((unit) => {
              const editing = editingUnit?.id === unit.id ? editingUnit : null;

              return (
                <Panel key={unit.id} nested as="div" className="flex items-center gap-2 p-2">
                  {editing ? (
                    <Input
                      size="sm"
                      value={editing.name}
                      autoFocus
                      onChange={(event) => setEditingUnit({ id: unit.id, name: event.target.value })}
                    />
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <p className="truncate text-sm font-medium">{unit.name}</p>
                      {unit.inUse ? <Badge tone="neutral">{copy.unitInUse}</Badge> : null}
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-2">
                    {editing ? (
                      <>
                        <IconButton
                          tone="save"
                          label={shellCopy.save}
                          disabled={isSavingUnit}
                          onClick={() => unitFormAction()}
                        >
                          <Check />
                        </IconButton>
                        <IconButton tone="neutral" label={shellCopy.cancel} onClick={() => setEditingUnit(null)}>
                          <X />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton
                        tone="accent"
                        label={copy.rename}
                        onClick={() => setEditingUnit({ id: unit.id, name: unit.name })}
                      >
                        <Pencil />
                      </IconButton>
                    )}
                  </div>
                </Panel>
              );
            })}

            {units.length === 0 ? <p className="text-sm text-[var(--muted)]">{copy.unitsEmpty}</p> : null}
          </div>
        </Card>
      </CardGrid>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={copy.deletePlace}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
              {shellCopy.cancel}
            </Button>
            <Button
              type="submit"
              form={DELETE_FORM_ID}
              variant="destructive"
              disabled={isDeleting || isBlocked}
            >
              {copy.delete}
            </Button>
          </>
        }
      >
        <form id={DELETE_FORM_ID} action={deleteFormAction} onSubmit={markDeleteSubmitted} className="space-y-4">
          <FormError message={deleteState.error} />
          <input type="hidden" name="stockPlaceId" value={deleting?.id ?? ""} />

          <p className="text-sm font-medium">{deleting?.name}</p>

          {isBlocked ? (
            <p className="text-sm text-[var(--muted)]">{copy.deletePlaceLast}</p>
          ) : needsDestination ? (
            <>
              <p className="text-sm text-[var(--muted)]">{copy.deletePlaceMove}</p>
              <Field label={copy.moveTo}>
                <Select name="moveToId" required defaultValue="">
                  <option value="" disabled>
                    {copy.pickPlace}
                  </option>
                  {destinations.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">{copy.deletePlaceEmpty}</p>
          )}
        </form>
      </Modal>
    </>
  );
}
