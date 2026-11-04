import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
const findFirst = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) },
    edition: { findFirst: (...a: unknown[]) => findFirst(...a) },
  },
}));

const { ensureUserEdition, resolveEditionIdOrNull } = await import("./edition-context");

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "u1" } });
});

describe("edition context", () => {
  it("resolves a guest with a stale pick to the default edition", async () => {
    findUnique.mockResolvedValue({ role: "GUEST", selectedEditionId: "old" });
    findFirst.mockResolvedValue({ id: "def" });
    await expect(resolveEditionIdOrNull()).resolves.toBe("def");
    expect(update).not.toHaveBeenCalled();
  });

  it("resolves a guest to null when there is no default edition", async () => {
    findUnique.mockResolvedValue({ role: "GUEST", selectedEditionId: "old" });
    findFirst.mockResolvedValue(null);
    await expect(resolveEditionIdOrNull()).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("ensureUserEdition never writes for a guest", async () => {
    findUnique.mockResolvedValue({ role: "GUEST", selectedEditionId: null });
    findFirst.mockResolvedValue({ id: "def" });
    await expect(ensureUserEdition("u1")).resolves.toBe("def");
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps a department user's own pick", async () => {
    findUnique.mockResolvedValue({ role: "DEPARTMENT", selectedEditionId: "old" });
    await expect(resolveEditionIdOrNull()).resolves.toBe("old");
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("seeds a department user once from the default edition", async () => {
    findUnique.mockResolvedValue({ role: "DEPARTMENT", selectedEditionId: null });
    findFirst.mockResolvedValue({ id: "def" });
    await expect(resolveEditionIdOrNull()).resolves.toBe("def");
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { selectedEditionId: "def" } });
  });

  it("returns null without a session", async () => {
    getServerSession.mockResolvedValue(null);
    await expect(resolveEditionIdOrNull()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
