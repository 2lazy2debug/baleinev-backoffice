"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserAccess, requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { createUserTask } from "@/lib/tasks";
import { TaskType } from "@prisma/client";
import { getRequiredString } from "@/lib/server-action-helpers";

// ────────────────────────────────────────────────────────────────────────────
// Event type CRUD (admin only)
// ────────────────────────────────────────────────────────────────────────────

export async function createEventTypeAction(formData: FormData) {
  await requireAdmin();
  const name = getRequiredString(formData, "name");
  const description = String(formData.get("description") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;

  await prisma.eventType.create({ data: { name, description, color } });
  revalidatePath("/events");
}

export async function updateEventTypeAction(formData: FormData) {
  await requireAdmin();
  const id = getRequiredString(formData, "id");
  const name = getRequiredString(formData, "name");
  const description = String(formData.get("description") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;

  await prisma.eventType.update({ where: { id }, data: { name, description, color } });
  revalidatePath("/events");
}

export async function deleteEventTypeAction(formData: FormData) {
  await requireAdmin();
  const id = getRequiredString(formData, "id");

  const inUse = await prisma.event.findFirst({ where: { eventTypeId: id } });
  if (inUse) throw new Error("Cannot delete: event type is in use.");

  await prisma.eventType.delete({ where: { id } });
  revalidatePath("/events");
}

// ────────────────────────────────────────────────────────────────────────────
// Event CRUD (admin only)
// ────────────────────────────────────────────────────────────────────────────

function datesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  current.setUTCHours(0, 0, 0, 0);
  const endNorm = new Date(end);
  endNorm.setUTCHours(0, 0, 0, 0);
  while (current <= endNorm) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export async function createEventAction(formData: FormData) {
  await requireAdmin();

  const editionId = await getActiveEditionId();
  const eventTypeId = getRequiredString(formData, "eventTypeId");
  const name = getRequiredString(formData, "name");
  const startDate = new Date(getRequiredString(formData, "startDate"));
  const endDate = new Date(getRequiredString(formData, "endDate"));
  const costCenterId = String(formData.get("costCenterId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid dates.");
  }
  if (endDate < startDate) throw new Error("End date must be after start date.");

  const event = await prisma.event.create({
    data: { editionId, eventTypeId, costCenterId, name, startDate, endDate, notes },
  });

  const days = datesInRange(startDate, endDate);
  await prisma.eventDay.createMany({
    data: days.map((date) => ({ eventId: event.id, date })),
  });

  revalidatePath("/events");
}

export async function updateEventAction(formData: FormData) {
  await requireAdmin();

  const id = getRequiredString(formData, "id");
  const name = getRequiredString(formData, "name");
  const startDate = new Date(getRequiredString(formData, "startDate"));
  const endDate = new Date(getRequiredString(formData, "endDate"));
  const costCenterId = String(formData.get("costCenterId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid dates.");
  }
  if (endDate < startDate) throw new Error("End date must be after start date.");

  await prisma.event.update({ where: { id }, data: { name, startDate, endDate, costCenterId, notes } });

  // Reconcile event days: add new, remove gone, keep existing (preserve isOff)
  const existingDays = await prisma.eventDay.findMany({ where: { eventId: id }, select: { id: true, date: true } });
  const targetDates = datesInRange(startDate, endDate).map((d) => d.toISOString().slice(0, 10));
  const existingDates = existingDays.map((d) => new Date(d.date).toISOString().slice(0, 10));

  const toAddDates = targetDates.filter((d) => !existingDates.includes(d));
  const toRemoveIds = existingDays
    .filter((d) => !targetDates.includes(new Date(d.date).toISOString().slice(0, 10)))
    .map((d) => d.id);

  await Promise.all([
    toAddDates.length > 0
      ? prisma.eventDay.createMany({
          data: toAddDates.map((date) => ({ eventId: id, date: new Date(date) })),
        })
      : Promise.resolve(),
    toRemoveIds.length > 0
      ? prisma.eventDay.deleteMany({ where: { id: { in: toRemoveIds } } })
      : Promise.resolve(),
  ]);

  revalidatePath("/events");
}

export async function deleteEventAction(formData: FormData) {
  await requireAdmin();
  const id = getRequiredString(formData, "id");
  await prisma.event.delete({ where: { id } });
  revalidatePath("/events");
}

// ────────────────────────────────────────────────────────────────────────────
// EventDay
// ────────────────────────────────────────────────────────────────────────────

export async function toggleEventDayOffAction(formData: FormData) {
  await requireAdmin();
  const id = getRequiredString(formData, "id");
  const current = await prisma.eventDay.findUniqueOrThrow({ where: { id }, select: { isOff: true } });
  await prisma.eventDay.update({ where: { id }, data: { isOff: !current.isOff } });
  revalidatePath("/events");
}

// ────────────────────────────────────────────────────────────────────────────
// EventShift CRUD (admin only)
// ────────────────────────────────────────────────────────────────────────────

export async function addShiftAction(formData: FormData) {
  await requireAdmin();
  const eventDayId = getRequiredString(formData, "eventDayId");
  const startTime = getRequiredString(formData, "startTime");
  const endTime = getRequiredString(formData, "endTime");
  const role = getRequiredString(formData, "role");
  const capacity = Math.max(1, parseInt(String(formData.get("capacity") ?? "1"), 10));

  await prisma.eventShift.create({ data: { eventDayId, startTime, endTime, role, capacity } });
  revalidatePath("/events");
}

export async function updateShiftAction(formData: FormData) {
  await requireAdmin();
  const id = getRequiredString(formData, "id");
  const startTime = getRequiredString(formData, "startTime");
  const endTime = getRequiredString(formData, "endTime");
  const role = getRequiredString(formData, "role");
  const capacity = Math.max(1, parseInt(String(formData.get("capacity") ?? "1"), 10));

  await prisma.eventShift.update({ where: { id }, data: { startTime, endTime, role, capacity } });
  revalidatePath("/events");
}

export async function deleteShiftAction(formData: FormData) {
  await requireAdmin();
  const id = getRequiredString(formData, "id");
  await prisma.eventShift.delete({ where: { id } });
  revalidatePath("/events");
}

// ────────────────────────────────────────────────────────────────────────────
// Staff assignments (self-service + admin can assign)
// ────────────────────────────────────────────────────────────────────────────

export async function signUpForShiftAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const shiftId = getRequiredString(formData, "shiftId");

  const shift = await prisma.eventShift.findUniqueOrThrow({
    where: { id: shiftId },
    include: {
      assignments: true,
      eventDay: { include: { event: { select: { name: true } } } },
    },
  });

  if (shift.assignments.length >= shift.capacity) {
    throw new Error("This shift is already at full capacity.");
  }

  const existing = shift.assignments.find((a) => a.userId === access.id);
  if (existing) return; // already signed up, idempotent

  const assignment = await prisma.staffAssignment.create({
    data: { shiftId, userId: access.id },
  });

  const eventName = shift.eventDay.event.name;
  const dayDate = new Date(shift.eventDay.date).toISOString().slice(0, 10);
  const dueDate = new Date(`${dayDate}T${shift.startTime}:00`);

  await createUserTask({
    type: TaskType.STAFF_SHIFT,
    title: `Shift: ${eventName} — ${shift.role ?? "General"} (${dayDate} ${shift.startTime}–${shift.endTime})`,
    userId: access.id,
    staffAssignmentId: assignment.id,
    dueDate: Number.isNaN(dueDate.getTime()) ? undefined : dueDate,
  });

  revalidatePath("/events");
  revalidatePath("/tasks");
}

export async function withdrawFromShiftAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const shiftId = getRequiredString(formData, "shiftId");
  // Admin can also remove someone else
  const targetUserId = String(formData.get("userId") ?? "").trim() || access.id;

  if (targetUserId !== access.id && access.role !== "ADMIN") {
    throw new Error("Only admins can remove other users from shifts.");
  }

  const assignment = await prisma.staffAssignment.findFirst({
    where: { shiftId, userId: targetUserId },
  });
  if (!assignment) return;

  // Resolve the associated STAFF_SHIFT task if it exists
  const task = await prisma.task.findFirst({ where: { staffAssignmentId: assignment.id } });
  if (task) {
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "DONE", resolvedById: access.id, resolvedAt: new Date() },
    });
  }

  await prisma.staffAssignment.delete({ where: { id: assignment.id } });

  revalidatePath("/events");
  revalidatePath("/tasks");
}

