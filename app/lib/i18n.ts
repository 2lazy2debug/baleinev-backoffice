import { cookies } from "next/headers";

import { dictionaries, localeCookieName, type Locale } from "@/lib/i18n-dictionaries";

function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "fr";
}

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const candidate = cookieStore.get(localeCookieName)?.value;
  if (isLocale(candidate)) {
    return candidate;
  }
  return "en";
}

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}

export { dictionaries, localeCookieName };
export type { Locale };
