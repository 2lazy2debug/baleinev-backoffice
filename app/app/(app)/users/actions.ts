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

function getRoleAndDepartmentIds(formData: FormData, currentRole?: UserRole) {
  const role = getRequiredString(formData, "role") as UserRole;
  const departmentIds = formData
    .getAll("departmentIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const keepsGuest = currentRole === UserRole.GUEST && role === UserRole.GUEST;

  if (!keepsGuest && role !== UserRole.ADMIN && role !== UserRole.DEPARTMENT) {
    throw new Error("Invalid role.");
  }

  if (currentRole === UserRole.GUEST && role === UserRole.ADMIN) {
    throw new Error("A guest can only become a department user.");
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

async function getExistingUser(userId: string) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, email: true },
  });

  if (!existingUser) {
    throw new Error("User not found.");
  }

  return existingUser;
}

async function assertAdminCanBeRemoved(currentRole: UserRole, nextRole?: UserRole) {
  const removingAdmin = currentRole === UserRole.ADMIN && nextRole === UserRole.DEPARTMENT;
  const deletingAdmin = currentRole === UserRole.ADMIN && nextRole === undefined;

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
    const existingUser = await getExistingUser(userId);
    const submittedEmail = getRequiredString(formData, "email");
    // Guests sign in with the email exactly as they registered it; keep the
    // stored spelling unless the admin actually changed the address.
    const email =
      submittedEmail.toLowerCase() === existingUser.email.toLowerCase()
        ? existingUser.email
        : submittedEmail.toLowerCase();
    const newPassword = String(formData.get("newPassword") ?? "").trim();
    const { role, departmentIds } = getRoleAndDepartmentIds(formData, existingUser.role);

    await ensureDepartmentsExist(departmentIds);
    await assertAdminCanBeRemoved(existingUser.role, role);

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

    // A promoted guest has no stored edition (guests resolve the default on
    // every request); give them one as createUserAction does for new members.
    if (existingUser.role === UserRole.GUEST && role !== UserRole.GUEST) {
      await ensureUserEdition(userId);
    }

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

    const existingUser = await getExistingUser(userId);
    await assertAdminCanBeRemoved(existingUser.role);

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

/**
 * The way back for a user who lost their authenticator: an admin clears the
 * seed, and the account signs in on its password alone until its owner enrols
 * again. Your own second factor is not reset here — `/account` turns it off,
 * and asks for the password to do it, so an admin session left open cannot
 * strip its own account without that proof.
 */
export async function resetUserTwoFactorAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await requireAdmin();
    const userId = getRequiredString(formData, "userId");

    if (access.id === userId) {
      throw new Error("Turn off your own two-factor sign-in from your account page.");
    }

    const { count } = await prisma.user.updateMany({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorCipher: null,
        twoFactorIv: null,
        twoFactorTag: null,
      },
    });

    if (count === 0) {
      throw new Error("User not found.");
    }

    revalidatePath("/users");
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
