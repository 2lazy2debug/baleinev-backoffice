import { getCurrentUserAccess, isAdmin } from "@/lib/access";
import { countryOptions } from "@/lib/countries";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

import { PageHeader } from "@/components/ui";

import { AddressesClient } from "./client";
import CreateAddressModal from "./create-address-modal";

/**
 * The address book. Global, not edition-scoped, and open to everyone signed in
 * — the only gated action is deleting, which is admins only.
 */
export default async function AddressesPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const countries = countryOptions(locale);

  const addresses = await prisma.address.findMany({
    orderBy: [{ companyName: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.addresses.title}
        title={copy.addresses.title}
        description={copy.addresses.subtitle}
        actions={<CreateAddressModal locale={locale} countries={countries} />}
      />

      <AddressesClient
        locale={locale}
        canDelete={isAdmin(access)}
        addresses={addresses.map((address) => ({
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
        }))}
      />
    </div>
  );
}
