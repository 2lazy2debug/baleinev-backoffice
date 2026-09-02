"use client";

import { useCallback, useMemo } from "react";

import { Field, Input, Select, Suggest, type SuggestOption, Textarea } from "@/components/ui";
import { DEFAULT_COUNTRY } from "@/lib/addresses";
import type { CountryOption } from "@/lib/countries";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

/**
 * The fields an address and a bank account are made of, in one place.
 *
 * Three screens write these: the address book's create modal and detail form,
 * and the invoice builder's on-the-fly create. They render the same controls,
 * in the same order, with the same postal-code behaviour — so the fields live
 * here and the screens supply nothing but a <form> around them and a submit
 * button. Every control carries its own `name`, so the surrounding form posts
 * straight to a server action with no serialisation of its own.
 */

type CityPair = { postalCode: string; name: string };

async function fetchCities(country: string, params: { postalCode?: string; name?: string }): Promise<CityPair[]> {
  const query = new URLSearchParams({ country });
  if (params.postalCode) query.set("postalCode", params.postalCode);
  if (params.name) query.set("name", params.name);

  const response = await fetch(`/api/cities?${query.toString()}`);
  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as { cities?: CityPair[] };
  return data.cities ?? [];
}

type PostalValue = { country: string; postalCode: string; city: string };

type PostalFieldsProps = {
  locale: Locale;
  countries: CountryOption[];
  value: PostalValue;
  onChange: (patch: Partial<PostalValue>) => void;
  /** Bank accounts require the pair; an address does not. */
  required?: boolean;
};

/**
 * Country, NPA and locality — the three that only make sense together.
 *
 * Typing a code proposes the localities that share it; typing a locality
 * proposes the codes. Picking either fills the other, and neither is binding:
 * both are plain text fields with a list attached.
 */
export function PostalFields({ locale, countries, value, onChange, required = false }: PostalFieldsProps) {
  const copy = dictionaries[locale].addresses;

  const loadPostalCodes = useCallback(
    async (query: string): Promise<SuggestOption[]> => {
      const cities = await fetchCities(value.country, { postalCode: query });
      return cities.map((city) => ({ value: city.postalCode, label: city.postalCode, hint: city.name }));
    },
    [value.country],
  );

  const loadCityNames = useCallback(
    async (query: string): Promise<SuggestOption[]> => {
      const cities = await fetchCities(value.country, { name: query });
      return cities.map((city) => ({ value: city.name, label: city.name, hint: city.postalCode }));
    },
    [value.country],
  );

  return (
    <>
      <Field label={copy.country}>
        <Select
          name="country"
          value={value.country}
          onChange={(event) => onChange({ country: event.target.value })}
          required
        >
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <Field label={copy.postalCode}>
          <Suggest
            name="postalCode"
            value={value.postalCode}
            onValueChange={(postalCode) => onChange({ postalCode })}
            loadOptions={loadPostalCodes}
            onPick={(option) => onChange({ postalCode: option.value, city: option.hint ?? "" })}
            required={required}
          />
        </Field>
        <Field label={copy.city}>
          <Suggest
            name="city"
            value={value.city}
            onValueChange={(city) => onChange({ city })}
            loadOptions={loadCityNames}
            onPick={(option) => onChange({ city: option.value, postalCode: option.hint ?? "" })}
            required={required}
          />
        </Field>
      </div>
    </>
  );
}

/** One row of the contact-type table, as a form needs it. */
export type AddressTypeOption = { id: string; name: string };

export type AddressDraft = {
  firstName: string;
  lastName: string;
  companyName: string;
  street: string;
  country: string;
  postalCode: string;
  city: string;
  phonePrefix: string;
  phoneNumber: string;
  email: string;
  note: string;
  /** "" is "no type" — the blank option every contact-type dropdown carries. */
  addressTypeId: string;
};

/** A blank row, with the dialling prefix already matching the default country. */
export function emptyAddressDraft(countries: CountryOption[]): AddressDraft {
  return {
    firstName: "",
    lastName: "",
    companyName: "",
    street: "",
    country: DEFAULT_COUNTRY,
    postalCode: "",
    city: "",
    phonePrefix: countries.find((country) => country.code === DEFAULT_COUNTRY)?.callingCode ?? "",
    phoneNumber: "",
    email: "",
    note: "",
    addressTypeId: "",
  };
}

type AddressFieldsProps = {
  locale: Locale;
  countries: CountryOption[];
  /** What an address can be filed under. Admins edit the list in address settings. */
  addressTypes: AddressTypeOption[];
  value: AddressDraft;
  onChange: (patch: Partial<AddressDraft>) => void;
};

