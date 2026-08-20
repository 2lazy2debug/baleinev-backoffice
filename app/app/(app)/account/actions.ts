"use server";

import { compare, hash } from "bcrypt";
import { revalidatePath } from "next/cache";

import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { type ActionState, getRequiredString, toActionErrorMessage } from "@/lib/server-action-helpers";

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
