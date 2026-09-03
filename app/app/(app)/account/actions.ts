"use server";

import { TaskStatus, TaskType } from "@prisma/client";
import { compare, hash } from "bcrypt";
import { revalidatePath } from "next/cache";

import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { type ActionState, getRequiredString, toActionErrorMessage } from "@/lib/server-action-helpers";
import { createDepartmentAccessRequestTask } from "@/lib/tasks";
import { generateTotpSecret } from "@/lib/totp";
import {
  buildTwoFactorEnrolment,
  isTwoFactorConfigured,
  sealTwoFactorSecret,
  verifyUserTwoFactorCode,
} from "@/lib/two-factor";

/** The shortest password the app will accept — matched by the client's `minLength`. */
const MIN_PASSWORD_LENGTH = 8;

function toNullableString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

/**
 * Every action here edits the signed-in user and nobody else: the id comes from
 * the session, never from the form. Admin-side edits of *other* accounts stay in
 * `/users`.
 */
export async function updateAccountNameAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const name = getRequiredString(formData, "name");

    await prisma.user.update({ where: { id: access.id }, data: { name } });

    revalidatePath("/account");
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** The bank details an approved expense report is reimbursed to. All five are optional. */
export async function updateBankDetailsAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();

    await prisma.user.update({
      where: { id: access.id },
      data: {
        refundFirstName: toNullableString(formData, "refundFirstName"),
        refundLastName: toNullableString(formData, "refundLastName"),
        refundIban: toNullableString(formData, "refundIban")?.toUpperCase().replace(/\s+/g, "") ?? null,
        refundZip: toNullableString(formData, "refundZip"),
        refundCity: toNullableString(formData, "refundCity"),
      },
    });

    revalidatePath("/account");
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function changePasswordAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const currentPassword = getRequiredString(formData, "currentPassword");
    const newPassword = getRequiredString(formData, "newPassword");
    const confirmPassword = getRequiredString(formData, "confirmPassword");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    if (newPassword !== confirmPassword) {
      throw new Error("The two new passwords do not match.");
    }

    // Read the hash here rather than through the access context — that context is
    // handed to screens, and a password hash has no business travelling with it.
    const user = await prisma.user.findUnique({
      where: { id: access.id },
      select: { passwordHash: true },
    });

    if (!user || !(await compare(currentPassword, user.passwordHash))) {
      throw new Error("Your current password is wrong.");
    }

    await prisma.user.update({
      where: { id: access.id },
      data: { passwordHash: await hash(newPassword, 12) },
    });

    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Ask to join a department. This only files a task for the admins — it grants
 * nothing, and an admin marking it done is not the same as an admin adding the
 * membership in `/users`. The request stands until an admin clears it, so the
 * user cannot pile up duplicates for the same department.
 */
export async function requestDepartmentAccessAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const departmentId = getRequiredString(formData, "departmentId");

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true },
    });

    if (!department) {
      throw new Error("That department no longer exists.");
    }

    if (access.departmentIds.includes(department.id)) {
      throw new Error(`You are already in ${department.name}.`);
    }

    const pending = await prisma.task.findFirst({
      where: {
        type: TaskType.DEPARTMENT_ACCESS_REQUEST,
        status: TaskStatus.PENDING,
        createdById: access.id,
        departmentId: department.id,
      },
      select: { id: true },
    });

    if (pending) {
      throw new Error(`Your request to join ${department.name} is still with the admins.`);
    }

    await createDepartmentAccessRequestTask({
      userId: access.id,
      userName: access.userName,
      departmentId: department.id,
      departmentName: department.name,
    });

    revalidatePath("/account");
    revalidatePath("/tasks");
    revalidatePath("/");
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/* -------------------------------------------------------------------------- */
/* Two-factor sign-in                                                         */
/* -------------------------------------------------------------------------- */

/** What the enrolment step hands back to the screen: the QR, and the secret behind it. */
export type TwoFactorEnrolmentResult =
  | { ok: true; secret: string; qrDataUrl: string }
  | { ok: false; error: string };

/**
 * Step one of turning 2FA on: mint a secret, seal it onto the account and show
 * it once. `twoFactorEnabled` stays false — the seed is a *pending* enrolment
 * that login ignores until the user proves, in step two, that their phone can
 * produce a code from it. Called directly rather than as a form action, because
 * it returns something to draw.
 */
export async function startTwoFactorEnrolmentAction(): Promise<TwoFactorEnrolmentResult> {
  try {
    if (!isTwoFactorConfigured()) {
      throw new Error("Two-factor sign-in is not configured on this server.");
    }

    const access = await getCurrentUserAccess();

    const current = await prisma.user.findUnique({
      where: { id: access.id },
      select: { twoFactorEnabled: true },
    });

    // Re-enrolling in place would silently replace the seed the user's phone
    // already holds, so it goes through "turn it off" first.
    if (current?.twoFactorEnabled) {
      throw new Error("Two-factor sign-in is already on. Turn it off before setting it up again.");
    }

    const secret = generateTotpSecret();
    const sealed = sealTwoFactorSecret(secret);

    await prisma.user.update({
      where: { id: access.id },
      data: {
        twoFactorEnabled: false,
        twoFactorCipher: sealed.cipher,
        twoFactorIv: sealed.iv,
        twoFactorTag: sealed.tag,
      },
    });

    const enrolment = await buildTwoFactorEnrolment(access.email, secret);
    return { ok: true, secret: enrolment.secret, qrDataUrl: enrolment.qrDataUrl };
  } catch (err) {
    return { ok: false, error: toActionErrorMessage(err) };
  }
}

/**
 * Step two: a code from the pending seed turns 2FA on. Until this succeeds the
 * account signs in on its password alone, so a half-finished enrolment can
 * never lock anyone out.
 */
export async function enableTwoFactorAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const code = getRequiredString(formData, "code");

    const user = await prisma.user.findUnique({
      where: { id: access.id },
      select: { twoFactorEnabled: true, twoFactorCipher: true, twoFactorIv: true, twoFactorTag: true },
    });

    if (!user?.twoFactorCipher) {
      throw new Error("Start the setup again — there is nothing to confirm.");
    }

    if (!verifyUserTwoFactorCode(user, code)) {
      throw new Error("That code is wrong or has expired. Type the current one from your app.");
    }

    await prisma.user.update({ where: { id: access.id }, data: { twoFactorEnabled: true } });

    revalidatePath("/account");
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/** Drops a pending enrolment the user backed out of. Never touches an active one. */
export async function cancelTwoFactorEnrolmentAction(): Promise<void> {
  const access = await getCurrentUserAccess();

  await prisma.user.updateMany({
    where: { id: access.id, twoFactorEnabled: false },
    data: { twoFactorCipher: null, twoFactorIv: null, twoFactorTag: null },
  });
}

/**
 * Turning 2FA off weakens the account, so it costs the account password — the
 * same proof changing the password costs. An open session on a borrowed laptop
 * is not enough.
 */
export async function disableTwoFactorAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const password = getRequiredString(formData, "currentPassword");

    const user = await prisma.user.findUnique({
      where: { id: access.id },
      select: { passwordHash: true },
    });

    if (!user || !(await compare(password, user.passwordHash))) {
      throw new Error("Your current password is wrong.");
    }

    await prisma.user.update({
      where: { id: access.id },
      data: {
        twoFactorEnabled: false,
        twoFactorCipher: null,
        twoFactorIv: null,
        twoFactorTag: null,
      },
    });

    revalidatePath("/account");
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
