import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const revalidatePath = vi.fn();
const ensureUserEdition = vi.fn();
const prisma = {
  user: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  department: { findMany: vi.fn() },
  task: { deleteMany: vi.fn() },
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/edition-context", () => ({
  ensureUserEdition: (...a: unknown[]) => ensureUserEdition(...a),
}));

const { resetUserTwoFactorAction, createUserAction, updateUserAction, deleteUserAction } = await import("./actions");

function form(userId = "user_2"): FormData {
  const fd = new FormData();
  fd.set("userId", userId);
  return fd;
}

function userForm(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      fd.append(key, item);
    }
  }
  return fd;
}

function updateForm(fields: Record<string, string | string[]>): FormData {
  return userForm({ userId: "guest_1", name: "Jean", email: "g@x.ch", ...fields });
}

const state = { error: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "admin_1", role: "ADMIN" });
  prisma.user.updateMany.mockResolvedValue({ count: 1 });
  prisma.department.findMany.mockResolvedValue([{ id: "dep_1" }]);
  prisma.user.update.mockResolvedValue({});
  prisma.user.delete.mockResolvedValue({});
  prisma.task.deleteMany.mockResolvedValue({ count: 0 });
  prisma.user.count.mockResolvedValue(2);
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

describe("createUserAction", () => {
  it("refuses a GUEST role", async () => {
    const result = await createUserAction(
      state,
      userForm({ name: "Jean", email: "g@x.ch", password: "password1", role: "GUEST" }),
    );
    expect(result).toEqual({ error: "Invalid role." });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe("updateUserAction", () => {
  const guest = { role: "GUEST", email: "g@x.ch" };

  it("refuses turning a member into a guest", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "DEPARTMENT", email: "a@x.ch" });
    const result = await updateUserAction(state, updateForm({ email: "a@x.ch", role: "GUEST" }));
    expect(result).toEqual({ error: "Invalid role." });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("promotes a guest to department", async () => {
    prisma.user.findUnique.mockResolvedValue(guest);
    const result = await updateUserAction(state, updateForm({ role: "DEPARTMENT", departmentIds: ["dep_1"] }));
    expect(result).toEqual({ error: null });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "DEPARTMENT", departments: { set: [{ id: "dep_1" }] } }),
      }),
    );
    expect(ensureUserEdition).toHaveBeenCalledWith("guest_1");
  });

  it("refuses promoting a guest without a department", async () => {
    prisma.user.findUnique.mockResolvedValue(guest);
    const result = await updateUserAction(state, updateForm({ role: "DEPARTMENT" }));
    expect(result).toEqual({ error: "At least one department is required for department users." });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses promoting a guest straight to admin", async () => {
    prisma.user.findUnique.mockResolvedValue(guest);
    const result = await updateUserAction(state, updateForm({ role: "ADMIN" }));
    expect(result).toEqual({ error: "A guest can only become a department user." });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("keeps a guest a guest", async () => {
    prisma.user.findUnique.mockResolvedValue(guest);
    const result = await updateUserAction(state, updateForm({ role: "GUEST", departmentIds: ["dep_1"] }));
    expect(result).toEqual({ error: null });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "GUEST", departments: { set: [] } }),
      }),
    );
    expect(ensureUserEdition).not.toHaveBeenCalled();
  });

  it("keeps the stored email spelling when unchanged", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "GUEST", email: "Jean@X.ch" });
    await updateUserAction(state, updateForm({ email: " jean@x.ch ", role: "GUEST" }));
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "Jean@X.ch" }) }),
    );
  });

  it("lowercases a changed email", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "GUEST", email: "Jean@X.ch" });
    await updateUserAction(state, updateForm({ email: "New@X.ch", role: "GUEST" }));
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "new@x.ch" }) }),
    );
  });

  it("says so when the user no longer exists", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await updateUserAction(state, updateForm({ role: "GUEST" }));
    expect(result).toEqual({ error: "User not found." });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("still refuses demoting the last admin", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "ADMIN", email: "a@x.ch" });
    prisma.user.count.mockResolvedValue(1);
    const result = await updateUserAction(
      state,
      updateForm({ email: "a@x.ch", role: "DEPARTMENT", departmentIds: ["dep_1"] }),
    );
    expect(result).toEqual({ error: "At least one admin account must remain." });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("deleteUserAction", () => {
  it("deletes a guest", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "GUEST", email: "g@x.ch" });
    const result = await deleteUserAction(state, form("guest_1"));
    expect(result).toEqual({ error: null });
    expect(prisma.task.deleteMany).toHaveBeenCalled();
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "guest_1" } });
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it("still refuses deleting the last admin", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "ADMIN", email: "a@x.ch" });
    prisma.user.count.mockResolvedValue(1);
    const result = await deleteUserAction(state, form("admin_2"));
    expect(result).toEqual({ error: "At least one admin account must remain." });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
