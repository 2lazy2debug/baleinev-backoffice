"use server";

import { AccountType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveWritableEditionId } from "@/lib/edition-context";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

function toPositiveAmount(raw: string) {
  const normalized = raw.replace(",", ".").trim();
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number.");
  }

  return amount;
}

export async function createBudgetLineAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();

    const departmentId = getRequiredString(formData, "departmentId");
    const accountTypeRaw = getRequiredString(formData, "accountType");
    const label = getRequiredString(formData, "label");
    const amountRaw = getRequiredString(formData, "amount");
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (accountTypeRaw !== AccountType.CHARGES && accountTypeRaw !== AccountType.PRODUITS) {
      throw new Error("Invalid account type.");
    }

    const amount = toPositiveAmount(amountRaw);

    const department = await prisma.department.findFirst({
      where: { id: departmentId, editionId },
      select: { id: true },
    });

    if (!department) {
      throw new Error("Selected department does not belong to the active edition.");
    }

    await prisma.budgetLine.create({
      data: {
        departmentId,
        accountType: accountTypeRaw,
        label,
        amount,
        notes,
      },
    });

    revalidatePath("/budget");
    revalidatePath("/");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

async function requireEditionBudgetLine(budgetLineId: string, editionId: string) {
  const budgetLine = await prisma.budgetLine.findFirst({
    where: { id: budgetLineId, department: { editionId } },
    select: { id: true },
  });

  if (!budgetLine) {
    throw new Error("Budget line does not belong to the active edition.");
  }

  return budgetLine.id;
}

export async function updateBudgetLineAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const budgetLineId = getRequiredString(formData, "budgetLineId");
    const label = getRequiredString(formData, "label");
    const amountRaw = getRequiredString(formData, "amount");
    const notes = String(formData.get("notes") ?? "").trim() || null;

    const amount = toPositiveAmount(amountRaw);

    await requireEditionBudgetLine(budgetLineId, editionId);

    await prisma.budgetLine.update({
      where: { id: budgetLineId },
      data: { label, amount, notes },
    });

    revalidatePath("/budget");
    revalidatePath("/");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteBudgetLineAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const budgetLineId = getRequiredString(formData, "budgetLineId");

    await requireEditionBudgetLine(budgetLineId, editionId);

    await prisma.budgetLine.delete({ where: { id: budgetLineId } });

    revalidatePath("/budget");
    revalidatePath("/");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
