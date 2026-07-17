"use server";

import { revalidatePath } from "next/cache";

import {
  canAccessDepartments,
  getCurrentUserAccess,
  isAdmin,
  type AccessContext,
} from "@/lib/access";
import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/secret-crypto";
import { assertValidTotpSeed, generateTotpCode } from "@/lib/totp";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

// Result shapes for the on-demand secret reveals — these return a value rather
// than just an error, and are called directly (not through a form action).
export type RevealResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export type TotpResult =
  | { ok: true; code: string; secondsRemaining: number; period: number }
  | { ok: false; error: string };

function parseDepartmentRoleIds(formData: FormData): string[] {
  return [
    ...new Set(
      formData
        .getAll("departmentRoleIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
}

/** All submitted departments must be ones the user belongs to (admins unrestricted). */
async function resolveAssignableDepartments(
  access: AccessContext,
  submittedIds: string[],
): Promise<string[]> {
  if (submittedIds.length === 0) {
    throw new Error("Pick at least one department for this entry.");
  }

  const existing = await prisma.departmentRole.findMany({
    where: { id: { in: submittedIds } },
    select: { id: true },
  });
  if (existing.length !== submittedIds.length) {
    throw new Error("One or more selected departments do not exist.");
  }

  if (!isAdmin(access)) {
    const allowed = new Set(access.departmentRoleIds);
    if (submittedIds.some((id) => !allowed.has(id))) {
      throw new Error("You can only share entries with your own departments.");
    }
  }

  return submittedIds;
}

/** Loads an entry and enforces that the caller may act on it. */
async function requireEntryAccess(access: AccessContext, entryId: string) {
  const entry = await prisma.passwordEntry.findUnique({
    where: { id: entryId },
    include: { departmentRoles: { select: { id: true } } },
  });

  if (!entry) {
    throw new Error("Entry not found.");
  }

  const entryDepartmentIds = entry.departmentRoles.map((role) => role.id);
  if (!canAccessDepartments(access, entryDepartmentIds)) {
    throw new Error("You don't have access to this entry.");
  }

  return { entry, entryDepartmentIds };
}

export async function createPasswordEntryAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();

    const name = getRequiredString(formData, "name");
    const login = getRequiredString(formData, "login");
    const password = getRequiredString(formData, "password");
    const website = String(formData.get("website") ?? "").trim();
    const totpSeed = String(formData.get("totp") ?? "").trim();
    const departmentRoleIds = await resolveAssignableDepartments(access, parseDepartmentRoleIds(formData));

    if (totpSeed) {
      assertValidTotpSeed(totpSeed);
    }

    const passwordSealed = encryptSecret(password);
    const totpSealed = totpSeed ? encryptSecret(totpSeed) : null;

    await prisma.passwordEntry.create({
      data: {
        name,
        login,
        website: website || null,
        passwordCipher: passwordSealed.cipher,
        passwordIv: passwordSealed.iv,
        passwordTag: passwordSealed.tag,
        totpCipher: totpSealed?.cipher ?? null,
        totpIv: totpSealed?.iv ?? null,
        totpTag: totpSealed?.tag ?? null,
        createdById: access.id,
        departmentRoles: { connect: departmentRoleIds.map((id) => ({ id })) },
      },
    });

    revalidatePath("/passwords");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updatePasswordEntryAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const entryId = getRequiredString(formData, "entryId");
    const { entryDepartmentIds } = await requireEntryAccess(access, entryId);

    const name = getRequiredString(formData, "name");
    const login = getRequiredString(formData, "login");
    const website = String(formData.get("website") ?? "").trim();
    const newPassword = String(formData.get("password") ?? "").trim();
    const totpSeed = String(formData.get("totp") ?? "").trim();
    const clearTotp = String(formData.get("clearTotp") ?? "") === "on";

    const submittedDepartments = await resolveAssignableDepartments(access, parseDepartmentRoleIds(formData));

    // Non-admins can't manage sharing to departments they don't belong to, so
    // preserve any such existing links rather than silently dropping them.
    const finalDepartmentIds = isAdmin(access)
      ? submittedDepartments
      : [
          ...new Set([
            ...submittedDepartments,
            ...entryDepartmentIds.filter((id) => !access.departmentRoleIds.includes(id)),
          ]),
        ];

    if (totpSeed) {
      assertValidTotpSeed(totpSeed);
    }

    const passwordSealed = newPassword ? encryptSecret(newPassword) : null;
    const totpSealed = totpSeed ? encryptSecret(totpSeed) : null;

    await prisma.passwordEntry.update({
      where: { id: entryId },
      data: {
        name,
        login,
        website: website || null,
        ...(passwordSealed
          ? {
              passwordCipher: passwordSealed.cipher,
              passwordIv: passwordSealed.iv,
              passwordTag: passwordSealed.tag,
            }
          : {}),
        ...(totpSealed
          ? { totpCipher: totpSealed.cipher, totpIv: totpSealed.iv, totpTag: totpSealed.tag }
          : clearTotp
            ? { totpCipher: null, totpIv: null, totpTag: null }
            : {}),
        departmentRoles: { set: finalDepartmentIds.map((id) => ({ id })) },
      },
    });

    revalidatePath("/passwords");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deletePasswordEntryAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const entryId = getRequiredString(formData, "entryId");
    await requireEntryAccess(access, entryId);

    await prisma.passwordEntry.delete({ where: { id: entryId } });

    revalidatePath("/passwords");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function revealPasswordAction(entryId: string): Promise<RevealResult> {
  try {
    const access = await getCurrentUserAccess();
    const { entry } = await requireEntryAccess(access, entryId);

    const value = decryptSecret({
      cipher: entry.passwordCipher,
      iv: entry.passwordIv,
      tag: entry.passwordTag,
    });

    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: toActionErrorMessage(err) };
  }
}

export async function getTotpCodeAction(entryId: string): Promise<TotpResult> {
  try {
    const access = await getCurrentUserAccess();
    const { entry } = await requireEntryAccess(access, entryId);

    if (!entry.totpCipher || !entry.totpIv || !entry.totpTag) {
      return { ok: false, error: "This entry has no 2FA secret." };
    }

    const seed = decryptSecret({
      cipher: entry.totpCipher,
      iv: entry.totpIv,
      tag: entry.totpTag,
    });
    const { code, secondsRemaining, period } = generateTotpCode(seed);

    return { ok: true, code, secondsRemaining, period };
  } catch (err) {
    return { ok: false, error: toActionErrorMessage(err) };
  }
}
