import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const revalidatePath = vi.fn();
const prisma = {
  user: { updateMany: vi.fn() },
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/edition-context", () => ({ ensureUserEdition: vi.fn() }));

const { resetUserTwoFactorAction } = await import("./actions");

function form(userId = "user_2"): FormData {
  const fd = new FormData();
  fd.set("userId", userId);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "admin_1", role: "ADMIN" });
  prisma.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("resetUserTwoFactorAction", () => {
  it("refuses a non-admin", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized."));
    expect(await resetUserTwoFactorAction({ error: null }, form())).toEqual({ error: "Unauthorized." });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("refuses the admin's own account — that costs a password on /account", async () => {
    const result = await resetUserTwoFactorAction({ error: null }, form("admin_1"));
    expect(result.error).toMatch(/account page/i);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("clears the flag and all three seed columns of another user", async () => {
    const result = await resetUserTwoFactorAction({ error: null }, form());
    expect(result).toEqual({ error: null, saved: true });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user_2" },
      data: { twoFactorEnabled: false, twoFactorCipher: null, twoFactorIv: null, twoFactorTag: null },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/users");
  });

  it("says so when the user no longer exists", async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    expect((await resetUserTwoFactorAction({ error: null }, form())).error).toBe("User not found.");
  });

  it("requires a userId", async () => {
    expect((await resetUserTwoFactorAction({ error: null }, form(""))).error).toMatch(/userId/);
  });
});
