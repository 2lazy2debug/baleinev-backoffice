"use server";

import { hash } from "bcrypt";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";

type RegisterGuestError = "missingFields" | "passwordTooShort" | "emailTaken" | "failed";

/**
 * Self-service sign-up from /login: creates a GUEST and nothing else (no
 * departments, no edition — a guest's edition is resolved per request). The
 * client signs in with the same credentials once this returns no error.
 */
export async function registerGuestAction(formData: FormData): Promise<{ error: RegisterGuestError | null }> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? ""); // never trimmed — authorize() compares it as typed

  if (!name || !email || !password) return { error: "missingFields" };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: "passwordTooShort" };

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { error: "emailTaken" };

  try {
    await prisma.user.create({
      data: { name, email, passwordHash: await hash(password, 12), role: "GUEST" },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "emailTaken" };
    }
    return { error: "failed" };
  }

  return { error: null };
}
