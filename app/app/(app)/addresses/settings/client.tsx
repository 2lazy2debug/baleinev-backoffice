"use client";

import { useActionState, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Card, CardGrid, IconButton, Input, Modal, Panel, SectionTitle } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

import { deleteAddressTypeAction, renameAddressTypeAction } from "../actions";

export type AddressTypeRow = {
  id: string;
  name: string;
  /** How many addresses are filed under it — what a delete is about to undo. */
  addressCount: number;
};

type Props = {
  locale: Locale;
  addressTypes: AddressTypeRow[];
};

const DELETE_FORM_ID = "delete-address-type-form";

/**
 * The contact types, and nothing else — the address book has one list to
 * configure where the stock app has two.
 *
 * Renaming is the same unlock/type/lock gesture as everywhere else. Deleting is
 * allowed even when the type is in use, because the field is optional to begin
 * with: the addresses keep every other column and simply come back untyped.
 * The dialog says how many that is before it happens.
 */
export function AddressSettingsClient({ locale, addressTypes }: Props) {
  const copy = dictionaries[locale].addresses;
  const shellCopy = dictionaries[locale].shell;

  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<AddressTypeRow | null>(null);

  async function saveName(previous: ActionState): Promise<ActionState> {
    if (!editing) {
      return { error: null };
    }

    const formData = new FormData();
    formData.set("addressTypeId", editing.id);
    formData.set("name", editing.name);

    const result = await renameAddressTypeAction(previous, formData);
    if (!result.error) {
      setEditing(null);
    }
    return result;
  }

  const [renameState, renameFormAction, isRenaming] = useActionState(saveName, initialActionState);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteAddressTypeAction, initialActionState);
  const markDeleteSubmitted = useCloseOnSuccess(deleteState, isDeleting, () => setDeleting(null));

  return (
    <>
      <CardGrid>
        <Card span="1/2" className="space-y-4">
          <SectionTitle>{copy.contactTypes}</SectionTitle>
          <FormError message={renameState.error} />

          <div className="flex flex-col gap-2">
            {addressTypes.map((addressType) => {
              const isEditing = editing?.id === addressType.id ? editing : null;

              return (
                <Panel key={addressType.id} nested as="div" className="flex items-center gap-2 p-2">
                  {isEditing ? (
                    <Input
                      type="text"
                      size="sm"
                      value={isEditing.name}
                      autoFocus
                      onChange={(event) => setEditing({ id: addressType.id, name: event.target.value })}
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{addressType.name}</p>
                      <p className="text-2xs text-[var(--muted)]">
                        {addressType.addressCount === 0
                          ? copy.noAddressFiled
                          : `${addressType.addressCount} ${copy.addressesFiled}`}
                      </p>
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-2">
                    {isEditing ? (
                      <>
                        <IconButton
                          tone="save"
                          label={shellCopy.save}
                          disabled={isRenaming}
                          onClick={() => renameFormAction()}
                        >
                          <Check />
                        </IconButton>
                        <IconButton tone="neutral" label={shellCopy.cancel} onClick={() => setEditing(null)}>
                          <X />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton
                          tone="accent"
                          label={copy.rename}
                          onClick={() => setEditing({ id: addressType.id, name: addressType.name })}
                        >
                          <Pencil />
                        </IconButton>
                        <IconButton
                          tone="delete"
                          label={copy.deleteContactType}
                          onClick={() => setDeleting(addressType)}
                        >
                          <Trash2 />
                        </IconButton>
                      </>
                    )}
                  </div>
                </Panel>
              );
            })}

            {addressTypes.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{copy.contactTypesEmpty}</p>
            ) : null}
          </div>
        </Card>
      </CardGrid>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={copy.deleteContactType}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form={DELETE_FORM_ID} variant="destructive" disabled={isDeleting}>
              {copy.delete}
            </Button>
          </>
        }
      >
        <form id={DELETE_FORM_ID} action={deleteFormAction} onSubmit={markDeleteSubmitted} className="space-y-4">
          <FormError message={deleteState.error} />
          <input type="hidden" name="addressTypeId" value={deleting?.id ?? ""} />

          <p className="text-sm font-medium">{deleting?.name}</p>
          <p className="text-sm text-[var(--muted)]">
            {(deleting?.addressCount ?? 0) === 0
              ? copy.deleteContactTypeEmpty
              : `${deleting?.addressCount} ${copy.addressesFiled} — ${copy.deleteContactTypeUsed}`}
          </p>
        </form>
      </Modal>
    </>
  );
}
