"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionId } from "@/lib/edition-context";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

export async function createCostCenterAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveEditionId();
    const code = getRequiredString(formData, "code");
    const name = getRequiredString(formData, "name");

    await prisma.costCenter.create({
      data: { editionId, code, name },
    });

    revalidatePath("/cost-centers");
    revalidatePath("/editions");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteCostCenterAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const costCenterId = getRequiredString(formData, "costCenterId");
    const journalCount = await prisma.journalEntry.count({ where: { costCenterId } });

    if (journalCount > 0) {
      throw new Error("This cost center cannot be deleted because it already contains journal entries.");
    }

    await prisma.costCenter.delete({ where: { id: costCenterId } });

    revalidatePath("/cost-centers");
    revalidatePath("/editions");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateCostCenterNameAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const costCenterId = getRequiredString(formData, "costCenterId");
    const name = getRequiredString(formData, "name");

    await prisma.costCenter.update({
      where: { id: costCenterId },
      data: { name },
    });

    revalidatePath("/cost-centers");
    revalidatePath("/editions");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
