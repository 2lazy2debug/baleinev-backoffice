import { beforeEach, describe, expect, it, vi } from "vitest";

// The two unavailability actions and the deleteMany they trigger inside
// signUpForShiftAction / adminAssignUserToShiftAction. Same mock shape as
// staffing-actions.test.ts — this file covers the decline side of it.
const getCurrentUserAccess = vi.fn();
const requireAdmin = vi.fn();
const requireWritableEdition = vi.fn();
const resolveWritableEditionId = vi.fn();
const createUserTask = vi.fn();
const revalidatePath = vi.fn();

const tx = {
  staffAssignment: { create: vi.fn(), delete: vi.fn() },
  shiftUnavailability: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() },
  eventStaffLog: { create: vi.fn() },
};

const prisma = {
  eventShift: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  user: { findUniqueOrThrow: vi.fn() },
  task: { findFirst: vi.fn(), update: vi.fn() },
  shiftUnavailability: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() },
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

const {
  markUnavailableForShiftAction,
  clearUnavailableForShiftAction,
  signUpForShiftAction,
  adminAssignUserToShiftAction,
} = await import("./actions");

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

function shiftForm(): FormData {
  const fd = new FormData();
  fd.set("shiftId", "shift_1");
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
  prisma.shiftUnavailability.findUnique.mockResolvedValue(null);
  tx.staffAssignment.create.mockResolvedValue({ id: "assignment_1" });
});

describe("markUnavailableForShiftAction", () => {
  it("creates the row and logs UNAVAILABLE in the same transaction", async () => {
    const result = await markUnavailableForShiftAction({ error: null }, shiftForm());

    expect(result).toEqual({ error: null });
    expect(tx.shiftUnavailability.create).toHaveBeenCalledWith({ data: { shiftId: "shift_1", userId: "user_1" } });
    expect(tx.eventStaffLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event_1",
        shiftId: "shift_1",
        actorId: "user_1",
        subjectId: "user_1",
        action: "UNAVAILABLE",
        actorName: "Alex",
        subjectName: "Alex",
      }),
    });
  });

  it("refuses while assigned, and writes nothing", async () => {
    prisma.eventShift.findUniqueOrThrow.mockResolvedValue(
      shiftFixture({ assignments: [{ id: "a_1", userId: "user_1" }] }),
    );

    const result = await markUnavailableForShiftAction({ error: null }, shiftForm());

    expect(result).toEqual({ error: "Withdraw from this shift first." });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is idempotent — a second call creates nothing", async () => {
    prisma.shiftUnavailability.findUnique.mockResolvedValue({ id: "unavail_1" });

    const result = await markUnavailableForShiftAction({ error: null }, shiftForm());

    expect(result).toEqual({ error: null });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.shiftUnavailability.create).not.toHaveBeenCalled();
  });
});

describe("clearUnavailableForShiftAction", () => {
  it("deletes the row and logs AVAILABLE", async () => {
    prisma.shiftUnavailability.findUnique.mockResolvedValue({ id: "unavail_1" });

    const result = await clearUnavailableForShiftAction({ error: null }, shiftForm());

    expect(result).toEqual({ error: null });
    expect(tx.shiftUnavailability.delete).toHaveBeenCalledWith({ where: { id: "unavail_1" } });
    expect(tx.eventStaffLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user_1",
        subjectId: "user_1",
        action: "AVAILABLE",
        actorName: "Alex",
        subjectName: "Alex",
      }),
    });
  });

  it("is idempotent when there is no row to clear", async () => {
    const result = await clearUnavailableForShiftAction({ error: null }, shiftForm());

    expect(result).toEqual({ error: null });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("signing up clears an earlier decline", () => {
  it("calls shiftUnavailability.deleteMany and still logs exactly one row, SIGNUP", async () => {
    const result = await signUpForShiftAction({ error: null }, shiftForm());

    expect(result).toEqual({ error: null });
    expect(tx.shiftUnavailability.deleteMany).toHaveBeenCalledWith({
      where: { shiftId: "shift_1", userId: "user_1" },
    });
    expect(tx.eventStaffLog.create).toHaveBeenCalledTimes(1);
    expect(tx.eventStaffLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "SIGNUP" }),
    });
  });
});

describe("admin assigning clears an earlier decline", () => {
  it("calls shiftUnavailability.deleteMany and still logs exactly one row, ASSIGN", async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ name: "Jamie" });

    const result = await adminAssignUserToShiftAction({ error: null }, assignForm("user_2"));

    expect(result).toEqual({ error: null });
    expect(tx.shiftUnavailability.deleteMany).toHaveBeenCalledWith({
      where: { shiftId: "shift_1", userId: "user_2" },
    });
    expect(tx.eventStaffLog.create).toHaveBeenCalledTimes(1);
    expect(tx.eventStaffLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "ASSIGN" }),
    });
  });
});
