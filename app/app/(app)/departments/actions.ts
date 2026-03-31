"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getActiveEditionId, getRequiredString } from "@/lib/server-action-helpers";

export async function createDepartmentAction(formData: FormData) {
  await requireAdmin();
  const editionId = await getActiveEditionId();
  const name = getRequiredString(formData, "name");

  await prisma.department.create({
    data: {
      editionId,
      name,
    },
  });

  await prisma.departmentRole.upsert({
    where: { name },
    update: {},
    create: { name },
  });

  revalidatePath("/departments");
  revalidatePath("/budget");
  revalidatePath("/");
}

export async function deleteDepartmentAction(formData: FormData) {
  await requireAdmin();
  const departmentId = getRequiredString(formData, "departmentId");

  const [budgetCount, journalCount] = await Promise.all([
    prisma.budgetLine.count({ where: { departmentId } }),
    prisma.journalEntry.count({ where: { departmentId } }),
  ]);

  if (budgetCount > 0 || journalCount > 0) {
    throw new Error("This department cannot be deleted because it already contains data.");
  }

  await prisma.department.delete({ where: { id: departmentId } });

  revalidatePath("/departments");
  revalidatePath("/budget");
  revalidatePath("/");
}