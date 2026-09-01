"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserAccess, isAdmin } from "@/lib/access";
import { rememberCity } from "@/lib/city-book";
import { prisma } from "@/lib/db";
import { DEFAULT_COUNTRY } from "@/lib/addresses";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

/**
 * The address book's writes.
 *
 * Everything here is deliberately open: any signed-in user may add and edit an
 * address, because the book is only useful when the person who has the address
 * in front of them can file it. Deleting is the one exception — an address is
 * referenced from invoices by the time it matters — and is admin-only.
 */

/**
 * What a create hands back, so a caller can select the row it just made without
 * waiting for a page refresh to tell it what the row contains.
 */
export type CreatedAddress = {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  street: string;
  country: string;
  postalCode: string;
  city: string;
  email: string;
};

export type AddressActionState = ActionState & { address?: CreatedAddress };

/** An empty optional field is stored as NULL, never as "". */
function optionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function countryFrom(formData: FormData, key = "country"): string {
  return (String(formData.get(key) ?? "").trim() || DEFAULT_COUNTRY).toUpperCase();
}

/** Stored the way the Swiss QR builder normalises it: no spaces, upper case. */
function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

function addressFieldsFrom(formData: FormData) {
  const firstName = optionalString(formData, "firstName");
  const companyName = optionalString(formData, "companyName");

  // The plan's one hard rule: a row with neither has no name to be found by.
  if (!firstName && !companyName) {
    throw new Error("An address needs a first name or a company name.");
  }

  return {
    firstName,
    lastName: optionalString(formData, "lastName"),
    companyName,
    street: optionalString(formData, "street"),
    country: countryFrom(formData),
    postalCode: optionalString(formData, "postalCode"),
    city: optionalString(formData, "city"),
    phonePrefix: optionalString(formData, "phonePrefix"),
    phoneNumber: optionalString(formData, "phoneNumber"),
    email: optionalString(formData, "email"),
    note: optionalString(formData, "note"),
  };
}

function bankAccountFieldsFrom(formData: FormData) {
  return {
    displayName: getRequiredString(formData, "displayName"),
    street: optionalString(formData, "street"),
    country: countryFrom(formData),
    postalCode: getRequiredString(formData, "postalCode"),
    city: getRequiredString(formData, "city"),
    iban: normalizeIban(getRequiredString(formData, "iban")),
  };
}

/** Every screen that reads addresses, refreshed together. */
function revalidateAddress(addressId?: string) {
  revalidatePath("/addresses");
  revalidatePath("/invoices");
  if (addressId) {
    revalidatePath(`/addresses/${addressId}`);
  }
}

export async function createAddressAction(
  _prevState: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  try {
    await getCurrentUserAccess();
    const data = addressFieldsFrom(formData);

    const address = await prisma.address.create({ data });
    await rememberCity(data.country, data.postalCode, data.city);

    revalidateAddress();
    return {
      error: null,
      address: {
        id: address.id,
        firstName: address.firstName ?? "",
        lastName: address.lastName ?? "",
        companyName: address.companyName ?? "",
        street: address.street ?? "",
        country: address.country,
        postalCode: address.postalCode ?? "",
        city: address.city ?? "",
        email: address.email ?? "",
      },
    };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateAddressAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await getCurrentUserAccess();
    const addressId = getRequiredString(formData, "addressId");
    const data = addressFieldsFrom(formData);

    await prisma.address.update({ where: { id: addressId }, data });
    await rememberCity(data.country, data.postalCode, data.city);

    revalidateAddress(addressId);
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteAddressAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();

    if (!isAdmin(access)) {
      throw new Error("Only an admin can delete an address.");
    }

    const addressId = getRequiredString(formData, "addressId");
    await prisma.address.delete({ where: { id: addressId } });

    revalidateAddress();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function createAddressBankAccountAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await getCurrentUserAccess();
    const addressId = getRequiredString(formData, "addressId");
    const data = bankAccountFieldsFrom(formData);

    await prisma.addressBankAccount.create({ data: { ...data, addressId } });
    await rememberCity(data.country, data.postalCode, data.city);

    revalidateAddress(addressId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateAddressBankAccountAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await getCurrentUserAccess();
    const bankAccountId = getRequiredString(formData, "bankAccountId");
    const data = bankAccountFieldsFrom(formData);

    const bankAccount = await prisma.addressBankAccount.update({
      where: { id: bankAccountId },
      data,
      select: { addressId: true },
    });
    await rememberCity(data.country, data.postalCode, data.city);

    revalidateAddress(bankAccount.addressId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteAddressBankAccountAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await getCurrentUserAccess();
    const bankAccountId = getRequiredString(formData, "bankAccountId");

    const bankAccount = await prisma.addressBankAccount.delete({
      where: { id: bankAccountId },
      select: { addressId: true },
    });

    revalidateAddress(bankAccount.addressId);
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
