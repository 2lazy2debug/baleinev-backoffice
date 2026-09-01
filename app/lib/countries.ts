import { getCountries, getCountryCallingCode } from "libphonenumber-js";

import type { Locale } from "./i18n-dictionaries";

/**
 * Countries and their international dialling prefixes.
 *
 * Both lists come from libphonenumber-js's metadata and `Intl.DisplayNames`,
 * so nothing here is a hand-maintained table that silently goes stale: a
 * country code the library knows about is a country this app offers, named in
 * the reader's own language.
 *
 * The lists are built on the server and handed to the forms as props — the
 * phone metadata is ~150 KB and has no business in a browser bundle that only
 * needs "+41".
 */
export type CountryOption = {
  /** ISO 3166-1 alpha-2, as stored on Address / AddressBankAccount. */
  code: string;
  name: string;
  /** International dialling prefix, with its "+" — "+41". */
  callingCode: string;
};

const cache = new Map<Locale, CountryOption[]>();

export function countryOptions(locale: Locale): CountryOption[] {
  const cached = cache.get(locale);
  if (cached) {
    return cached;
  }

  const names = new Intl.DisplayNames([locale], { type: "region" });
  const collator = new Intl.Collator(locale);

  const options = getCountries()
    .map((code) => ({
      code,
      name: names.of(code) ?? code,
      callingCode: `+${getCountryCallingCode(code)}`,
    }))
    .sort((a, b) => collator.compare(a.name, b.name));

  cache.set(locale, options);
  return options;
}

/** The country's own name, for read-only display. Falls back to the raw code. */
export function countryName(code: string, locale: Locale): string {
  return countryOptions(locale).find((option) => option.code === code)?.name ?? code;
}
