import { beforeEach, describe, expect, it, vi } from "vitest";

// addShiftAction / updateShiftAction answer to the same two guards as every
// other write under an event: admin, and an edition that is still open.
const requireAdmin = vi.fn();
const requireWritableEdition = vi.fn();
const revalidatePath = vi.fn();
const prisma = {
  eventDay: { findUnique: vi.fn() },
  eventShift: { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  task: { updateMany: vi.fn() },
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({
  requireAdmin: () => requireAdmin(),
  getCurrentUserAccess: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/tasks", () => ({ createUserTask: vi.fn() }));
vi.mock("@/lib/edition-context", () => ({
  requireWritableEdition: (...a: unknown[]) => requireWritableEdition(...a),
  resolveWritableEditionId: vi.fn(),
}));

const { addShiftAction, updateShiftAction } = await import("./actions");

function addForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("eventDayId", "day_1");
  fd.set("role", "Bar");
  fd.set("capacity", "2");
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }
  return fd;
}

function updateForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("id", "shift_1");
  fd.set("role", "Bar");
  fd.set("capacity", "2");
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "admin_1", role: "ADMIN" });
  requireWritableEdition.mockResolvedValue(undefined);
  prisma.eventDay.findUnique.mockResolvedValue({ event: { editionId: "edition_1" } });
  prisma.eventShift.create.mockResolvedValue({ id: "shift_1" });
  prisma.eventShift.findUnique.mockResolvedValue({ eventDay: { event: { editionId: "edition_1" } } });
  prisma.eventShift.findUniqueOrThrow.mockResolvedValue({
    assignments: [],
    eventDay: { date: new Date("2026-06-01"), event: { name: "Festival" } },
  });
  prisma.eventShift.update.mockResolvedValue({ id: "shift_1" });
});

describe("addShiftAction", () => {
  it("accepts a timeless shift with no times at all", async () => {
    const result = await addShiftAction({ error: null }, addForm({ noTime: "on" }));
    expect(result).toEqual({ error: null });
    expect(prisma.eventShift.create.mock.calls[0][0].data).toMatchObject({
      startTime: null,
      endTime: null,
      noTime: true,
    });
  });

  it("refuses a timed shift missing an end time", async () => {
    const result = await addShiftAction({ error: null }, addForm({ startTime: "08:00" }));
    expect(result).toEqual({
      error: "A shift needs both a start and an end time, unless it has no fixed time.",
    });
    expect(prisma.eventShift.create).not.toHaveBeenCalled();
  });

  it("refuses a timed shift missing a start time", async () => {
    const result = await addShiftAction({ error: null }, addForm({ endTime: "16:00" }));
    expect(result).toEqual({
      error: "A shift needs both a start and an end time, unless it has no fixed time.",
    });
    expect(prisma.eventShift.create).not.toHaveBeenCalled();
  });

  it("refuses a shift that ends before it starts", async () => {
    const result = await addShiftAction(
      { error: null },
      addForm({ startTime: "16:00", endTime: "08:00" }),
    );
    expect(result).toEqual({ error: "A shift must end after it starts." });
    expect(prisma.eventShift.create).not.toHaveBeenCalled();
  });

  it("accepts a normal timed shift", async () => {
    const result = await addShiftAction(
      { error: null },
      addForm({ startTime: "08:00", endTime: "16:00" }),
    );
    expect(result).toEqual({ error: null });
    expect(prisma.eventShift.create.mock.calls[0][0].data).toMatchObject({
      startTime: "08:00",
      endTime: "16:00",
      noTime: false,
    });
  });
});

describe("updateShiftAction", () => {
  it("accepts turning a shift timeless", async () => {
    const result = await updateShiftAction({ error: null }, updateForm({ noTime: "on" }));
    expect(result).toEqual({ error: null });
    expect(prisma.eventShift.update.mock.calls[0][0].data).toMatchObject({
      startTime: null,
      endTime: null,
      noTime: true,
    });
  });

  it("refuses a timed shift missing a time", async () => {
    const result = await updateShiftAction({ error: null }, updateForm({ startTime: "08:00" }));
    expect(result).toEqual({
      error: "A shift needs both a start and an end time, unless it has no fixed time.",
    });
    expect(prisma.eventShift.update).not.toHaveBeenCalled();
  });
});
