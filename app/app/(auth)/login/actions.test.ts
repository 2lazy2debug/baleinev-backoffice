import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = { user: { findFirst: vi.fn(), create: vi.fn() } };

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("bcrypt", () => ({ hash: vi.fn(async (pw: string, cost: number) => `hashed:${cost}:${pw}`) }));

const { registerGuestAction } = await import("./actions");

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", "Guest One");
  fd.set("email", "  guest@test.local  ");
  fd.set("password", "longenough");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findFirst.mockResolvedValue(null);
  prisma.user.create.mockResolvedValue({ id: "u1" });
});

describe("registerGuestAction", () => {
  it("creates a GUEST with trimmed email and a hashed password", async () => {
    expect(await registerGuestAction(form())).toEqual({ error: null });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.user.create.mock.calls[0][0];
    expect(data).toEqual({
      name: "Guest One",
      email: "guest@test.local",
      passwordHash: "hashed:12:longenough",
      role: "GUEST",
    });
    expect(data.passwordHash).not.toBe("longenough");
  });

  it("does not trim the password", async () => {
    await registerGuestAction(form({ password: "  spaced pass  " }));
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toBe("hashed:12:  spaced pass  ");
  });

  it.each([
    ["empty name", { name: "" }],
    ["blank name", { name: "   " }],
    ["empty email", { email: "" }],
    ["empty password", { password: "" }],
  ])("refuses %s", async (_label, overrides) => {
    expect(await registerGuestAction(form(overrides))).toEqual({ error: "missingFields" });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("refuses a 7-character password", async () => {
    expect(await registerGuestAction(form({ password: "1234567" }))).toEqual({ error: "passwordTooShort" });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("accepts an 8-character password", async () => {
    expect(await registerGuestAction(form({ password: "12345678" }))).toEqual({ error: null });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it("refuses an email that already exists, case-insensitively", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "admin" });
    expect(await registerGuestAction(form())).toEqual({ error: "emailTaken" });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "guest@test.local", mode: "insensitive" } },
      select: { id: true },
    });
  });

  it("maps a unique-constraint race to emailTaken", async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );
    expect(await registerGuestAction(form())).toEqual({ error: "emailTaken" });
  });

  it("maps any other failure to failed", async () => {
    prisma.user.create.mockRejectedValue(new Error("db down"));
    expect(await registerGuestAction(form())).toEqual({ error: "failed" });
  });
});
