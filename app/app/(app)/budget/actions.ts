"use server";

import { AccountType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { assertBudgetInEdition } from "@/lib/budgets";
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

/**
 * The departments a budget may be attached to: the ids from the form, refused
 * unless every one of them is a real department that budgets. Returns the
 * de-duplicated list ready for a nested `create`.
 */
async function readBudgetingDepartmentIds(formData: FormData) {
  const departmentIds = [
    ...new Set(
      formData
        .getAll("departmentIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];

  if (departmentIds.length === 0) {
    return departmentIds;
  }

  const budgeting = await prisma.department.count({
    where: { id: { in: departmentIds }, hasBudget: true },
  });

  if (budgeting !== departmentIds.length) {
    throw new Error("A department without a budget cannot be attached to a budget.");
  }

  return departmentIds;
}

async function assertBudgetNameIsFree(editionId: string, name: string, exceptId?: string) {
  const existing = await prisma.budget.findFirst({
    where: { editionId, name },
    select: { id: true },
  });

  if (existing && existing.id !== exceptId) {
    throw new Error(`A budget called ${name} already exists in this edition.`);
  }
}

function revalidateBudget() {
  revalidatePath("/budget");
  revalidatePath("/journal");
  revalidatePath("/");
}

export async function createBudgetAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();

    const name = getRequiredString(formData, "name");
    const departmentIds = await readBudgetingDepartmentIds(formData);

    await assertBudgetNameIsFree(editionId, name);

    await prisma.budget.create({
      data: {
        editionId,
        name,
        departments: { create: departmentIds.map((departmentId) => ({ departmentId })) },
      },
    });

    revalidateBudget();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateBudgetAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();

    const budgetId = getRequiredString(formData, "budgetId");
    const name = getRequiredString(formData, "name");
    const departmentIds = await readBudgetingDepartmentIds(formData);

    await assertBudgetInEdition(budgetId, editionId);
    await assertBudgetNameIsFree(editionId, name, budgetId);

    // Detaching a department takes nothing away from the budget, so the whole
    // attachment set is simply replaced.
    await prisma.$transaction([
      prisma.budgetDepartment.deleteMany({ where: { budgetId } }),
      prisma.budgetDepartment.createMany({
        data: departmentIds.map((departmentId) => ({ budgetId, departmentId })),
      }),
      prisma.budget.update({ where: { id: budgetId }, data: { name } }),
    ]);

    revalidateBudget();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteBudgetAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();

    const budgetId = getRequiredString(formData, "budgetId");

    await assertBudgetInEdition(budgetId, editionId);

    const [budgetLines, journalEntries] = await Promise.all([
      prisma.budgetLine.count({ where: { budgetId } }),
      prisma.journalEntry.count({ where: { budgetId } }),
    ]);

    if (budgetLines > 0 || journalEntries > 0) {
      throw new Error(
        "This budget still holds budget lines or journal entries. Empty it before deleting it.",
      );
    }

    // An empty budget goes, and its `BudgetDepartment` rows with it by cascade.
    await prisma.budget.delete({ where: { id: budgetId } });

    revalidateBudget();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function createBudgetLineAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const editionId = await resolveWritableEditionId();

    const budgetId = getRequiredString(formData, "budgetId");
    const accountTypeRaw = getRequiredString(formData, "accountType");
    const label = getRequiredString(formData, "label");
    const amountRaw = getRequiredString(formData, "amount");
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (accountTypeRaw !== AccountType.CHARGES && accountTypeRaw !== AccountType.PRODUITS) {
      throw new Error("Invalid account type.");
    }

    const amount = toPositiveAmount(amountRaw);

    await assertBudgetInEdition(budgetId, editionId);

    await prisma.budgetLine.create({
      data: {
        budgetId,
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
    where: { id: budgetLineId, budget: { editionId } },
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
