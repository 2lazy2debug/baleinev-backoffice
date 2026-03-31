"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getActiveEditionId, getRequiredString } from "@/lib/server-action-helpers";

export async function createCostCenterAction(formData: FormData) {
  await requireAdmin();
  const editionId = await getActiveEditionId();
  const code = getRequiredString(formData, "code");
  const name = getRequiredString(formData, "name");

  await prisma.costCenter.create({
    data: { editionId, code, name },
  });

  revalidatePath("/cost-centers");
  revalidatePath("/editions");
}

export async function deleteCostCenterAction(formData: FormData) {
  await requireAdmin();
  const costCenterId = getRequiredString(formData, "costCenterId");
  const journalCount = await prisma.journalEntry.count({ where: { costCenterId } });

  if (journalCount > 0) {
    throw new Error("This cost center cannot be deleted because it already contains journal entries.");
  }

  await prisma.costCenter.delete({ where: { id: costCenterId } });

  revalidatePath("/cost-centers");
  revalidatePath("/editions");
}

export async function updateCostCenterNameAction(formData: FormData) {
  await requireAdmin();
  const costCenterId = getRequiredString(formData, "costCenterId");
  const name = getRequiredString(formData, "name");

  await prisma.costCenter.update({
    where: { id: costCenterId },
    data: { name },
  });

  revalidatePath("/cost-centers");
  revalidatePath("/editions");
}
