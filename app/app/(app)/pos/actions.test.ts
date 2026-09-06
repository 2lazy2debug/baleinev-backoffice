import { beforeEach, describe, expect, it, vi } from "vitest";

// The three things these actions reach for that a test process has no real
// version of. Mocked once; each test drives the return values.
const requireAdmin = vi.fn();
const resolveWritableEditionId = vi.fn();
const revalidatePath = vi.fn();

const prisma = {
  posTemplate: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  posTemplateCell: { upsert: vi.fn(), deleteMany: vi.fn() },
  stockElement: { findUnique: vi.fn() },
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/edition-context", () => ({ resolveWritableEditionId: () => resolveWritableEditionId() }));
vi.mock("@/lib/db", () => ({ prisma }));

const {
  createPosTemplateAction,
  renamePosTemplateAction,
  deletePosTemplateAction,
  setPosTemplateCellAction,
  clearPosTemplateCellAction,
} = await import("./actions");

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function cellForm(overrides: Record<string, string> = {}): FormData {
  return form({
    templateId: "tpl_1",
    position: "0",
    elementId: "el_1",
    label: "Beer 3dl",
    price: "4.50",
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "admin_1", role: "ADMIN" });
  resolveWritableEditionId.mockResolvedValue("ed_1");
  prisma.posTemplate.findUnique.mockResolvedValue(null);
  prisma.posTemplate.create.mockResolvedValue({ id: "tpl_1" });
  prisma.posTemplate.update.mockResolvedValue({ id: "tpl_1" });
  prisma.posTemplate.delete.mockResolvedValue({ id: "tpl_1" });
  prisma.posTemplateCell.upsert.mockResolvedValue({ id: "cell_1" });
  prisma.posTemplateCell.deleteMany.mockResolvedValue({ count: 1 });
  prisma.stockElement.findUnique.mockResolvedValue({ id: "el_1" });
});

/** For the cell actions, the template-belongs-to-edition lookup has to pass. */
function templateIsInEdition() {
  prisma.posTemplate.findUnique.mockResolvedValue({ id: "tpl_1", editionId: "ed_1" });
}

describe("every POS template action is admin-only", () => {
  it.each([
    ["create", () => createPosTemplateAction({ error: null }, form({ name: "Bar 1" }))],
    ["rename", () => renamePosTemplateAction({ error: null }, form({ templateId: "tpl_1", name: "Bar 2" }))],
    ["delete", () => deletePosTemplateAction({ error: null }, form({ templateId: "tpl_1" }))],
    ["set cell", () => setPosTemplateCellAction({ error: null }, cellForm())],
    ["clear cell", () => clearPosTemplateCellAction({ error: null }, form({ templateId: "tpl_1", position: "0" }))],
  ])("%s refuses a non-admin", async (_name, run) => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized."));
    expect(await run()).toEqual({ error: "Unauthorized." });
    expect(prisma.posTemplate.create).not.toHaveBeenCalled();
    expect(prisma.posTemplate.update).not.toHaveBeenCalled();
    expect(prisma.posTemplate.delete).not.toHaveBeenCalled();
    expect(prisma.posTemplateCell.upsert).not.toHaveBeenCalled();
    expect(prisma.posTemplateCell.deleteMany).not.toHaveBeenCalled();
  });
});

