"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import type { AddressTypeOption } from "@/components/address-fields";
import { CreateAddressModal } from "@/components/create-address-modal";
import { Button } from "@/components/ui";
import type { CountryOption } from "@/lib/countries";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

type Props = {
  locale: Locale;
  countries: CountryOption[];
  addressTypes: AddressTypeOption[];
};

/** The address book's own trigger for the shared create dialog. */
export default function AddressesCreateButton({ locale, countries, addressTypes }: Props) {
  const copy = dictionaries[locale].addresses;
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>
        {copy.add}
      </Button>
      <CreateAddressModal
        locale={locale}
        countries={countries}
        addressTypes={addressTypes}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