export function AddressFields({ locale, countries, addressTypes, value, onChange }: AddressFieldsProps) {
  const copy = dictionaries[locale].addresses;

  // One row per country, not one per prefix: several countries share "+1", and
  // the country's own name is what a reader is actually looking for.
  const prefixOptions = useMemo<SuggestOption[]>(
    () => countries.map((country) => ({ value: country.callingCode, label: country.callingCode, hint: country.name })),
    [countries],
  );

  return (
    <div className="space-y-4">
      <Field label={copy.contactType}>
        <Select
          name="addressTypeId"
          value={value.addressTypeId}
          onChange={(event) => onChange({ addressTypeId: event.target.value })}
        >
          {/* Blank is an answer, not a prompt: plenty of the book is neither
              sponsor nor supplier. */}
          <option value="">{copy.noContactType}</option>
          {addressTypes.map((addressType) => (
            <option key={addressType.id} value={addressType.id}>
              {addressType.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.firstName}>
          <Input
            type="text"
            name="firstName"
            value={value.firstName}
            onChange={(event) => onChange({ firstName: event.target.value })}
          />
        </Field>
        <Field label={copy.lastName}>
          <Input
            type="text"
            name="lastName"
            value={value.lastName}
            onChange={(event) => onChange({ lastName: event.target.value })}
          />
        </Field>
      </div>

      <Field label={copy.companyName}>
        <Input
          type="text"
          name="companyName"
          value={value.companyName}
          onChange={(event) => onChange({ companyName: event.target.value })}
        />
      </Field>

      <Field label={copy.street}>
        <Input
          type="text"
          name="street"
          value={value.street}
          onChange={(event) => onChange({ street: event.target.value })}
        />
      </Field>

      <PostalFields
        locale={locale}
        countries={countries}
        value={{ country: value.country, postalCode: value.postalCode, city: value.city }}
        onChange={onChange}
      />

      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <Field label={copy.phonePrefix}>
          <Suggest
            name="phonePrefix"
            value={value.phonePrefix}
            onValueChange={(phonePrefix) => onChange({ phonePrefix })}
            options={prefixOptions}
            openOnFocus
            inputMode="tel"
          />
        </Field>
        <Field label={copy.phoneNumber}>
          <Input
            type="tel"
            name="phoneNumber"
            value={value.phoneNumber}
            onChange={(event) => onChange({ phoneNumber: event.target.value })}
          />
        </Field>
      </div>

      <Field label={copy.email}>
        <Input
          type="email"
          name="email"
          value={value.email}
          onChange={(event) => onChange({ email: event.target.value })}
        />
      </Field>

      <Field label={copy.note}>
        <Textarea
          name="note"
          rows={3}
          value={value.note}
          onChange={(event) => onChange({ note: event.target.value })}
        />
      </Field>
    </div>
  );
}

export type BankAccountDraft = {
  displayName: string;
  street: string;
  country: string;
  postalCode: string;
  city: string;
  iban: string;
};

export function emptyBankAccountDraft(): BankAccountDraft {
  return {
    displayName: "",
    street: "",
    country: DEFAULT_COUNTRY,
    postalCode: "",
    city: "",
    iban: "",
  };
}

type BankAccountFieldsProps = {
  locale: Locale;
  countries: CountryOption[];
  value: BankAccountDraft;
  onChange: (patch: Partial<BankAccountDraft>) => void;
};

export function BankAccountFields({ locale, countries, value, onChange }: BankAccountFieldsProps) {
  const copy = dictionaries[locale].addresses;

  return (
    <div className="space-y-4">
      <Field label={copy.displayName}>
        <Input
          type="text"
          name="displayName"
          value={value.displayName}
          onChange={(event) => onChange({ displayName: event.target.value })}
          required
        />
      </Field>

      <Field label={copy.iban}>
        <Input
          type="text"
          name="iban"
          value={value.iban}
          onChange={(event) => onChange({ iban: event.target.value })}
          className="uppercase"
          placeholder="CH00 0000 0000 0000 0000 0"
          required
        />
      </Field>

      <Field label={copy.street}>
        <Input
          type="text"
          name="street"
          value={value.street}
          onChange={(event) => onChange({ street: event.target.value })}
        />
      </Field>

      <PostalFields
        locale={locale}
        countries={countries}
        value={{ country: value.country, postalCode: value.postalCode, city: value.city }}
        onChange={onChange}
        required
      />
    </div>
  );
}
