"use server";

import { revalidatePath } from "next/cache";

import { AccountType, Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { type ActionState, toActionErrorMessage } from "@/lib/server-action-helpers";
import { decimalToNumber, incrementEditionName, isValidEditionName } from "@/lib/utils";

function getRequiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function getEditionName(formData: FormData) {
  const name = getRequiredString(formData, "name");

  if (!isValidEditionName(name)) {
    throw new Error("Edition name must follow the YYYY-YYYY format (e.g. 2025-2026).");
  }

  return name;
}

function parsePositiveDecimal(raw: string, fieldName: string) {
  const normalized = raw.replace(",", ".").trim();
  const value = Number(normalized);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }

  return value;
}

export async function createEditionAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const name = getEditionName(formData);
    const startDate = String(formData.get("startDate") ?? "").trim();
    const endDate = String(formData.get("endDate") ?? "").trim();
    const drivingRatePerKm = parsePositiveDecimal(String(formData.get("drivingRatePerKm") ?? "0.30"), "Driving rate per km");
    const makeDefault = formData.get("isDefault") === "on";

    await prisma.$transaction(async (tx) => {
      const firstEdition = (await tx.edition.count()) === 0;

      if (makeDefault || firstEdition) {
        await tx.edition.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }

      await tx.edition.create({
        data: {
          name,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          drivingRatePerKm,
          isDefault: makeDefault || firstEdition,
        },
      });
    });

    revalidatePath("/editions");
    revalidatePath("/");
    revalidatePath("/departments");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Sets which edition seeds accounts that have none. It does not move anyone:
 * every user keeps whatever they already selected.
 */
export async function setDefaultEditionAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = getRequiredString(formData, "editionId");

    await prisma.$transaction([
      prisma.edition.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      prisma.edition.update({ where: { id: editionId }, data: { isDefault: true } }),
    ]);

    revalidatePath("/editions");
    revalidatePath("/");
    revalidatePath("/departments");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteEditionAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = getRequiredString(formData, "editionId");

    // Users pointing at this edition survive it — the SetNull relation clears
    // their selection and they re-seed from the default on their next request.
    await prisma.edition.delete({ where: { id: editionId } });

    const defaultEdition = await prisma.edition.findFirst({ where: { isDefault: true }, select: { id: true } });

    if (!defaultEdition) {
      const latestEdition = await prisma.edition.findFirst({ orderBy: { createdAt: "desc" } });

      if (latestEdition) {
        await prisma.edition.update({ where: { id: latestEdition.id }, data: { isDefault: true } });
      }
    }

    revalidatePath("/editions");
    revalidatePath("/");
    revalidatePath("/departments");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function closeEditionAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = getRequiredString(formData, "editionId");

    await prisma.$transaction(async (tx) => {
      const edition = await tx.edition.findUnique({
        where: { id: editionId },
        include: {
          departments: true,
          costCenters: true,
          moneyAccounts: {
            include: { journalEntries: true },
          },
        },
      });

      if (!edition) {
        throw new Error("Edition not found.");
      }

      if (edition.closedAt) {
        return;
      }

      const nextEditionName = incrementEditionName(edition.name);
      const existingNextEdition = await tx.edition.findUnique({ where: { name: nextEditionName } });

      if (existingNextEdition) {
        throw new Error("The next edition already exists.");
      }

      await tx.edition.updateMany({ where: { isDefault: true }, data: { isDefault: false } });

      const nextEdition = await tx.edition.create({
        data: {
          name: nextEditionName,
          isDefault: true,
          startDate: edition.endDate,
          drivingRatePerKm: edition.drivingRatePerKm,
        },
      });

      await tx.edition.update({
        where: { id: edition.id },
        data: { closedAt: new Date() },
      });

      for (const department of edition.departments) {
        await tx.department.create({
          data: { editionId: nextEdition.id, name: department.name },
        });
      }

      for (const costCenter of edition.costCenters) {
        await tx.costCenter.create({
          data: { editionId: nextEdition.id, code: costCenter.code, name: costCenter.name },
        });
      }

      for (const account of edition.moneyAccounts) {
        const nextAccount = await tx.moneyAccount.create({
          data: {
            editionId: nextEdition.id,
            name: account.name,
            type: account.type,
          },
        });

        const closingBalance = account.journalEntries.reduce((total, entry) => {
          const amount = decimalToNumber(entry.amount);
          return entry.accountType === AccountType.PRODUITS ? total + amount : total - amount;
        }, 0);

        if (closingBalance === 0) {
          continue;
        }

        await tx.journalEntry.create({
          data: {
            editionId: nextEdition.id,
            moneyAccountId: nextAccount.id,
            accountType: closingBalance >= 0 ? AccountType.PRODUITS : AccountType.CHARGES,
            sequenceNumber: 0,
            date: new Date(),
            amount: new Prisma.Decimal(Math.abs(closingBalance).toFixed(2)),
            label: "Report édition précédente",
            isOpeningEntry: true,
          },
        });
      }
    });

    revalidatePath("/editions");
    revalidatePath("/");
    revalidatePath("/departments");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateDrivingRateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = getRequiredString(formData, "editionId");
    const drivingRatePerKm = parsePositiveDecimal(getRequiredString(formData, "drivingRatePerKm"), "Driving rate per km");

    await prisma.edition.update({
      where: { id: editionId },
      data: { drivingRatePerKm },
    });

    revalidatePath("/editions");
    revalidatePath("/expense-reports");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
