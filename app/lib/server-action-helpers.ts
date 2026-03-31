import { prisma } from "@/lib/db";

export function getRequiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

export async function getActiveEditionId() {
  const edition = await prisma.edition.findFirst({ where: { isActive: true }, select: { id: true } });

  if (!edition) {
    throw new Error("You need an active edition before managing this section.");
  }

  return edition.id;
}