describe("createPosTemplateAction", () => {
  it("refuses a name already used in the edition, with a sentence", async () => {
    prisma.posTemplate.findUnique.mockResolvedValue({ id: "tpl_other" });
    const result = await createPosTemplateAction({ error: null }, form({ name: "Bar 1" }));
    expect(result.error).toMatch(/already exists/i);
    expect(prisma.posTemplate.create).not.toHaveBeenCalled();
  });

  it("creates the template and revalidates the list", async () => {
    const result = await createPosTemplateAction({ error: null }, form({ name: "Bar 1" }));
    expect(result).toEqual({ error: null });
    expect(prisma.posTemplate.create).toHaveBeenCalledWith({ data: { editionId: "ed_1", name: "Bar 1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/pos/templates");
  });
});

describe("renamePosTemplateAction", () => {
  it("refuses a template that is not in the current edition", async () => {
    prisma.posTemplate.findUnique.mockResolvedValue({ id: "tpl_1", editionId: "ed_other" });
    const result = await renamePosTemplateAction({ error: null }, form({ templateId: "tpl_1", name: "Bar 2" }));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.posTemplate.update).not.toHaveBeenCalled();
  });

  it("refuses a name owned by a different template", async () => {
    prisma.posTemplate.findUnique
      .mockResolvedValueOnce({ id: "tpl_1", editionId: "ed_1" }) // the belongs-to-edition check
      .mockResolvedValueOnce({ id: "tpl_other" }); // the name clash check
    const result = await renamePosTemplateAction({ error: null }, form({ templateId: "tpl_1", name: "Bar 2" }));
    expect(result.error).toMatch(/already exists/i);
    expect(prisma.posTemplate.update).not.toHaveBeenCalled();
  });

  it("allows renaming a template to the name it already carries", async () => {
    prisma.posTemplate.findUnique
      .mockResolvedValueOnce({ id: "tpl_1", editionId: "ed_1" })
      .mockResolvedValueOnce({ id: "tpl_1" });
    const result = await renamePosTemplateAction({ error: null }, form({ templateId: "tpl_1", name: "Bar 1" }));
    expect(result).toEqual({ error: null });
    expect(prisma.posTemplate.update).toHaveBeenCalledWith({ where: { id: "tpl_1" }, data: { name: "Bar 1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/pos/templates/tpl_1");
  });
});

describe("deletePosTemplateAction", () => {
  it("refuses a template from another edition", async () => {
    prisma.posTemplate.findUnique.mockResolvedValue({ id: "tpl_1", editionId: "ed_other" });
    const result = await deletePosTemplateAction({ error: null }, form({ templateId: "tpl_1" }));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.posTemplate.delete).not.toHaveBeenCalled();
  });

  it("deletes a template in the edition", async () => {
    templateIsInEdition();
    const result = await deletePosTemplateAction({ error: null }, form({ templateId: "tpl_1" }));
    expect(result).toEqual({ error: null });
    expect(prisma.posTemplate.delete).toHaveBeenCalledWith({ where: { id: "tpl_1" } });
  });
});

describe("setPosTemplateCellAction", () => {
  beforeEach(templateIsInEdition);

  it("refuses a non-integer / negative slot", async () => {
    expect((await setPosTemplateCellAction({ error: null }, cellForm({ position: "2.5" }))).error).toMatch(/not valid/i);
    expect((await setPosTemplateCellAction({ error: null }, cellForm({ position: "-1" }))).error).toMatch(/not valid/i);
    expect(prisma.posTemplateCell.upsert).not.toHaveBeenCalled();
  });

  it("refuses a price that is not a number", async () => {
    const result = await setPosTemplateCellAction({ error: null }, cellForm({ price: "free" }));
    expect(result.error).toMatch(/price must be a number/i);
    expect(prisma.posTemplateCell.upsert).not.toHaveBeenCalled();
  });

  it("refuses an article that no longer exists", async () => {
    prisma.stockElement.findUnique.mockResolvedValue(null);
    const result = await setPosTemplateCellAction({ error: null }, cellForm());
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.posTemplateCell.upsert).not.toHaveBeenCalled();
  });

  it("upserts the cell, accepting a comma decimal", async () => {
    const result = await setPosTemplateCellAction({ error: null }, cellForm({ price: "4,5" }));
    expect(result).toEqual({ error: null });
    expect(prisma.posTemplateCell.upsert).toHaveBeenCalledWith({
      where: { templateId_position: { templateId: "tpl_1", position: 0 } },
      create: { templateId: "tpl_1", position: 0, elementId: "el_1", label: "Beer 3dl", price: "4.50" },
      update: { elementId: "el_1", label: "Beer 3dl", price: "4.50" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/pos/templates/tpl_1");
  });

  it("accepts a negative price — a deposit handed back", async () => {
    await setPosTemplateCellAction({ error: null }, cellForm({ price: "-2", label: "Deposit back" }));
    expect(prisma.posTemplateCell.upsert.mock.calls[0][0].create.price).toBe("-2.00");
  });

  it("accepts a zero price", async () => {
    await setPosTemplateCellAction({ error: null }, cellForm({ price: "0" }));
    expect(prisma.posTemplateCell.upsert.mock.calls[0][0].create.price).toBe("0.00");
  });
});

describe("clearPosTemplateCellAction", () => {
  it("refuses a template from another edition", async () => {
    prisma.posTemplate.findUnique.mockResolvedValue({ id: "tpl_1", editionId: "ed_other" });
    const result = await clearPosTemplateCellAction({ error: null }, form({ templateId: "tpl_1", position: "0" }));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.posTemplateCell.deleteMany).not.toHaveBeenCalled();
  });

  it("clears the slot without complaining when it is already empty", async () => {
    templateIsInEdition();
    prisma.posTemplateCell.deleteMany.mockResolvedValue({ count: 0 });
    const result = await clearPosTemplateCellAction({ error: null }, form({ templateId: "tpl_1", position: "3" }));
    expect(result).toEqual({ error: null });
    expect(prisma.posTemplateCell.deleteMany).toHaveBeenCalledWith({ where: { templateId: "tpl_1", position: 3 } });
  });
});
