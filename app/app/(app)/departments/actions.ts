"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { requireWritableEdition, resolveWritableEditionId } from "@/lib/edition-context";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

export async function createDepartmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
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
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteDepartmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const departmentId = getRequiredString(formData, "departmentId");

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { editionId: true },
    });

    if (!department) {
      throw new Error("Department not found.");
    }

    await requireWritableEdition(department.editionId);

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
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
