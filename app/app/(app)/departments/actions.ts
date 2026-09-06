"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { departmentBudgetUsage } from "@/lib/departments";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

/**
 * A department is global, so nothing here goes through `resolveWritableEditionId`:
 * a closed edition says nothing about whether the association still has a
 * PROGRAMMATION team. What *is* edition-scoped — the budget lines — is guarded by
 * the budget screen.
 */

// A department is named all over the app: the nav counts, the budget, the
// journal's picker, the passwords vault, everyone's account page.
const TOUCHED_PATHS = [
  "/departments",
  "/budget",
  "/journal",
  "/expense-reports",
  "/calendar",
  "/passwords",
  "/users",
  "/account",
  "/",
];

function revalidateDepartments() {
  for (const path of TOUCHED_PATHS) {
    revalidatePath(path);
  }
}

function readDepartmentFields(formData: FormData) {
  return {
    name: getRequiredString(formData, "name"),
    abbreviation: String(formData.get("abbreviation") ?? "").trim() || null,
    hasBudget: formData.get("hasBudget") === "on",
  };
}

async function assertNameIsFree(name: string, exceptId?: string) {
  const existing = await prisma.department.findUnique({ where: { name }, select: { id: true } });

  if (existing && existing.id !== exceptId) {
    throw new Error(`A department called ${name} already exists.`);
  }
}

export async function createDepartmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const { name, abbreviation, hasBudget } = readDepartmentFields(formData);

    await assertNameIsFree(name);

    // `hasBudget` only says the department may be attached to budgets; the
    // budgets themselves are created by hand in the budget app.
    await prisma.department.create({ data: { name, abbreviation, hasBudget } });

    revalidateDepartments();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateDepartmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const departmentId = getRequiredString(formData, "departmentId");
    const { name, abbreviation, hasBudget } = readDepartmentFields(formData);

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { hasBudget: true },
    });

    if (!department) {
      throw new Error("Department not found.");
    }

    await assertNameIsFree(name, departmentId);

    // Turning the flag off detaches the department from every budget. It moves
    // no money, but it is still refused while one of those budgets holds lines
    // or entries — that would hide live money from the team.
    if (department.hasBudget && !hasBudget) {
      const usage = await departmentBudgetUsage(departmentId);

      if (usage.isUsed) {
        throw new Error(
          "This department is attached to a budget that holds lines or journal entries. Detach it there first.",
        );
      }

      await prisma.budgetDepartment.deleteMany({ where: { departmentId } });
    }

    await prisma.department.update({
      where: { id: departmentId },
      data: { name, abbreviation, hasBudget },
    });

    revalidateDepartments();
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
      select: {
        _count: { select: { users: true, expenseReports: true, appointmentInvites: true, passwordEntries: true } },
      },
    });

    if (!department) {
      throw new Error("Department not found.");
    }

    const usage = await departmentBudgetUsage(departmentId);
    const references =
      department._count.users +
      department._count.expenseReports +
      department._count.appointmentInvites +
      department._count.passwordEntries;

    if (usage.isUsed || references > 0) {
      throw new Error(
        "This department cannot be deleted while people, budget lines, journal entries, expense reports or invitations still point at it.",
      );
    }

    await prisma.department.delete({ where: { id: departmentId } });

    revalidateDepartments();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
