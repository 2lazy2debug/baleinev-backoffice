"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserAccess, requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { createUserTask } from "@/lib/tasks";
import { EventStaffAction, TaskStatus, TaskType, type Prisma } from "@prisma/client";
import { requireWritableEdition, resolveWritableEditionId } from "@/lib/edition-context";
import { isEventExpired } from "@/lib/events";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";

// Everything below an event belongs to the event's edition, so the read-only
// guard has to walk back up to it. Event types are the exception: they are
// global, carry no `editionId`, and stay writable in a closed edition.

async function requireWritableEvent(eventId: string): Promise<string> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { editionId: true },
  });

  if (!event) {
    throw new Error("Event not found.");
  }

  await requireWritableEdition(event.editionId);
  return event.editionId;
}

/**
 * Defense in depth against the client-side bounds check: an event's dates
 * must fall inside its edition's dates, whenever the edition has them set.
 * An edition without dates imposes no bound.
 */
async function assertEventDatesWithinEdition(editionId: string, startDate: Date, endDate: Date) {
  const edition = await prisma.edition.findUniqueOrThrow({
    where: { id: editionId },
    select: { startDate: true, endDate: true },
  });

  if (edition.startDate && startDate < edition.startDate) {
    throw new Error("Event start date is before the edition's start date.");
  }
  if (edition.endDate && endDate > edition.endDate) {
    throw new Error("Event end date is after the edition's end date.");
  }
}

async function requireWritableEventDay(eventDayId: string) {
  const eventDay = await prisma.eventDay.findUnique({
    where: { id: eventDayId },
    select: { event: { select: { editionId: true } } },
  });

  if (!eventDay) {
    throw new Error("Event day not found.");
  }

  await requireWritableEdition(eventDay.event.editionId);
}

/**
 * A STAFF_SHIFT task carries the shift in its title and due date, so the three
 * places that write one — sign-up, admin assign, and editing the shift itself —
 * have to spell it the same way.
 */
function staffShiftTaskFields({
  eventName,
  dayDate,
  role,
  startTime,
  endTime,
}: {
  eventName: string;
  dayDate: Date | string;
  role: string | null;
  startTime: string | null;
  endTime: string | null;
}) {
  const date = new Date(dayDate).toISOString().slice(0, 10);

  if (!startTime || !endTime) {
    return { title: `Shift: ${eventName} — ${role ?? "General"} (${date})`, dueDate: undefined };
  }

  const dueDate = new Date(`${date}T${startTime}:00`);

  return {
    title: `Shift: ${eventName} — ${role ?? "General"} (${date} ${startTime}–${endTime})`,
    dueDate: Number.isNaN(dueDate.getTime()) ? undefined : dueDate,
  };
}

async function requireWritableShift(shiftId: string) {
  const shift = await prisma.eventShift.findUnique({
    where: { id: shiftId },
    select: { eventDay: { select: { event: { select: { editionId: true } } } } },
  });

  if (!shift) {
    throw new Error("Shift not found.");
  }

  await requireWritableEdition(shift.eventDay.event.editionId);
}

/**
 * A finished event stops taking signups and withdrawals — joining or leaving
 * a shift that already happened. Refuses server-side what the UI already
 * hides, so a stale tab can't sign up after the client stopped offering it.
 */
