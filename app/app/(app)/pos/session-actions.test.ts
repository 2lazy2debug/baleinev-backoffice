import { beforeEach, describe, expect, it, vi } from "vitest";

// Everything these actions reach for that a test process has no real version of.
const getCurrentUserAccess = vi.fn();
const resolveWritableEditionId = vi.fn();
const revalidatePath = vi.fn();

const removeFromPlace = vi.fn();

const tx = {
  posSession: { create: vi.fn(), update: vi.fn() },
  posSessionPayment: { createMany: vi.fn() },
  posSale: { create: vi.fn() },
  posSaleLine: { createMany: vi.fn() },
  posSaleChange: { createMany: vi.fn() },
  stockElement: { findMany: vi.fn() },
  user: { update: vi.fn(), updateMany: vi.fn() },
};
const prisma = {
  posTemplate: { findUnique: vi.fn() },
  posSession: { findUnique: vi.fn(), update: vi.fn() },
  cashRegister: { findUnique: vi.fn() },
  stockElement: { findMany: vi.fn() },
  stockPlace: { findUnique: vi.fn() },
  user: { update: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/app/(app)/stock/actions", () => ({ removeFromPlace: (...a: unknown[]) => removeFromPlace(...a) }));
vi.mock("@/lib/access", () => ({ getCurrentUserAccess: () => getCurrentUserAccess() }));
vi.mock("@/lib/edition-context", () => ({ resolveWritableEditionId: () => resolveWritableEditionId() }));
vi.mock("@/lib/db", () => ({ prisma }));

const {
  openPosSessionAction,
  joinPosSessionAction,
  leavePosSessionAction,
  setPosSessionStatusAction,
  recordPosSaleAction,
} = await import("./session-actions");

function form(entries: Array<[string, string]>): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const OPEN_SESSION = {
  id: "sess_1",
  editionId: "ed_1",
  status: "OPEN",
  stockPlaceId: null,
  methods: [{ method: "CASH" }, { method: "TWINT" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserAccess.mockResolvedValue({ id: "u_1", role: "DEPARTMENT", departmentNames: [] });
  resolveWritableEditionId.mockResolvedValue("ed_1");
  prisma.posTemplate.findUnique.mockResolvedValue({ editionId: "ed_1", _count: { cells: 8 } });
  prisma.cashRegister.findUnique.mockResolvedValue({ editionId: "ed_1", closedAt: null });
  prisma.posSession.findUnique.mockResolvedValue(OPEN_SESSION);
  prisma.stockElement.findMany.mockResolvedValue([{ id: "el_1" }]);
  prisma.stockPlace.findUnique.mockResolvedValue({ id: "place_1" });
  tx.stockElement.findMany.mockResolvedValue([{ id: "el_1" }]);
  tx.posSession.create.mockResolvedValue({ id: "sess_1" });
  tx.posSale.create.mockResolvedValue({ id: "sale_1" });
  prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe("a closed edition refuses every session and sale action", () => {
  it.each([
    ["open", () => openPosSessionAction({ error: null }, form([["name", "Bar"], ["templateId", "tpl_1"], ["methods", "TWINT"]]))],
    ["join", () => joinPosSessionAction("sess_1")],
    ["leave", () => leavePosSessionAction()],
    ["status", () => setPosSessionStatusAction({ error: null }, form([["sessionId", "sess_1"], ["status", "PAUSED"]]))],
    ["sale", () => recordPosSaleAction({ error: null }, form([["sessionId", "sess_1"], ["method", "TWINT"], ["lines", "[]"]]))],
  ])("%s", async (_name, run) => {
    resolveWritableEditionId.mockRejectedValue(new Error("This edition is closed. Reopen it to make changes."));
    expect((await run()).error).toMatch(/closed/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("openPosSessionAction", () => {
  const base: Array<[string, string]> = [["name", "Bar 1"], ["templateId", "tpl_1"]];

  it("refuses a template from another edition", async () => {
    prisma.posTemplate.findUnique.mockResolvedValue({ editionId: "ed_other", _count: { cells: 8 } });
    const result = await openPosSessionAction({ error: null }, form([...base, ["methods", "TWINT"]]));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a template with no tiles", async () => {
    prisma.posTemplate.findUnique.mockResolvedValue({ editionId: "ed_1", _count: { cells: 0 } });
    const result = await openPosSessionAction({ error: null }, form([...base, ["methods", "TWINT"]]));
    expect(result.error).toMatch(/no tiles yet/i);
  });

  it("refuses no payment method", async () => {
    const result = await openPosSessionAction({ error: null }, form(base));
    expect(result.error).toMatch(/at least one way to be paid/i);
  });

  it("refuses cash with no open register", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue({ editionId: "ed_1", closedAt: new Date() });
    const result = await openPosSessionAction(
      { error: null },
      form([...base, ["methods", "CASH"], ["cashRegisterId", "reg_1"]]),
    );
    expect(result.error).toMatch(/open cash register/i);
  });

  it("forces the register to null when cash is not a method", async () => {
    await openPosSessionAction({ error: null }, form([...base, ["methods", "TWINT"], ["cashRegisterId", "reg_1"]]));
    expect(tx.posSession.create).toHaveBeenCalledWith({
      data: {
        editionId: "ed_1",
        templateId: "tpl_1",
        cashRegisterId: null,
        stockPlaceId: null,
        name: "Bar 1",
        openedById: "u_1",
      },
    });
    expect(prisma.cashRegister.findUnique).not.toHaveBeenCalled();
  });

  it("an empty stock place is stored as null and never looked up", async () => {
    await openPosSessionAction({ error: null }, form([...base, ["methods", "TWINT"], ["stockPlaceId", ""]]));
    expect(tx.posSession.create.mock.calls[0][0].data.stockPlaceId).toBeNull();
    expect(prisma.stockPlace.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a stock place that no longer exists", async () => {
    prisma.stockPlace.findUnique.mockResolvedValue(null);
    const result = await openPosSessionAction(
      { error: null },
      form([...base, ["methods", "TWINT"], ["stockPlaceId", "place_gone"]]),
    );
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stores a stock place that exists", async () => {
    await openPosSessionAction(
      { error: null },
      form([...base, ["methods", "TWINT"], ["stockPlaceId", "place_1"]]),
    );
    expect(tx.posSession.create.mock.calls[0][0].data.stockPlaceId).toBe("place_1");
  });

  it("creates the session, its payment rows, and joins the opener", async () => {
    const result = await openPosSessionAction(
      { error: null },
      form([...base, ["methods", "CASH"], ["methods", "CASH"], ["methods", "BANK"], ["cashRegisterId", "reg_1"]]),
    );
    expect(result).toEqual({ error: null });
    expect(tx.posSession.create).toHaveBeenCalledWith({
      data: {
        editionId: "ed_1",
        templateId: "tpl_1",
        cashRegisterId: "reg_1",
        stockPlaceId: null,
        name: "Bar 1",
        openedById: "u_1",
      },
    });
    const rows = tx.posSessionPayment.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { method: string }) => r.method).sort()).toEqual(["BANK", "CASH"]);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "u_1" },
      data: { selectedPosSessionId: "sess_1" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/pos");
  });
});

describe("joinPosSessionAction", () => {
  it("refuses a closed session", async () => {
    prisma.posSession.findUnique.mockResolvedValue({ ...OPEN_SESSION, status: "CLOSED" });
    expect((await joinPosSessionAction("sess_1")).error).toMatch(/session is closed/i);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("points the user at the session", async () => {
    expect(await joinPosSessionAction("sess_1")).toEqual({ error: null });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u_1" },
      data: { selectedPosSessionId: "sess_1" },
    });
  });
});

describe("leavePosSessionAction", () => {
  it("clears the user's selected session", async () => {
    expect(await leavePosSessionAction()).toEqual({ error: null });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u_1" },
      data: { selectedPosSessionId: null },
    });
  });
});

describe("setPosSessionStatusAction", () => {
  it("refuses reopening a closed session", async () => {
    prisma.posSession.findUnique.mockResolvedValue({ ...OPEN_SESSION, status: "CLOSED" });
    const result = await setPosSessionStatusAction({ error: null }, form([["sessionId", "sess_1"], ["status", "OPEN"]]));
    expect(result.error).toMatch(/open a new one/i);
  });

  it("pauses a running session", async () => {
    const result = await setPosSessionStatusAction({ error: null }, form([["sessionId", "sess_1"], ["status", "PAUSED"]]));
    expect(result).toEqual({ error: null });
    expect(prisma.posSession.update).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: { status: "PAUSED" },
    });
  });

  it("closing sets closedAt and drops every phone back to the picker", async () => {
    const result = await setPosSessionStatusAction({ error: null }, form([["sessionId", "sess_1"], ["status", "CLOSED"]]));
    expect(result).toEqual({ error: null });
    expect(tx.posSession.update).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: { status: "CLOSED", closedAt: expect.any(Date) },
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { selectedPosSessionId: "sess_1" },
      data: { selectedPosSessionId: null },
    });
  });
});

describe("recordPosSaleAction", () => {
  const cart = JSON.stringify([
    { elementId: "el_1", label: "Beer 3dl", unitPrice: 450, quantity: 2 },
    { elementId: null, label: "Custom", unitPrice: 445, quantity: 1 },
  ]);

  it("refuses a paused session", async () => {
    prisma.posSession.findUnique.mockResolvedValue({ ...OPEN_SESSION, status: "PAUSED" });
    const result = await recordPosSaleAction(
      { error: null },
      form([["sessionId", "sess_1"], ["method", "TWINT"], ["lines", cart]]),
    );
    expect(result.error).toMatch(/not open/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a method the session does not accept", async () => {
    const result = await recordPosSaleAction(
      { error: null },
      form([["sessionId", "sess_1"], ["method", "BANK"], ["lines", cart]]),
    );
    expect(result.error).toMatch(/not enabled for this session/i);
  });

  it("refuses a malformed cart", async () => {
    for (const bad of ["[]", "not json", JSON.stringify([{ label: "x", unitPrice: 1.5, quantity: 1 }]), JSON.stringify([{ label: "x", unitPrice: 100, quantity: 0 }])]) {
      const result = await recordPosSaleAction(
        { error: null },
        form([["sessionId", "sess_1"], ["method", "TWINT"], ["lines", bad]]),
      );
      expect(result.error).toMatch(/could not be read/i);
    }
  });

  it("recomputes the total on the server and ignores the client's", async () => {
    await recordPosSaleAction(
      { error: null },
      form([["sessionId", "sess_1"], ["method", "TWINT"], ["lines", cart], ["total", "1"]]),
    );
    // 450*2 + 445 = 1345 rappen -> "13.45"
    expect(tx.posSale.create.mock.calls[0][0].data.total).toBe("13.45");
    expect(tx.posSale.create.mock.calls[0][0].data.cashGiven).toBeNull();
    expect(tx.posSale.create.mock.calls[0][0].data.changeDue).toBeNull();
  });

  it("refuses cash under the total", async () => {
    const result = await recordPosSaleAction(
      { error: null },
      form([["sessionId", "sess_1"], ["method", "CASH"], ["lines", cart], ["cashGiven", "1000"]]),
    );
    expect(result.error).toMatch(/less than the total/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stores the change sheet for a cash sale", async () => {
    await recordPosSaleAction(
      { error: null },
      form([["sessionId", "sess_1"], ["method", "CASH"], ["lines", cart], ["cashGiven", "2000"]]),
    );
    expect(tx.posSale.create.mock.calls[0][0].data).toMatchObject({
      total: "13.45",
      cashGiven: "20.00",
      changeDue: "6.55",
    });
    const change = tx.posSaleChange.createMany.mock.calls[0][0].data;
    expect(change).toEqual([
      { saleId: "sale_1", denomination: 500, quantity: 1 },
      { saleId: "sale_1", denomination: 100, quantity: 1 },
      { saleId: "sale_1", denomination: 50, quantity: 1 },
      { saleId: "sale_1", denomination: 5, quantity: 1 },
    ]);
  });

  it("allows an all-refund cash sale — money out of the drawer", async () => {
    const refund = JSON.stringify([{ elementId: null, label: "Deposit back", unitPrice: -200, quantity: 1 }]);
    const result = await recordPosSaleAction(
      { error: null },
      form([["sessionId", "sess_1"], ["method", "CASH"], ["lines", refund]]),
    );
    expect(result).toEqual({ error: null });
    expect(tx.posSale.create.mock.calls[0][0].data).toMatchObject({
      total: "-2.00",
      cashGiven: "0.00",
      changeDue: "2.00",
    });
  });

  it("records the lines with snapshotted label and unit price", async () => {
    await recordPosSaleAction(
      { error: null },
      form([["sessionId", "sess_1"], ["method", "TWINT"], ["lines", cart]]),
    );
    const lines = tx.posSaleLine.createMany.mock.calls[0][0].data;
    expect(lines).toEqual([
      { saleId: "sale_1", elementId: "el_1", label: "Beer 3dl", unitPrice: "4.50", quantity: 2 },
      { saleId: "sale_1", elementId: null, label: "Custom", unitPrice: "4.45", quantity: 1 },
    ]);
  });

  describe("moving stock", () => {
    const onPlace = { ...OPEN_SESSION, stockPlaceId: "place_1" };

    it("moves nothing when the session has no stock place", async () => {
      await recordPosSaleAction(
        { error: null },
        form([["sessionId", "sess_1"], ["method", "TWINT"], ["lines", cart]]),
      );
      expect(removeFromPlace).not.toHaveBeenCalled();
    });

    it("takes each tracked line off the session's shelf, oldest first", async () => {
      prisma.posSession.findUnique.mockResolvedValue(onPlace);
      await recordPosSaleAction(
        { error: null },
        form([["sessionId", "sess_1"], ["method", "TWINT"], ["lines", cart]]),
      );
      // The tracked line (el_1 × 2) moves; the custom line (elementId null) does not.
      expect(removeFromPlace).toHaveBeenCalledTimes(1);
      expect(removeFromPlace).toHaveBeenCalledWith(
        tx,
        { stockPlaceId: "place_1", elementId: "el_1" },
        2,
        "u_1",
      );
    });

    it("moves nothing for an article with tracksStock off", async () => {
      prisma.posSession.findUnique.mockResolvedValue(onPlace);
      tx.stockElement.findMany.mockResolvedValue([]); // el_1 is sold but not counted
      await recordPosSaleAction(
        { error: null },
        form([["sessionId", "sess_1"], ["method", "TWINT"], ["lines", cart]]),
      );
      expect(removeFromPlace).not.toHaveBeenCalled();
    });

    it("moves nothing for an all-custom sale even with a shelf set", async () => {
      prisma.posSession.findUnique.mockResolvedValue(onPlace);
      const custom = JSON.stringify([{ elementId: null, label: "Tip", unitPrice: 100, quantity: 1 }]);
      await recordPosSaleAction(
        { error: null },
        form([["sessionId", "sess_1"], ["method", "TWINT"], ["lines", custom]]),
      );
      expect(removeFromPlace).not.toHaveBeenCalled();
    });

    it("still refreshes the stock screen", async () => {
      prisma.posSession.findUnique.mockResolvedValue(onPlace);
      await recordPosSaleAction(
        { error: null },
        form([["sessionId", "sess_1"], ["method", "TWINT"], ["lines", cart]]),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/stock");
    });
  });
});
