"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserAccess, requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getActiveEditionId, getRequiredString } from "@/lib/server-action-helpers";

function parseDateTime(raw: string) {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date and time.");
  }

  return date;
}

export async function createAppointmentAction(formData: FormData) {
  const access = await requireAdmin();
  const editionId = await getActiveEditionId();

  const title = getRequiredString(formData, "title");
  const description = getRequiredString(formData, "description");
  const startAt = parseDateTime(getRequiredString(formData, "startAt"));
  const endAtRaw = String(formData.get("endAt") ?? "").trim();
  const audienceValues = formData
    .getAll("audience")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const endAt = endAtRaw ? parseDateTime(endAtRaw) : null;
  if (endAt && endAt < startAt) {
    throw new Error("End date must be after start date.");
  }

  const inviteAll = audienceValues.includes("@everyone");
  const inviteUserIds = Array.from(new Set(
    audienceValues
      .filter((value) => value.startsWith("user:"))
      .map((value) => value.slice("user:".length))
      .filter(Boolean),
  ));
  const inviteDepartmentIds = Array.from(new Set(
    audienceValues
      .filter((value) => value.startsWith("department:"))
      .map((value) => value.slice("department:".length))
      .filter(Boolean),
  ));

  const appointmentDelegate = (prisma as unknown as {
    appointment?: {
      create: (args: unknown) => Promise<unknown>;
    };
  }).appointment;

  if (!appointmentDelegate) {
    throw new Error("Calendar models are not available in the Prisma client. Run db:generate and restart the app.");
  }

  await appointmentDelegate.create({
    data: {
      editionId,
      createdById: access.id,
      title,
      description,
      startAt,
      endAt,
      inviteAll,
      inviteUsers: !inviteAll && inviteUserIds.length > 0
        ? { create: inviteUserIds.map((userId) => ({ userId })) }
        : undefined,
      inviteDepartments: !inviteAll && inviteDepartmentIds.length > 0
        ? { create: inviteDepartmentIds.map((departmentId) => ({ departmentId })) }
        : undefined,
    },
  });

  revalidatePath("/calendar");
}

export async function updateAppointmentAction(formData: FormData) {
  const access = await getCurrentUserAccess();

  const appointmentId = getRequiredString(formData, "appointmentId");
  const title = getRequiredString(formData, "title");
  const description = getRequiredString(formData, "description");
  const startAt = parseDateTime(getRequiredString(formData, "startAt"));
  const endAtRaw = String(formData.get("endAt") ?? "").trim();
  const endAt = endAtRaw ? parseDateTime(endAtRaw) : null;

  if (endAt && endAt < startAt) {
    throw new Error("End date must be after start date.");
  }

  const appointmentDelegate = (prisma as unknown as {
    appointment?: {
      findUnique: (args: unknown) => Promise<{ id: string; createdById: string } | null>;
      update: (args: unknown) => Promise<unknown>;
    };
  }).appointment;

  if (!appointmentDelegate) {
    throw new Error("Calendar models are not available in the Prisma client. Run db:generate and restart the app.");
  }

  const existing = await appointmentDelegate.findUnique({
    where: { id: appointmentId },
    select: { id: true, createdById: true },
  });

  if (!existing) {
    throw new Error("Appointment not found.");
  }

  if (existing.createdById !== access.id) {
    throw new Error("Only the creator can edit this appointment.");
  }

  await appointmentDelegate.update({
    where: { id: appointmentId },
    data: {
      title,
      description,
      startAt,
      endAt,
    },
  });

  revalidatePath("/calendar");
}

export async function deleteAppointmentAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const appointmentId = getRequiredString(formData, "appointmentId");

  const appointmentDelegate = (prisma as unknown as {
    appointment?: {
      findUnique: (args: unknown) => Promise<{ id: string; createdById: string } | null>;
      delete: (args: unknown) => Promise<unknown>;
    };
  }).appointment;

  if (!appointmentDelegate) {
    throw new Error("Calendar models are not available in the Prisma client. Run db:generate and restart the app.");
  }

  const existing = await appointmentDelegate.findUnique({
    where: { id: appointmentId },
    select: { id: true, createdById: true },
  });

  if (!existing) {
    throw new Error("Appointment not found.");
  }

  if (existing.createdById !== access.id) {
    throw new Error("Only the creator can delete this appointment.");
  }

  await appointmentDelegate.delete({ where: { id: appointmentId } });
  revalidatePath("/calendar");
}
