"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserAccess, requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { requireWritableEdition, resolveWritableEditionId } from "@/lib/edition-context";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

function parseDateTime(raw: string) {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date and time.");
  }

  return date;
}

export async function createAppointmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await requireAdmin();
    const editionId = await resolveWritableEditionId();

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

    await prisma.appointment.create({
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
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateAppointmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
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

    const existing = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, createdById: true, editionId: true },
    });

    if (!existing) {
      throw new Error("Appointment not found.");
    }

    await requireWritableEdition(existing.editionId);

    if (existing.createdById !== access.id) {
      throw new Error("Only the creator can edit this appointment.");
    }

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        title,
        description,
        startAt,
        endAt,
      },
    });

    revalidatePath("/calendar");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteAppointmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const appointmentId = getRequiredString(formData, "appointmentId");

    const existing = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, createdById: true, editionId: true },
    });

    if (!existing) {
      throw new Error("Appointment not found.");
    }

    await requireWritableEdition(existing.editionId);

    if (existing.createdById !== access.id) {
      throw new Error("Only the creator can delete this appointment.");
    }

    await prisma.appointment.delete({ where: { id: appointmentId } });
    revalidatePath("/calendar");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
