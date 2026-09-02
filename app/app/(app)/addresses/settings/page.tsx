import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";

import { PageHeader, buttonClasses, compactOnMobileWidths } from "@/components/ui";

import { AddressSettingsClient } from "./client";
import { AddressSettingsCreateButton } from "./create-button";

/** The address book's configuration: the contact types. Admins only. */
export default async function AddressSettingsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const addressTypes = await prisma.addressType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { addresses: true } } },
  });

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.addresses.title}
        title={copy.addresses.settingsTitle}
        description={copy.addresses.settingsSubtitle}
        actions={
          <>
            <Link
              href="/addresses"
              title={copy.addresses.backToList}
              aria-label={copy.addresses.backToList}
              className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
            >
              <ArrowLeft />
              <span className="hidden lg:inline">{copy.addresses.backToList}</span>
            </Link>
            <AddressSettingsCreateButton locale={locale} />
          </>
        }
      />

      <AddressSettingsClient
        locale={locale}
        addressTypes={addressTypes.map((addressType) => ({
          id: addressType.id,
          name: addressType.name,
          addressCount: addressType._count.addresses,
        }))}
      />
    </div>
  );
}
