"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

/**
 * A department is global, so nothing here goes through `resolveWritableEditionId`:
 * a closed edition says nothing about whether the association still has a
 * PROGRAMMATION team. The budget lines a department's budgets hold are guarded by
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
    const { name, abbreviation } = readDepartmentFields(formData);

    await assertNameIsFree(name);

    await prisma.department.create({ data: { name, abbreviation } });

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
    const { name, abbreviation } = readDepartmentFields(formData);

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });

    if (!department) {
      throw new Error("Department not found.");
    }

    await assertNameIsFree(name, departmentId);

    await prisma.department.update({
      where: { id: departmentId },
      data: { name, abbreviation },
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

    // Budgets do NOT stand in the way. A department does not own its budgets —
    // it is only attached to them, and deleting it cascades those join rows
    // away while every budget, its lines and its journal entries stay put. The
    // client warns about that before the admin confirms.
    const references =
      department._count.users +
      department._count.expenseReports +
      department._count.appointmentInvites +
      department._count.passwordEntries;

    if (references > 0) {
      throw new Error(
        "This department cannot be deleted while people, expense reports, invitations or password entries still point at it.",
      );
    }

    await prisma.department.delete({ where: { id: departmentId } });

    revalidateDepartments();
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