export async function adminAssignUserToShiftAction(formData: FormData) {
  await requireAdmin();
  const shiftId = getRequiredString(formData, "shiftId");
  const userId = getRequiredString(formData, "userId");

  const shift = await prisma.eventShift.findUniqueOrThrow({
    where: { id: shiftId },
    include: {
      assignments: true,
      eventDay: { include: { event: { select: { name: true } } } },
    },
  });

  if (shift.assignments.length >= shift.capacity) {
    throw new Error("This shift is already at full capacity.");
  }

  const existing = shift.assignments.find((a) => a.userId === userId);
  if (existing) return;

  const assignment = await prisma.staffAssignment.create({ data: { shiftId, userId } });

  const eventName = shift.eventDay.event.name;
  const dayDate = new Date(shift.eventDay.date).toISOString().slice(0, 10);
  const dueDate = new Date(`${dayDate}T${shift.startTime}:00`);

  await createUserTask({
    type: TaskType.STAFF_SHIFT,
    title: `Shift: ${eventName} — ${shift.role ?? "General"} (${dayDate} ${shift.startTime}–${shift.endTime})`,
    userId,
    staffAssignmentId: assignment.id,
    dueDate: Number.isNaN(dueDate.getTime()) ? undefined : dueDate,
  });

  revalidatePath("/events");
  revalidatePath("/tasks");
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function getActiveEditionId(): Promise<string> {
  const edition = await prisma.edition.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!edition) throw new Error("No active edition.");
  return edition.id;
}
