import { beforeEach, describe, expect, it, vi } from "vitest";

// The three things these actions reach for that a test process has no real
// version of. Mocked once; each test drives the return values.
const requireAdmin = vi.fn();
const resolveWritableEditionId = vi.fn();
const revalidatePath = vi.fn();

const prisma = {
  posTemplate: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  posTemplateCell: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  posSession: { count: vi.fn() },
  stockElement: { findUnique: vi.fn() },
  // The reorder and remove paths rewrite positions inside a transaction. The
  // callback form is what the actions use, and the same mock client stands in
  // for `tx` — every write it makes is on the same spies the tests read.
  $transaction: vi.fn(),
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/edition-context", () => ({ resolveWritableEditionId: () => resolveWritableEditionId() }));
vi.mock("@/lib/db", () => ({ prisma }));

const {
  createPosTemplateAction,
  renamePosTemplateAction,
  deletePosTemplateAction,
  addPosTemplateCellAction,
  updatePosTemplateCellAction,
  removePosTemplateCellAction,
  reorderPosTemplateCellsAction,
} = await import("./actions");

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function cellForm(overrides: Record<string, string> = {}): FormData {
  return form({
    templateId: "tpl_1",
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
  prisma.posTemplateCell.findUnique.mockResolvedValue({ id: "cell_1", templateId: "tpl_1", position: 0 });
  prisma.posTemplateCell.findMany.mockResolvedValue([{ id: "cell_1" }, { id: "cell_2" }]);
  prisma.posTemplateCell.create.mockResolvedValue({ id: "cell_1" });
  prisma.posTemplateCell.update.mockResolvedValue({ id: "cell_1" });
  prisma.posTemplateCell.updateMany.mockResolvedValue({ count: 2 });
  prisma.posTemplateCell.delete.mockResolvedValue({ id: "cell_1" });
  prisma.posTemplateCell.count.mockResolvedValue(3);
  prisma.posSession.count.mockResolvedValue(0);
  prisma.stockElement.findUnique.mockResolvedValue({ id: "el_1" });
  prisma.$transaction.mockImplementation((run: (tx: typeof prisma) => unknown) => run(prisma));
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
    ["add cell", () => addPosTemplateCellAction({ error: null }, cellForm())],
    ["update cell", () => updatePosTemplateCellAction({ error: null }, cellForm({ cellId: "cell_1" }))],
    ["remove cell", () => removePosTemplateCellAction({ error: null }, form({ templateId: "tpl_1", cellId: "cell_1" }))],
    ["reorder cells", () => reorderPosTemplateCellsAction("tpl_1", ["cell_2", "cell_1"])],
  ])("%s refuses a non-admin", async (_name, run) => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized."));
    expect(await run()).toEqual({ error: "Unauthorized." });
    expect(prisma.posTemplate.create).not.toHaveBeenCalled();
    expect(prisma.posTemplate.update).not.toHaveBeenCalled();
    expect(prisma.posTemplate.delete).not.toHaveBeenCalled();
    expect(prisma.posTemplateCell.create).not.toHaveBeenCalled();
    expect(prisma.posTemplateCell.update).not.toHaveBeenCalled();
    expect(prisma.posTemplateCell.updateMany).not.toHaveBeenCalled();
    expect(prisma.posTemplateCell.delete).not.toHaveBeenCalled();
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

  it("refuses a template a session has used", async () => {
    templateIsInEdition();
    prisma.posSession.count.mockResolvedValue(2);
    const result = await deletePosTemplateAction({ error: null }, form({ templateId: "tpl_1" }));
    expect(result.error).toMatch(/a session has used this template/i);
    expect(prisma.posTemplate.delete).not.toHaveBeenCalled();
  });
});

describe("addPosTemplateCellAction", () => {
  beforeEach(templateIsInEdition);

  it("refuses a price that is not a number", async () => {
    const result = await addPosTemplateCellAction({ error: null }, cellForm({ price: "free" }));
    expect(result.error).toMatch(/price must be a number/i);
    expect(prisma.posTemplateCell.create).not.toHaveBeenCalled();
  });

  it("refuses an article that no longer exists", async () => {
    prisma.stockElement.findUnique.mockResolvedValue(null);
    const result = await addPosTemplateCellAction({ error: null }, cellForm());
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.posTemplateCell.create).not.toHaveBeenCalled();
  });

  it("appends at the end of the stack, accepting a comma decimal", async () => {
    const result = await addPosTemplateCellAction({ error: null }, cellForm({ price: "4,5" }));
    expect(result).toEqual({ error: null });
    expect(prisma.posTemplateCell.create).toHaveBeenCalledWith({
      data: {
        templateId: "tpl_1",
        position: 3, // the three tiles already there
        kind: "ARTICLE",
        elementId: "el_1",
        label: "Beer 3dl",
        price: "4.50",
        color: null,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/pos/templates/tpl_1");
  });

  it("stores the color a form picked", async () => {
    await addPosTemplateCellAction({ error: null }, cellForm({ color: "TEAL" }));
    expect(prisma.posTemplateCell.create.mock.calls[0][0].data.color).toBe("TEAL");
  });

  it("refuses a color that does not exist", async () => {
    const result = await addPosTemplateCellAction({ error: null }, cellForm({ color: "MAUVE" }));
    expect(result.error).toMatch(/that color does not exist/i);
    expect(prisma.posTemplateCell.create).not.toHaveBeenCalled();
  });

  it("accepts a negative price — a deposit handed back", async () => {
    await addPosTemplateCellAction({ error: null }, cellForm({ price: "-2", label: "Deposit back" }));
    expect(prisma.posTemplateCell.create.mock.calls[0][0].data.price).toBe("-2.00");
  });

  it("accepts a zero price", async () => {
    await addPosTemplateCellAction({ error: null }, cellForm({ price: "0" }));
    expect(prisma.posTemplateCell.create.mock.calls[0][0].data.price).toBe("0.00");
  });

  it("stores a spacer with no article, no label and no price, whatever the form carried", async () => {
    const result = await addPosTemplateCellAction(
      { error: null },
      cellForm({ kind: "SPACER", elementId: "el_1", label: "Beer 3dl", price: "4.50", color: "RED" }),
    );
    expect(result).toEqual({ error: null });
    expect(prisma.posTemplateCell.create).toHaveBeenCalledWith({
      data: {
        templateId: "tpl_1",
        position: 3,
        kind: "SPACER",
        elementId: null,
        label: "",
        price: "0.00",
        color: null,
      },
    });
    // A spacer points at nothing, so the catalogue is never consulted.
    expect(prisma.stockElement.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a template from another edition", async () => {
    prisma.posTemplate.findUnique.mockResolvedValue({ id: "tpl_1", editionId: "ed_other" });
    const result = await addPosTemplateCellAction({ error: null }, cellForm());
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.posTemplateCell.create).not.toHaveBeenCalled();
  });
});

describe("updatePosTemplateCellAction", () => {
  beforeEach(templateIsInEdition);

  it("refuses a tile that belongs to another template", async () => {
    prisma.posTemplateCell.findUnique.mockResolvedValue({ id: "cell_1", templateId: "tpl_other", position: 0 });
    const result = await updatePosTemplateCellAction({ error: null }, cellForm({ cellId: "cell_1" }));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.posTemplateCell.update).not.toHaveBeenCalled();
  });

  it("edits the tile in place and leaves its position alone", async () => {
    const result = await updatePosTemplateCellAction({ error: null }, cellForm({ cellId: "cell_1", price: "5" }));
    expect(result).toEqual({ error: null });
    expect(prisma.posTemplateCell.update).toHaveBeenCalledWith({
      where: { id: "cell_1" },
      data: { kind: "ARTICLE", elementId: "el_1", label: "Beer 3dl", price: "5.00", color: null },
    });
  });

  it("turns a tile into a spacer", async () => {
    await updatePosTemplateCellAction({ error: null }, cellForm({ cellId: "cell_1", kind: "SPACER" }));
    expect(prisma.posTemplateCell.update).toHaveBeenCalledWith({
      where: { id: "cell_1" },
      data: { kind: "SPACER", elementId: null, label: "", price: "0.00", color: null },
    });
  });
});

describe("removePosTemplateCellAction", () => {
  beforeEach(templateIsInEdition);

  it("refuses a tile that belongs to another template", async () => {
    prisma.posTemplateCell.findUnique.mockResolvedValue({ id: "cell_1", templateId: "tpl_other", position: 0 });
    const result = await removePosTemplateCellAction({ error: null }, form({ templateId: "tpl_1", cellId: "cell_1" }));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.posTemplateCell.delete).not.toHaveBeenCalled();
  });

  it("deletes the tile and closes the gap it leaves", async () => {
    prisma.posTemplateCell.findMany.mockResolvedValue([{ id: "cell_2" }, { id: "cell_3" }]);

    const result = await removePosTemplateCellAction({ error: null }, form({ templateId: "tpl_1", cellId: "cell_1" }));

    expect(result).toEqual({ error: null });
    expect(prisma.posTemplateCell.delete).toHaveBeenCalledWith({ where: { id: "cell_1" } });
    // Parked out of the way first, then renumbered from zero — the unique index
    // on (templateId, position) is checked row by row.
    expect(prisma.posTemplateCell.updateMany).toHaveBeenCalledWith({
      where: { templateId: "tpl_1" },
      data: { position: { increment: 1_000_000 } },
    });
    expect(prisma.posTemplateCell.update.mock.calls.map((call) => call[0])).toEqual([
      { where: { id: "cell_2" }, data: { position: 0 } },
      { where: { id: "cell_3" }, data: { position: 1 } },
    ]);
  });
});

describe("reorderPosTemplateCellsAction", () => {
  beforeEach(templateIsInEdition);

  it("refuses an order that is missing a tile", async () => {
    const result = await reorderPosTemplateCellsAction("tpl_1", ["cell_1"]);
    expect(result.error).toMatch(/out of date/i);
    expect(prisma.posTemplateCell.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an order naming a tile that is not on the template", async () => {
    const result = await reorderPosTemplateCellsAction("tpl_1", ["cell_1", "cell_9"]);
    expect(result.error).toMatch(/out of date/i);
    expect(prisma.posTemplateCell.update).not.toHaveBeenCalled();
  });

  it("refuses an order that names the same tile twice", async () => {
    const result = await reorderPosTemplateCellsAction("tpl_1", ["cell_1", "cell_1"]);
    expect(result.error).toMatch(/out of date/i);
    expect(prisma.posTemplateCell.update).not.toHaveBeenCalled();
  });

  it("refuses a template from another edition", async () => {
    prisma.posTemplate.findUnique.mockResolvedValue({ id: "tpl_1", editionId: "ed_other" });
    const result = await reorderPosTemplateCellsAction("tpl_1", ["cell_2", "cell_1"]);
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.posTemplateCell.updateMany).not.toHaveBeenCalled();
  });

  it("parks the stack, then writes the given order back as 0..n-1", async () => {
    const result = await reorderPosTemplateCellsAction("tpl_1", ["cell_2", "cell_1"]);

    expect(result).toEqual({ error: null });
    expect(prisma.posTemplateCell.updateMany).toHaveBeenCalledWith({
      where: { templateId: "tpl_1" },
      data: { position: { increment: 1_000_000 } },
    });
    expect(prisma.posTemplateCell.update.mock.calls.map((call) => call[0])).toEqual([
      { where: { id: "cell_2" }, data: { position: 0 } },
      { where: { id: "cell_1" }, data: { position: 1 } },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/pos/templates/tpl_1");
  });
});
