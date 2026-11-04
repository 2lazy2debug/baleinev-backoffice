import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";

const getServerSession = vi.fn();
const findUnique = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("REDIRECT:" + url);
  },
}));

const { getCurrentUserAccess, requireAdmin } = await import("./access");

function userRow(role: UserRole) {
  return {
    id: "u1",
    email: "u@x",
    name: "U",
    role,
    refundFirstName: null,
    refundLastName: null,
    refundIban: null,
    refundZip: null,
    refundCity: null,
    departments: [],
  };
}

function signInAs(role: UserRole) {
  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  findUnique.mockResolvedValue(userRow(role));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUserAccess", () => {
  it("redirects to /login without a session", async () => {
    getServerSession.mockResolvedValue(null);
    await expect(getCurrentUserAccess()).rejects.toThrow("REDIRECT:/login");
  });

  it("refuses a GUEST by default", async () => {
    signInAs("GUEST");
    await expect(getCurrentUserAccess()).rejects.toThrow("REDIRECT:/events");
  });

  it("lets a GUEST through with allowGuest", async () => {
    signInAs("GUEST");
    await expect(getCurrentUserAccess({ allowGuest: true })).resolves.toMatchObject({
      role: "GUEST",
      departmentIds: [],
    });
  });

  it.each(["ADMIN", "DEPARTMENT"] as const)("%s resolves with and without allowGuest", async (role) => {
    signInAs(role);
    await expect(getCurrentUserAccess()).resolves.toMatchObject({ role });
    await expect(getCurrentUserAccess({ allowGuest: true })).resolves.toMatchObject({ role });
  });
});

describe("requireAdmin", () => {
  it("redirects a GUEST to /events", async () => {
    signInAs("GUEST");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/events");
  });

  it("throws Unauthorized for a DEPARTMENT user", async () => {
    signInAs("DEPARTMENT");
    await expect(requireAdmin()).rejects.toThrow("Unauthorized.");
  });

  it("resolves for an ADMIN", async () => {
    signInAs("ADMIN");
    await expect(requireAdmin()).resolves.toMatchObject({ role: "ADMIN" });
  });
});
