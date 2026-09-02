import Link from "next/link";
import { Settings } from "lucide-react";

import { getCurrentUserAccess, isAdmin } from "@/lib/access";
import { countryOptions } from "@/lib/countries";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

import { PageHeader, iconButtonClasses } from "@/components/ui";

import { AddressesClient } from "./client";
import CreateAddressModal from "./create-address-modal";

/**
 * The address book. Global, not edition-scoped, and open to everyone signed in
 * — the gated parts are deleting and the contact-type list, both admins only.
 */
export default async function AddressesPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const countries = countryOptions(locale);

  const [addresses, addressTypes] = await Promise.all([
    prisma.address.findMany({
      orderBy: [{ companyName: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      include: { addressType: { select: { name: true } } },
    }),
    prisma.addressType.findMany({ orderBy: { name: "asc" } }),
  ]);

  const typeOptions = addressTypes.map((addressType) => ({ id: addressType.id, name: addressType.name }));

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.addresses.title}
        title={copy.addresses.title}
        description={copy.addresses.subtitle}
        actions={
          <>
            <CreateAddressModal locale={locale} countries={countries} addressTypes={typeOptions} />
            {isAdmin(access) ? (
              <Link
                href="/addresses/settings"
                title={copy.addresses.settingsTitle}
                aria-label={copy.addresses.settingsTitle}
                className={iconButtonClasses("neutral", "md")}
              >
                <Settings />
              </Link>
            ) : null}
          </>
        }
      />

      <AddressesClient
        locale={locale}
        canDelete={isAdmin(access)}
        addressTypes={typeOptions}
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
          addressTypeId: address.addressTypeId ?? "",
          addressTypeName: address.addressType?.name ?? "",
        }))}
      />
    </div>
  );
}
