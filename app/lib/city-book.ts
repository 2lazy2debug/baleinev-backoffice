import { prisma } from "@/lib/db";

/**
 * Files a postal code / locality pair into the City table.
 *
 * The seeded list is Swiss and finite; the address book is neither. Every pair
 * a user actually saves is remembered, so the second person to write to a
 * foreign supplier gets the proposal the first one had to type out. Cities are
 * proposals throughout — nothing here ever constrains what an address stores.
 */
export async function rememberCity(country: string, postalCode?: string | null, name?: string | null) {
  const trimmedCode = postalCode?.trim();
  const trimmedName = name?.trim();

  if (!trimmedCode || !trimmedName) {
    return;
  }

  await prisma.city.upsert({
    where: {
      country_postalCode_name: { country, postalCode: trimmedCode, name: trimmedName },
    },
    update: {},
    create: { country, postalCode: trimmedCode, name: trimmedName },
  });
}
