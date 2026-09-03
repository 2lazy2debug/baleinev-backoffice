"use server";

import { hash } from "bcrypt";
import { TaskType, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { ensureUserEdition } from "@/lib/edition-context";
import { type ActionState, toActionErrorMessage } from "@/lib/server-action-helpers";

function getRequiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function getRoleAndDepartmentIds(formData: FormData) {
  const role = getRequiredString(formData, "role") as UserRole;
  const departmentIds = formData
    .getAll("departmentIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (role !== UserRole.ADMIN && role !== UserRole.DEPARTMENT) {
    throw new Error("Invalid role.");
  }

  if (role === UserRole.DEPARTMENT && departmentIds.length === 0) {
    throw new Error("At least one department is required for department users.");
  }

  return {
    role,
    departmentIds: role === UserRole.DEPARTMENT ? [...new Set(departmentIds)] : [],
  };
}

async function ensureDepartmentsExist(departmentIds: string[]) {
  if (departmentIds.length === 0) {
    return;
  }

  const departments = await prisma.department.findMany({
    where: { id: { in: departmentIds } },
    select: { id: true },
  });

  if (departments.length !== departmentIds.length) {
    throw new Error("One or more selected departments do not exist.");
  }
}

async function assertAdminCanBeRemoved(userId: string, nextRole?: UserRole) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!existingUser) {
    throw new Error("User not found.");
  }

  const removingAdmin = existingUser.role === UserRole.ADMIN && nextRole === UserRole.DEPARTMENT;
  const deletingAdmin = existingUser.role === UserRole.ADMIN && nextRole === undefined;

  if (!removingAdmin && !deletingAdmin) {
    return;
  }

  const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });
  if (adminCount <= 1) {
    throw new Error("At least one admin account must remain.");
  }
}

export async function createUserAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    const name = getRequiredString(formData, "name");
    const email = getRequiredString(formData, "email").toLowerCase();
    const password = getRequiredString(formData, "password");
    const { role, departmentIds } = getRoleAndDepartmentIds(formData);

    await ensureDepartmentsExist(departmentIds);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hash(password, 12),
        role,
        departments: {
          connect: departmentIds.map((id) => ({ id })),
        },
      },
      select: { id: true },
    });

    // Land the new account on the default edition straight away, so it opens
    // somewhere real rather than on a "pick an edition" screen.
    await ensureUserEdition(user.id);

    revalidatePath("/users");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateUserAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    const userId = getRequiredString(formData, "userId");
    const name = getRequiredString(formData, "name");
    const email = getRequiredString(formData, "email").toLowerCase();
    const newPassword = String(formData.get("newPassword") ?? "").trim();
    const { role, departmentIds } = getRoleAndDepartmentIds(formData);

    await ensureDepartmentsExist(departmentIds);
    await assertAdminCanBeRemoved(userId, role);

    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        role,
        departments: {
          set: departmentIds.map((id) => ({ id })),
        },
        ...(newPassword ? { passwordHash: await hash(newPassword, 12) } : {}),
      },
    });

    revalidatePath("/users");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteUserAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await requireAdmin();
    const userId = getRequiredString(formData, "userId");

    if (access.id === userId) {
      throw new Error("You cannot delete your own account.");
    }

    await assertAdminCanBeRemoved(userId);

    // `Task.createdById` is SetNull, so tasks survive their creator on purpose.
    // A department access request must not: nobody is left to grant it to, and
    // every admin would keep seeing it.
    await prisma.task.deleteMany({
      where: { type: TaskType.DEPARTMENT_ACCESS_REQUEST, createdById: userId },
    });
    await prisma.user.delete({ where: { id: userId } });

    revalidatePath("/users");
    revalidatePath("/tasks");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
