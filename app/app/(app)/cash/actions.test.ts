import { beforeEach, describe, expect, it, vi } from "vitest";

// The four things these actions reach for that a test process has no real
// version of. Mocked once; each test drives the return values.
const getCurrentUserAccess = vi.fn();
const canManageMoneyAccounts = vi.fn();
const resolveWritableEditionId = vi.fn();
const revalidatePath = vi.fn();

const tx = {
  cashRegister: { create: vi.fn(), update: vi.fn() },
  cashCount: { createMany: vi.fn() },
};
const prisma = {
  moneyAccount: { findUnique: vi.fn() },
  cashRegister: { findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({
  getCurrentUserAccess: () => getCurrentUserAccess(),
  canManageMoneyAccounts: (...a: unknown[]) => canManageMoneyAccounts(...a),
}));
vi.mock("@/lib/edition-context", () => ({ resolveWritableEditionId: () => resolveWritableEditionId() }));
vi.mock("@/lib/db", () => ({ prisma }));

const { openCashRegisterAction, closeCashRegisterAction } = await import("./actions");

function openForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("moneyAccountId", "acc_cash");
  fd.set("name", "Bar 1");
  fd.set("opening-1000", "5"); // 5 × CHF 10
  fd.set("opening-200", "3"); // 3 × CHF 2
  for (const [k, v] of Object.entries(overrides)) {
    if (v === "") fd.delete(k);
    else fd.set(k, v);
  }
  return fd;
}

function closeForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("registerId", "reg_1");
  fd.set("closing-5000", "1");
  for (const [k, v] of Object.entries(overrides)) {
    if (v === "") fd.delete(k);
    else fd.set(k, v);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserAccess.mockResolvedValue({ id: "u_1", role: "ADMIN", departmentNames: [] });
  canManageMoneyAccounts.mockReturnValue(true);
  resolveWritableEditionId.mockResolvedValue("ed_1");
  prisma.moneyAccount.findUnique.mockResolvedValue({ editionId: "ed_1", type: "CASH" });
  prisma.cashRegister.findUnique.mockResolvedValue({ editionId: "ed_1", closedAt: null });
  tx.cashRegister.create.mockResolvedValue({ id: "reg_1" });
  prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe("openCashRegisterAction", () => {
  it("refuses anyone who cannot manage money accounts", async () => {
    canManageMoneyAccounts.mockReturnValue(false);
    const result = await openCashRegisterAction({ error: null }, openForm());
    expect(result.error).toMatch(/admin or the accounting team/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a bank account", async () => {
    prisma.moneyAccount.findUnique.mockResolvedValue({ editionId: "ed_1", type: "BANK" });
    const result = await openCashRegisterAction({ error: null }, openForm());
    expect(result.error).toMatch(/cash account/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a cash account from another edition", async () => {
    prisma.moneyAccount.findUnique.mockResolvedValue({ editionId: "ed_other", type: "CASH" });
    const result = await openCashRegisterAction({ error: null }, openForm());
    expect(result.error).toMatch(/cash account/i);
  });

  it("refuses a float that totals zero", async () => {
    const result = await openCashRegisterAction({ error: null }, openForm({ "opening-1000": "", "opening-200": "" }));
    expect(result.error).toMatch(/count the float/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a non-integer count", async () => {
    const result = await openCashRegisterAction({ error: null }, openForm({ "opening-1000": "2.5" }));
    expect(result.error).toMatch(/whole numbers/i);
  });

  it("creates the register and its OPENING counts, zeros skipped", async () => {
    const result = await openCashRegisterAction({ error: null }, openForm({ "opening-50": "0" }));
    expect(result).toEqual({ error: null });
    expect(tx.cashRegister.create).toHaveBeenCalledWith({
      data: { editionId: "ed_1", moneyAccountId: "acc_cash", name: "Bar 1", openedById: "u_1" },
    });
    const rows = tx.cashCount.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows.every((r: { kind: string }) => r.kind === "OPENING")).toBe(true);
    expect(rows.map((r: { denomination: number }) => r.denomination).sort((a: number, b: number) => a - b)).toEqual([200, 1000]);
    expect(revalidatePath).toHaveBeenCalledWith("/cash");
  });
});

describe("closeCashRegisterAction", () => {
  it("refuses a register that is not in the current edition", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue({ editionId: "ed_other", closedAt: null });
    const result = await closeCashRegisterAction({ error: null }, closeForm());
    expect(result.error).toMatch(/no longer exists/i);
  });

  it("refuses a register that is already closed", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue({ editionId: "ed_1", closedAt: new Date() });
    const result = await closeCashRegisterAction({ error: null }, closeForm());
    expect(result.error).toMatch(/already closed/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an empty closing sheet without the confirmation", async () => {
    const result = await closeCashRegisterAction({ error: null }, closeForm({ "closing-5000": "" }));
    expect(result.error).toMatch(/tick the box/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("accepts an empty closing sheet with the confirmation, writing no counts", async () => {
    const result = await closeCashRegisterAction(
      { error: null },
      closeForm({ "closing-5000": "", confirmEmpty: "on" }),
    );
    expect(result).toEqual({ error: null });
    expect(tx.cashCount.createMany).not.toHaveBeenCalled();
    expect(tx.cashRegister.update).toHaveBeenCalledWith({
      where: { id: "reg_1" },
      data: { closedAt: expect.any(Date), closedById: "u_1" },
    });
  });

  it("writes the CLOSING counts and closes the register", async () => {
    const result = await closeCashRegisterAction({ error: null }, closeForm());
    expect(result).toEqual({ error: null });
    const rows = tx.cashCount.createMany.mock.calls[0][0].data;
    expect(rows).toEqual([{ registerId: "reg_1", kind: "CLOSING", denomination: 5000, quantity: 1 }]);
    expect(tx.cashRegister.update).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/cash");
  });
});
