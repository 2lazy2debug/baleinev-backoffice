"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { carryOverEdition } from "@/lib/edition-carry-over";
import { requireWritableEdition } from "@/lib/edition-context";
import { type ActionState, toActionErrorMessage } from "@/lib/server-action-helpers";
import { incrementEditionName, isValidEditionName } from "@/lib/utils";

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
    // Empty means "start blank" — bringing data over is an explicit choice.
    const carryOverFromId = String(formData.get("carryOverFromId") ?? "").trim() || null;

    await prisma.$transaction(async (tx) => {
      const firstEdition = (await tx.edition.count()) === 0;

      if (makeDefault || firstEdition) {
        await tx.edition.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }

      const edition = await tx.edition.create({
        data: {
          name,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          drivingRatePerKm,
          isDefault: makeDefault || firstEdition,
        },
      });

      // Same transaction as the create, so a failed copy leaves no
      // half-populated edition behind.
      if (carryOverFromId) {
        await carryOverEdition(tx, carryOverFromId, edition.id);
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
        select: { id: true, name: true, closedAt: true, endDate: true, drivingRatePerKm: true },
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

      await carryOverEdition(tx, edition.id, nextEdition.id);
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

    await requireWritableEdition(editionId);

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
