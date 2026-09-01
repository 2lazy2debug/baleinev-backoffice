"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { CreateAddressModal } from "@/components/create-address-modal";
import { Button, Field, Suggest, type SuggestOption } from "@/components/ui";
import type { CreatedAddress } from "@/app/(app)/addresses/actions";
import { addressDisplayName, formatPostalLine } from "@/lib/addresses";
import type { CountryOption } from "@/lib/countries";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

/** Everything a document needs off an address book row. */
export type PickableAddress = CreatedAddress;

type Props = {
  locale: Locale;
  countries: CountryOption[];
  addresses: PickableAddress[];
  /** Called with the chosen row — picked from the book, or created on the spot. */
  onPick: (address: PickableAddress) => void;
  disabled?: boolean;
};

/**
 * "Use an address" — the address book, wherever a document needs a recipient.
 *
 * Typing searches the book by name, company, locality or email; picking a row
 * fills the fields underneath. The button beside it opens the same create
 * dialog the address book uses, so a supplier who is not in the book yet does
 * not send anyone to another screen mid-invoice: the new row is written, filed
 * in the book, and selected here in one step.
 */
export function AddressPicker({ locale, countries, addresses, onPick, disabled = false }: Props) {
  const copy = dictionaries[locale].addresses;
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const options = useMemo<SuggestOption[]>(
    () =>
      addresses.map((address) => ({
        value: addressDisplayName(address),
        label: addressDisplayName(address),
        hint: formatPostalLine(address.postalCode, address.city) || address.email,
      })),
    [addresses],
  );

  function selectByLabel(label: string) {
    const address = addresses.find((candidate) => addressDisplayName(candidate) === label);
    if (address) {
      onPick(address);
    }
  }

  function selectCreated(address: PickableAddress) {
    setQuery(addressDisplayName(address));
    onPick(address);
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label={copy.pickFromBook} className="min-w-0 flex-1">
          <Suggest
            value={query}
            onValueChange={setQuery}
            onPick={(option) => selectByLabel(option.value)}
            options={options}
            openOnFocus
            maxOptions={10}
            placeholder={copy.pickFromBookHint}
            disabled={disabled}
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          icon={<Plus />}
          onClick={() => setIsCreating(true)}
          disabled={disabled}
          className="w-full sm:w-auto"
        >
          {copy.create}
        </Button>
      </div>

      <CreateAddressModal
        locale={locale}
        countries={countries}
        open={isCreating}
        onClose={() => setIsCreating(false)}
        onCreated={selectCreated}
      />
    </>
  );
}
