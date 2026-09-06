import { beforeEach, describe, expect, it, vi } from "vitest";

// The three things a server action reaches for that a test process has no real
// version of. Mocked once here; each test drives the return values.
const requireAdmin = vi.fn();
const revalidatePath = vi.fn();
const prisma = {
  stockElement: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
  stockItem: { count: vi.fn() },
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/db", () => ({ prisma }));

const { createArticleAction, updateArticleAction, deleteArticleAction } = await import("./actions");

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", "Barrel of lager");
  fd.set("unitId", "unit_l");
  fd.set("unitQty", "30");
  fd.set("elementId", "el_1");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "admin_1", role: "ADMIN" });
  prisma.stockElement.create.mockResolvedValue({ id: "el_1" });
  prisma.stockElement.update.mockResolvedValue({ id: "el_1" });
  prisma.stockElement.delete.mockResolvedValue({ id: "el_1" });
  prisma.stockElement.findUnique.mockResolvedValue(null);
  prisma.stockItem.count.mockResolvedValue(0);
});

describe("every article action is admin-only", () => {
  it.each([
    ["create", () => createArticleAction({ error: null }, form())],
    ["update", () => updateArticleAction({ error: null }, form())],
    ["delete", () => deleteArticleAction({ error: null }, form())],
  ])("%s refuses a non-admin", async (_name, run) => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized."));
    expect(await run()).toEqual({ error: "Unauthorized." });
    expect(prisma.stockElement.create).not.toHaveBeenCalled();
    expect(prisma.stockElement.update).not.toHaveBeenCalled();
    expect(prisma.stockElement.delete).not.toHaveBeenCalled();
  });
});

describe("updateArticleAction — turning \"Counted in stock\" off", () => {
  // `expireable: "on"` throughout, so the only guard under test is the
  // tracksStock one — the expireable guard runs first and would mask it.
  it("is refused while pieces of the article exist", async () => {
    prisma.stockItem.count.mockResolvedValue(4); // 4 pieces on a shelf somewhere
    const result = await updateArticleAction({ error: null }, form({ expireable: "on" }));
    expect(result.error).toMatch(/take it out of every stock/i);
    expect(prisma.stockElement.update).not.toHaveBeenCalled();
  });

  it("is allowed once nothing is stocked", async () => {
    prisma.stockItem.count.mockResolvedValue(0);
    const result = await updateArticleAction({ error: null }, form({ expireable: "on" }));
    expect(result).toEqual({ error: null, saved: true });
    expect(prisma.stockElement.update).toHaveBeenCalledOnce();
    expect(prisma.stockElement.update.mock.calls[0][0].data.tracksStock).toBe(false);
  });

  it("does not run the stocked check when the box stays ticked", async () => {
    await updateArticleAction({ error: null }, form({ expireable: "on", tracksStock: "on" }));
    // expireable is on and tracksStock is on: neither guard queries
    expect(prisma.stockItem.count).not.toHaveBeenCalled();
    expect(prisma.stockElement.update).toHaveBeenCalledOnce();
  });
});

describe("deleteArticleAction", () => {
  it("refuses while the article sits in a stock", async () => {
    prisma.stockItem.count.mockResolvedValue(1);
    const result = await deleteArticleAction({ error: null }, form());
    expect(result.error).toMatch(/take it out of every stock/i);
    expect(prisma.stockElement.delete).not.toHaveBeenCalled();
  });

  it("deletes when the article is in no stock", async () => {
    const result = await deleteArticleAction({ error: null }, form());
    expect(result).toEqual({ error: null });
    expect(prisma.stockElement.delete).toHaveBeenCalledWith({ where: { id: "el_1" } });
  });
});

describe("createArticleAction", () => {
  it("writes the parsed fields and revalidates both apps", async () => {
    await createArticleAction({ error: null }, form({ tracksStock: "on", brand: "Feldschlösschen" }));
    expect(prisma.stockElement.create).toHaveBeenCalledOnce();
    expect(prisma.stockElement.create.mock.calls[0][0].data).toMatchObject({
      name: "Barrel of lager",
      brand: "Feldschlösschen",
      tracksStock: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/articles");
    expect(revalidatePath).toHaveBeenCalledWith("/stock");
  });
});
