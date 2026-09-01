"use client";

import { useActionState, useState } from "react";

import { AddressFields, type AddressDraft, emptyAddressDraft } from "@/components/address-fields";
import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Modal } from "@/components/ui";
import { createAddressAction, type AddressActionState, type CreatedAddress } from "@/app/(app)/addresses/actions";
import type { CountryOption } from "@/lib/countries";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

type Props = {
  locale: Locale;
  countries: CountryOption[];
  open: boolean;
  onClose: () => void;
  /**
   * The address that was just written, not merely the fact that one was. The
   * invoice builder selects it the moment it exists, which it cannot do from an
   * id alone without waiting for a refresh it did not ask for.
   */
  onCreated?: (address: CreatedAddress) => void;
};

const FORM_ID = "create-address-form";

/**
 * The one "new address" dialog, controlled by whoever opens it.
 *
 * The address book opens it from its page header; the invoice builder opens it
 * mid-invoice, from beside the recipient fields. Same fields, same action, same
 * validation — the only thing that differs is who owns the trigger.
 */
export function CreateAddressModal({ locale, countries, open, onClose, onCreated }: Props) {
  const copy = dictionaries[locale];
  const [draft, setDraft] = useState<AddressDraft>(() => emptyAddressDraft(countries));
  const [createState, createFormAction, isCreating] = useActionState<AddressActionState, FormData>(
    createAddressAction,
    initialActionState,
  );

  const markSubmitted = useCloseOnSuccess(createState, isCreating, () => {
    if (createState.address) {
      onCreated?.(createState.address);
    }
    setDraft(emptyAddressDraft(countries));
    onClose();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.addresses.create}
      size="lg"
      mobileFullScreen
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.shell.cancel}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={isCreating}>
            {copy.addresses.add}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} action={createFormAction} onSubmit={markSubmitted} className="space-y-4">
        <FormError message={createState.error} />
        <AddressFields
          locale={locale}
          countries={countries}
          value={draft}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        />
      </form>
    </Modal>
  );
}
