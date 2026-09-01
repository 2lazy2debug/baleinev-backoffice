import { notFound } from "next/navigation";

import { getCurrentUserAccess, isAdmin } from "@/lib/access";
import { countryOptions } from "@/lib/countries";
import { prisma } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

import { AddressDetailClient } from "./client";

export default async function AddressDetailPage({
  params,
}: {
  params: Promise<{ addressId: string }>;
}) {
  const access = await getCurrentUserAccess();
  const { addressId } = await params;
  const locale = await getLocale();
  const countries = countryOptions(locale);

  const address = await prisma.address.findUnique({
    where: { id: addressId },
    include: { bankAccounts: { orderBy: { displayName: "asc" } } },
  });

  if (!address) {
    notFound();
  }

  return (
    <AddressDetailClient
      locale={locale}
      countries={countries}
      canDelete={isAdmin(access)}
      address={{
        id: address.id,
        firstName: address.firstName ?? "",
        lastName: address.lastName ?? "",
        companyName: address.companyName ?? "",
        street: address.street ?? "",
        country: address.country,
        postalCode: address.postalCode ?? "",
        city: address.city ?? "",
        phonePrefix: address.phonePrefix ?? "",
        phoneNumber: address.phoneNumber ?? "",
        email: address.email ?? "",
        note: address.note ?? "",
      }}
      bankAccounts={address.bankAccounts.map((bankAccount) => ({
        id: bankAccount.id,
        displayName: bankAccount.displayName,
        street: bankAccount.street ?? "",
        country: bankAccount.country,
        postalCode: bankAccount.postalCode,
        city: bankAccount.city,
        iban: bankAccount.iban,
      }))}
    />
  );
}
