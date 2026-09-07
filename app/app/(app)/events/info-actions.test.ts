import { beforeEach, describe, expect, it, vi } from "vitest";

// `updateEventInfoAction` is a write on an event, so it answers to the same two
// guards as every other one: admin, and an edition that is still open.
const requireAdmin = vi.fn();
const requireWritableEdition = vi.fn();
const revalidatePath = vi.fn();
const prisma = {
  event: { findUnique: vi.fn(), update: vi.fn() },
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

const { updateEventInfoAction } = await import("./actions");

function form(info: string): FormData {
  const fd = new FormData();
  fd.set("id", "event_1");
  fd.set("info", info);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "admin_1", role: "ADMIN" });
  requireWritableEdition.mockResolvedValue(undefined);
  prisma.event.findUnique.mockResolvedValue({ editionId: "edition_1" });
  prisma.event.update.mockResolvedValue({ id: "event_1" });
});

describe("updateEventInfoAction", () => {
  it("refuses a non-admin", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized."));
    expect(await updateEventInfoAction({ error: null }, form("# Briefing"))).toEqual({ error: "Unauthorized." });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("refuses a closed edition", async () => {
    requireWritableEdition.mockRejectedValue(new Error("This edition is closed."));
    expect(await updateEventInfoAction({ error: null }, form("# Briefing"))).toEqual({
      error: "This edition is closed.",
    });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("saves the Markdown as typed", async () => {
    const result = await updateEventInfoAction({ error: null }, form("# Briefing\n\nGate at 08:00."));
    expect(result).toEqual({ error: null, saved: true });
    expect(prisma.event.update.mock.calls[0][0]).toMatchObject({
      where: { id: "event_1" },
      data: { info: "# Briefing\n\nGate at 08:00." },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/events");
  });

  it("clears the page when the box is emptied", async () => {
    await updateEventInfoAction({ error: null }, form("   \n  "));
    expect(prisma.event.update.mock.calls[0][0].data.info).toBeNull();
  });
});
