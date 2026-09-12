import { beforeEach, describe, expect, it, vi } from "vitest";

// The staffing four (signup / withdraw / admin assign / the admin removal
// inside withdraw) each write an EventStaffLog row in the same transaction as
// the StaffAssignment write. These tests cover that logging, not the
// capacity/guard rules already covered elsewhere.
const getCurrentUserAccess = vi.fn();
const requireAdmin = vi.fn();
const requireWritableEdition = vi.fn();
const resolveWritableEditionId = vi.fn();
const createUserTask = vi.fn();
const revalidatePath = vi.fn();

const tx = {
  staffAssignment: { create: vi.fn(), delete: vi.fn() },
  eventStaffLog: { create: vi.fn() },
};

const prisma = {
  eventShift: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  user: { findUniqueOrThrow: vi.fn() },
  task: { findFirst: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({
  getCurrentUserAccess: () => getCurrentUserAccess(),
  requireAdmin: () => requireAdmin(),
}));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/tasks", () => ({ createUserTask: (...a: unknown[]) => createUserTask(...a) }));
vi.mock("@/lib/edition-context", () => ({
  requireWritableEdition: (...a: unknown[]) => requireWritableEdition(...a),
  resolveWritableEditionId: (...a: unknown[]) => resolveWritableEditionId(...a),
}));

const { signUpForShiftAction, withdrawFromShiftAction, adminAssignUserToShiftAction } = await import("./actions");

// Far in the future, so `isEventExpired` never trips inside these tests.
const DAY = new Date("2099-04-12T00:00:00.000Z");

function shiftFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "shift_1",
    startTime: "18:00",
    endTime: "22:00",
    noTime: false,
    role: "Bar",
    capacity: 2,
    assignments: [] as { id: string; userId: string; user?: { name: string } }[],
    eventDay: {
      date: DAY,
      isOff: false,
      event: {
        id: "event_1",
        name: "Spring Fest",
        endDate: DAY,
        days: [{ date: DAY, isOff: false, shifts: [{ startTime: "18:00", endTime: "22:00", noTime: false }] }],
      },
    },
    ...overrides,
  };
}

function signUpForm(): FormData {
  const fd = new FormData();
  fd.set("shiftId", "shift_1");
  return fd;
}

function withdrawForm(userId?: string): FormData {
  const fd = new FormData();
  fd.set("shiftId", "shift_1");
  if (userId) fd.set("userId", userId);
  return fd;
}

function assignForm(userId: string): FormData {
  const fd = new FormData();
  fd.set("shiftId", "shift_1");
  fd.set("userId", userId);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserAccess.mockResolvedValue({ id: "user_1", userName: "Alex", role: "DEPARTMENT" });
  requireAdmin.mockResolvedValue({ id: "admin_1", userName: "Admin", role: "ADMIN" });
  requireWritableEdition.mockResolvedValue(undefined);
  prisma.eventShift.findUnique.mockResolvedValue({ eventDay: { event: { editionId: "ed_1" } } });
  prisma.eventShift.findUniqueOrThrow.mockResolvedValue(shiftFixture());
  prisma.task.findFirst.mockResolvedValue(null);
  tx.staffAssignment.create.mockResolvedValue({ id: "assignment_1" });
});

describe("signUpForShiftAction", () => {
  it("logs a SIGNUP with the signer as both actor and subject", async () => {
    const result = await signUpForShiftAction({ error: null }, signUpForm());

    expect(result).toEqual({ error: null });
    expect(tx.staffAssignment.create).toHaveBeenCalledWith({ data: { shiftId: "shift_1", userId: "user_1" } });
    expect(tx.eventStaffLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event_1",
        shiftId: "shift_1",
        actorId: "user_1",
        subjectId: "user_1",
        action: "SIGNUP",
        eventName: "Spring Fest",
        actorName: "Alex",
        subjectName: "Alex",
      }),
    });
  });

  it("does not log an already-signed-up no-op", async () => {
    prisma.eventShift.findUniqueOrThrow.mockResolvedValue(
      shiftFixture({ assignments: [{ id: "a_1", userId: "user_1" }] }),
    );

    await signUpForShiftAction({ error: null }, signUpForm());

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.eventStaffLog.create).not.toHaveBeenCalled();
  });
});

describe("withdrawFromShiftAction", () => {
  it("logs a WITHDRAW when a user removes themself", async () => {
    prisma.eventShift.findUniqueOrThrow.mockResolvedValue(
      shiftFixture({ assignments: [{ id: "a_1", userId: "user_1", user: { name: "Alex" } }] }),
    );

    const result = await withdrawFromShiftAction({ error: null }, withdrawForm());

    expect(result).toEqual({ error: null });
    expect(tx.staffAssignment.delete).toHaveBeenCalledWith({ where: { id: "a_1" } });
    expect(tx.eventStaffLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user_1",
        subjectId: "user_1",
        action: "WITHDRAW",
        actorName: "Alex",
        subjectName: "Alex",
      }),
    });
  });

  it("logs an UNASSIGN when an admin removes someone else", async () => {
    getCurrentUserAccess.mockResolvedValue({ id: "admin_1", userName: "Admin", role: "ADMIN" });
    prisma.eventShift.findUniqueOrThrow.mockResolvedValue(
      shiftFixture({ assignments: [{ id: "a_1", userId: "user_2", user: { name: "Jamie" } }] }),
    );

    await withdrawFromShiftAction({ error: null }, withdrawForm("user_2"));

    expect(tx.eventStaffLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "admin_1",
        subjectId: "user_2",
        action: "UNASSIGN",
        actorName: "Admin",
        subjectName: "Jamie",
      }),
    });
  });

  it("refuses a non-admin removing someone else, and logs nothing", async () => {
    const result = await withdrawFromShiftAction({ error: null }, withdrawForm("user_2"));

    expect(result.error).toMatch(/only admins/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("adminAssignUserToShiftAction", () => {
  it("logs an ASSIGN with the admin as actor and the staffer as subject", async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ name: "Jamie" });

    const result = await adminAssignUserToShiftAction({ error: null }, assignForm("user_2"));

    expect(result).toEqual({ error: null });
    expect(tx.staffAssignment.create).toHaveBeenCalledWith({ data: { shiftId: "shift_1", userId: "user_2" } });
    expect(tx.eventStaffLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "admin_1",
        subjectId: "user_2",
        action: "ASSIGN",
        actorName: "Admin",
        subjectName: "Jamie",
      }),
    });
  });
});
