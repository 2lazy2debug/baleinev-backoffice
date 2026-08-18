"use server";

import { revalidatePath } from "next/cache";
import { MoneyAccountType } from "@prisma/client";

import { requireMoneyAccountManager } from "@/lib/access";
import { prisma } from "@/lib/db";
import { requireWritableEdition, resolveWritableEditionId } from "@/lib/edition-context";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

function parseOpeningBalance(formData: FormData) {
  const raw = String(formData.get("openingBalance") ?? "0").replace(",", ".").trim();
  const value = Number(raw || "0");

  if (!Number.isFinite(value)) {
    throw new Error("Opening balance must be a valid number.");
  }

  return value;
}

function getOptionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function parseOptionalCountry(formData: FormData) {
  const value = String(formData.get("beneficiaryCountry") ?? "CH").trim().toUpperCase();
  return value || "CH";
}

async function requireWritableMoneyAccount(moneyAccountId: string) {
  const account = await prisma.moneyAccount.findUnique({
    where: { id: moneyAccountId },
    select: { editionId: true },
  });

  if (!account) {
    throw new Error("Money account not found.");
  }

  await requireWritableEdition(account.editionId);
}

export async function createMoneyAccountAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireMoneyAccountManager();
    const editionId = await resolveWritableEditionId();
    const name = getRequiredString(formData, "name");
    const type = getRequiredString(formData, "type") as MoneyAccountType;
    const openingBalance = parseOpeningBalance(formData);

    await prisma.moneyAccount.create({
      data: {
        editionId,
        name,
        type,
        openingBalance,
        iban: getOptionalString(formData, "iban"),
        beneficiaryName: getOptionalString(formData, "beneficiaryName"),
        beneficiaryAddress: getOptionalString(formData, "beneficiaryAddress"),
        beneficiaryPostalCode: getOptionalString(formData, "beneficiaryPostalCode"),
        beneficiaryCity: getOptionalString(formData, "beneficiaryCity"),
        beneficiaryCountry: parseOptionalCountry(formData),
      },
    });

    revalidatePath("/money-accounts");
    revalidatePath("/");
    revalidatePath("/editions");
    revalidatePath("/invoices");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateMoneyAccountAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireMoneyAccountManager();
    const moneyAccountId = getRequiredString(formData, "moneyAccountId");
    const name = getRequiredString(formData, "name");
    const type = getRequiredString(formData, "type") as MoneyAccountType;
    const openingBalance = parseOpeningBalance(formData);

    await requireWritableMoneyAccount(moneyAccountId);

    await prisma.moneyAccount.update({
      where: { id: moneyAccountId },
      data: {
        name,
        type,
        openingBalance,
        iban: getOptionalString(formData, "iban"),
        beneficiaryName: getOptionalString(formData, "beneficiaryName"),
        beneficiaryAddress: getOptionalString(formData, "beneficiaryAddress"),
        beneficiaryPostalCode: getOptionalString(formData, "beneficiaryPostalCode"),
        beneficiaryCity: getOptionalString(formData, "beneficiaryCity"),
        beneficiaryCountry: parseOptionalCountry(formData),
      },
    });

    revalidatePath("/money-accounts");
    revalidatePath("/");
    revalidatePath("/journal");
    revalidatePath("/invoices");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteMoneyAccountAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireMoneyAccountManager();
    const moneyAccountId = getRequiredString(formData, "moneyAccountId");

    await requireWritableMoneyAccount(moneyAccountId);

    const [journalCount, invoiceCount] = await Promise.all([
      prisma.journalEntry.count({ where: { moneyAccountId } }),
      prisma.invoice.count({ where: { moneyAccountId } }),
    ]);

    if (journalCount > 0 || invoiceCount > 0) {
      throw new Error("This money account cannot be deleted because it already has records.");
    }

    await prisma.moneyAccount.delete({ where: { id: moneyAccountId } });

    revalidatePath("/money-accounts");
    revalidatePath("/");
    revalidatePath("/editions");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