async function assertEventNotExpired(shiftId: string) {
  const shift = await prisma.eventShift.findUniqueOrThrow({
    where: { id: shiftId },
    select: {
      eventDay: {
        select: {
          event: {
            select: {
              endDate: true,
              days: {
                select: {
                  date: true,
                  isOff: true,
                  shifts: { select: { startTime: true, endTime: true, noTime: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (isEventExpired(shift.eventDay.event)) {
    throw new Error("This event has already ended.");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Event type CRUD (admin only, global — not edition-scoped)
// ────────────────────────────────────────────────────────────────────────────

export async function createEventTypeAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const name = getRequiredString(formData, "name");
    const description = String(formData.get("description") ?? "").trim() || null;
    const color = String(formData.get("color") ?? "").trim() || null;

    await prisma.eventType.create({ data: { name, description, color } });
    revalidatePath("/events");
    revalidatePath("/events/settings");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateEventTypeAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredString(formData, "id");
    const name = getRequiredString(formData, "name");
    const description = String(formData.get("description") ?? "").trim() || null;
    const color = String(formData.get("color") ?? "").trim() || null;

    await prisma.eventType.update({ where: { id }, data: { name, description, color } });
    revalidatePath("/events");
    revalidatePath("/events/settings");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteEventTypeAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredString(formData, "id");

    const inUse = await prisma.event.findFirst({ where: { eventTypeId: id } });
    if (inUse) throw new Error("Cannot delete: event type is in use.");

    await prisma.eventType.delete({ where: { id } });
    revalidatePath("/events");
    revalidatePath("/events/settings");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
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

export async function createEventAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    const editionId = await resolveWritableEditionId();
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
    await assertEventDatesWithinEdition(editionId, startDate, endDate);

    const event = await prisma.event.create({
      data: { editionId, eventTypeId, costCenterId, name, startDate, endDate, notes },
    });

    const days = datesInRange(startDate, endDate);
    await prisma.eventDay.createMany({
      data: days.map((date) => ({ eventId: event.id, date })),
    });

    revalidatePath("/events");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateEventAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
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

    const editionId = await requireWritableEvent(id);
    await assertEventDatesWithinEdition(editionId, startDate, endDate);

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
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * The event's info page — free-form Markdown behind the header's info button.
 *
 * Admin-only and edition-writable like every other write on an event, and
 * empty is a legitimate value: clearing the box puts the event back to having
 * no information rather than storing a blank page.
 */
export async function updateEventInfoAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredString(formData, "id");
    await requireWritableEvent(id);

    const info = String(formData.get("info") ?? "").trim() || null;
    await prisma.event.update({ where: { id }, data: { info } });

    revalidatePath("/events");
    return { error: null, saved: true };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteEventAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredString(formData, "id");
    await requireWritableEvent(id);
    await prisma.event.delete({ where: { id } });
    revalidatePath("/events");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EventDay
// ────────────────────────────────────────────────────────────────────────────

export async function toggleEventDayOffAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredString(formData, "id");
    await requireWritableEventDay(id);
    const current = await prisma.eventDay.findUniqueOrThrow({ where: { id }, select: { isOff: true } });
    await prisma.eventDay.update({ where: { id }, data: { isOff: !current.isOff } });
    revalidatePath("/events");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Copy every shift of one day onto one or more other days of the same event.
 * The staffing schema of a day is often the same across an event, and retyping
 * it is the tedious part. The copies are independent rows — no assignments come
 * across, and editing one later leaves the others alone.
 */
export async function duplicateEventDayShiftsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdmin();
    const sourceDayId = getRequiredString(formData, "sourceDayId");
    const targetDayIds = [...new Set(formData.getAll("targetDayIds").map(String).filter(Boolean))];

    if (targetDayIds.length === 0) {
      throw new Error("Pick at least one day to copy the shifts to.");
    }

    await requireWritableEventDay(sourceDayId);

    const source = await prisma.eventDay.findUniqueOrThrow({
      where: { id: sourceDayId },
      include: { shifts: { orderBy: { startTime: "asc" } } },
    });

    if (source.shifts.length === 0) {
      throw new Error("This day has no shifts to copy.");
    }

    // A target has to be another active day of the same event — a day off or a
    // day from another event is silently dropped rather than copied onto.
    const targets = await prisma.eventDay.findMany({
      where: {
        id: { in: targetDayIds },
        eventId: source.eventId,
        isOff: false,
        NOT: { id: sourceDayId },
      },
      select: { id: true },
    });

    if (targets.length === 0) {
      throw new Error("None of the selected days can receive a copy.");
    }

    await prisma.eventShift.createMany({
      data: targets.flatMap((target) =>
        source.shifts.map((shift) => ({
          eventDayId: target.id,
          startTime: shift.startTime,
          endTime: shift.endTime,
          noTime: shift.noTime,
          role: shift.role,
          capacity: shift.capacity,
        })),
      ),
    });

    revalidatePath("/events");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EventShift CRUD (admin only)
// ────────────────────────────────────────────────────────────────────────────

/** True once a "HH:MM" string lands on `:00`, `:15`, `:30` or `:45`. */
function isQuarterHour(time: string): boolean {
  const minutes = Number(time.split(":")[1]);
  return Number.isFinite(minutes) && minutes % 15 === 0;
}

/** Reads the shared start/end/noTime fields, refusing a half-timed, backwards or off-grid shift. */
function readShiftTimeFields(formData: FormData): { startTime: string | null; endTime: string | null; noTime: boolean } {
  const noTime = String(formData.get("noTime") ?? "") === "on";
  const startTimeRaw = String(formData.get("startTime") ?? "").trim();
  const endTimeRaw = String(formData.get("endTime") ?? "").trim();

  if (noTime) {
    return { startTime: null, endTime: null, noTime: true };
  }

  if (!startTimeRaw || !endTimeRaw) {
    throw new Error("A shift needs both a start and an end time, unless it has no fixed time.");
  }
  if (endTimeRaw <= startTimeRaw) {
    throw new Error("A shift must end after it starts.");
  }
  if (!isQuarterHour(startTimeRaw) || !isQuarterHour(endTimeRaw)) {
    throw new Error("Shift times must land on the quarter hour — :00, :15, :30 or :45.");
  }

  return { startTime: startTimeRaw, endTime: endTimeRaw, noTime: false };
}

export async function addShiftAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const eventDayId = getRequiredString(formData, "eventDayId");
    const { startTime, endTime, noTime } = readShiftTimeFields(formData);
    const role = getRequiredString(formData, "role");
    const capacity = Math.max(1, parseInt(String(formData.get("capacity") ?? "1"), 10));

    await requireWritableEventDay(eventDayId);

    await prisma.eventShift.create({ data: { eventDayId, startTime, endTime, noTime, role, capacity } });
    revalidatePath("/events");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateShiftAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredString(formData, "id");
    const { startTime, endTime, noTime } = readShiftTimeFields(formData);
    const role = getRequiredString(formData, "role");
    const capacity = Math.max(1, parseInt(String(formData.get("capacity") ?? "1"), 10));

    await requireWritableShift(id);

    const shift = await prisma.eventShift.findUniqueOrThrow({
      where: { id },
      include: {
        assignments: { select: { id: true } },
        eventDay: { select: { date: true, event: { select: { name: true } } } },
      },
    });

    // Editing must not leave a shift over its own capacity: staff already on it
    // are removed by hand first, not silently overbooked.
    if (capacity < shift.assignments.length) {
      throw new Error(
        `This shift already has ${shift.assignments.length} people assigned. Remove someone before lowering the capacity.`
      );
    }

    await prisma.eventShift.update({ where: { id }, data: { startTime, endTime, noTime, role, capacity } });

    // The staffing tasks quote the shift's role and hours, so a move has to
    // carry over to them — a pending task pointing at the old slot is wrong.
    const assignmentIds = shift.assignments.map((assignment) => assignment.id);
    if (assignmentIds.length > 0) {
      const { title, dueDate } = staffShiftTaskFields({
        eventName: shift.eventDay.event.name,
        dayDate: shift.eventDay.date,
        role,
        startTime,
        endTime,
      });

      await prisma.task.updateMany({
        where: { staffAssignmentId: { in: assignmentIds }, status: TaskStatus.PENDING },
        data: { title, dueDate: dueDate ?? null },
      });
      revalidatePath("/tasks");
    }

    revalidatePath("/events");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteShiftAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredString(formData, "id");
    await requireWritableShift(id);
    await prisma.eventShift.delete({ where: { id } });
    revalidatePath("/events");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

const shiftLabelDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** The `EventStaffLog.shiftLabel` snapshot: "Sat 12 Apr · 18:00–22:00 · Bar". */
function shiftLabelFor(shift: {
  startTime: string | null;
  endTime: string | null;
  noTime: boolean;
  role: string | null;
  eventDay: { date: Date };
}): string {
  const date = shiftLabelDateFormatter.format(shift.eventDay.date);
  const time = shift.noTime ? "No fixed time" : `${shift.startTime}–${shift.endTime}`;
  return `${date} · ${time} · ${shift.role ?? "General"}`;
}

/**
 * One row in the staffing log. Written in the same transaction as the
 * assignment write it records, so the log never drifts from what actually
 * happened.
 */
async function writeStaffLog(
  tx: Prisma.TransactionClient,
  params: {
    action: EventStaffAction;
    shift: {
      id: string;
      startTime: string | null;
      endTime: string | null;
      noTime: boolean;
      role: string | null;
      eventDay: { date: Date; event: { id: string; name: string } };
    };
    actorId: string;
    actorName: string;
    subjectId: string;
    subjectName: string;
  },
) {
  await tx.eventStaffLog.create({
    data: {
      eventId: params.shift.eventDay.event.id,
      shiftId: params.shift.id,
      actorId: params.actorId,
      subjectId: params.subjectId,
      action: params.action,
      eventName: params.shift.eventDay.event.name,
      shiftLabel: shiftLabelFor(params.shift),
      actorName: params.actorName,
      subjectName: params.subjectName,
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Staff assignments (self-service + admin can assign)
// ────────────────────────────────────────────────────────────────────────────

export async function signUpForShiftAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const shiftId = getRequiredString(formData, "shiftId");

    await requireWritableShift(shiftId);
    await assertEventNotExpired(shiftId);

    const shift = await prisma.eventShift.findUniqueOrThrow({
      where: { id: shiftId },
      include: {
        assignments: true,
        eventDay: { include: { event: { select: { id: true, name: true } } } },
      },
    });

    if (shift.assignments.length >= shift.capacity) {
      throw new Error("This shift is already at full capacity.");
    }

    const existing = shift.assignments.find((a) => a.userId === access.id);
    if (existing) return { error: null }; // already signed up, idempotent

    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.staffAssignment.create({
        data: { shiftId, userId: access.id },
      });
      await writeStaffLog(tx, {
        action: EventStaffAction.SIGNUP,
        shift,
        actorId: access.id,
        actorName: access.userName,
        subjectId: access.id,
        subjectName: access.userName,
      });
      return created;
    });

    await createUserTask({
      type: TaskType.STAFF_SHIFT,
      ...staffShiftTaskFields({
        eventName: shift.eventDay.event.name,
        dayDate: shift.eventDay.date,
        role: shift.role,
        startTime: shift.startTime,
        endTime: shift.endTime,
      }),
      userId: access.id,
      staffAssignmentId: assignment.id,
    });

    revalidatePath("/events");
    revalidatePath("/tasks");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function withdrawFromShiftAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await getCurrentUserAccess();
    const shiftId = getRequiredString(formData, "shiftId");
    // Admin can also remove someone else
    const targetUserId = String(formData.get("userId") ?? "").trim() || access.id;

    if (targetUserId !== access.id && access.role !== "ADMIN") {
      throw new Error("Only admins can remove other users from shifts.");
    }

    await requireWritableShift(shiftId);
    // Leaving a shift is locked once the event is over; an admin removing
    // someone else is corrective bookkeeping, not "leaving", so it stays open.
    if (targetUserId === access.id) {
      await assertEventNotExpired(shiftId);
    }

    const shift = await prisma.eventShift.findUniqueOrThrow({
      where: { id: shiftId },
      include: {
        assignments: { include: { user: { select: { name: true } } } },
        eventDay: { include: { event: { select: { id: true, name: true } } } },
      },
    });

    const assignment = shift.assignments.find((a) => a.userId === targetUserId);
    if (!assignment) return { error: null };

    // Resolve the associated STAFF_SHIFT task if it exists
    const task = await prisma.task.findFirst({ where: { staffAssignmentId: assignment.id } });
    if (task) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "DONE", resolvedById: access.id, resolvedAt: new Date() },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.staffAssignment.delete({ where: { id: assignment.id } });
      await writeStaffLog(tx, {
        action: targetUserId === access.id ? EventStaffAction.WITHDRAW : EventStaffAction.UNASSIGN,
        shift,
        actorId: access.id,
        actorName: access.userName,
        subjectId: targetUserId,
        subjectName: assignment.user.name,
      });
    });

    revalidatePath("/events");
    revalidatePath("/tasks");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function adminAssignUserToShiftAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await requireAdmin();
    const shiftId = getRequiredString(formData, "shiftId");
    const userId = getRequiredString(formData, "userId");

    await requireWritableShift(shiftId);

    const shift = await prisma.eventShift.findUniqueOrThrow({
      where: { id: shiftId },
      include: {
        assignments: true,
        eventDay: { include: { event: { select: { id: true, name: true } } } },
      },
    });

    if (shift.assignments.length >= shift.capacity) {
      throw new Error("This shift is already at full capacity.");
    }

    const existing = shift.assignments.find((a) => a.userId === userId);
    if (existing) return { error: null };

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });

    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.staffAssignment.create({ data: { shiftId, userId } });
      await writeStaffLog(tx, {
        action: EventStaffAction.ASSIGN,
        shift,
        actorId: access.id,
        actorName: access.userName,
        subjectId: userId,
        subjectName: user.name,
      });
      return created;
    });

    await createUserTask({
      type: TaskType.STAFF_SHIFT,
      ...staffShiftTaskFields({
        eventName: shift.eventDay.event.name,
        dayDate: shift.eventDay.date,
        role: shift.role,
        startTime: shift.startTime,
        endTime: shift.endTime,
      }),
      userId,
      staffAssignmentId: assignment.id,
    });

    revalidatePath("/events");
    revalidatePath("/tasks");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
