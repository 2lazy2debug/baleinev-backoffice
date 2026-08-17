"use server";

import { hash } from "bcrypt";
import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { syncDepartmentRolesFromDepartments } from "@/lib/department-roles";
import { ensureUserEdition } from "@/lib/edition-context";
import { type ActionState, toActionErrorMessage } from "@/lib/server-action-helpers";

function getRequiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function getRoleAndDepartmentRoleIds(formData: FormData) {
  const role = getRequiredString(formData, "role") as UserRole;
  const departmentRoleIds = formData
    .getAll("departmentRoleIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (role !== UserRole.ADMIN && role !== UserRole.DEPARTMENT) {
    throw new Error("Invalid role.");
  }

  if (role === UserRole.DEPARTMENT && departmentRoleIds.length === 0) {
    throw new Error("At least one department role is required for department users.");
  }

  return {
    role,
    departmentRoleIds: role === UserRole.DEPARTMENT ? [...new Set(departmentRoleIds)] : [],
  };
}

async function ensureDepartmentRolesExist(departmentRoleIds: string[]) {
  if (departmentRoleIds.length === 0) {
    return;
  }

  const departmentRoles = await prisma.departmentRole.findMany({
    where: { id: { in: departmentRoleIds } },
    select: { id: true },
  });

  if (departmentRoles.length !== departmentRoleIds.length) {
    throw new Error("One or more selected department roles do not exist.");
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
    await syncDepartmentRolesFromDepartments();

    const name = getRequiredString(formData, "name");
    const email = getRequiredString(formData, "email").toLowerCase();
    const password = getRequiredString(formData, "password");
    const { role, departmentRoleIds } = getRoleAndDepartmentRoleIds(formData);

    await ensureDepartmentRolesExist(departmentRoleIds);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hash(password, 12),
        role,
        departmentRoles: {
          connect: departmentRoleIds.map((id) => ({ id })),
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
    await syncDepartmentRolesFromDepartments();

    const userId = getRequiredString(formData, "userId");
    const name = getRequiredString(formData, "name");
    const email = getRequiredString(formData, "email").toLowerCase();
    const newPassword = String(formData.get("newPassword") ?? "").trim();
    const { role, departmentRoleIds } = getRoleAndDepartmentRoleIds(formData);

    await ensureDepartmentRolesExist(departmentRoleIds);
    await assertAdminCanBeRemoved(userId, role);

    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        role,
        departmentRoles: {
          set: departmentRoleIds.map((id) => ({ id })),
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

    await prisma.user.delete({ where: { id: userId } });

    revalidatePath("/users");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
