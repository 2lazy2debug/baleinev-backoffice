import { beforeEach, describe, expect, it, vi } from "vitest";

// The things these actions reach for that a test process has no real version
// of. Mocked once; each test drives the return values.
const getCurrentUserAccess = vi.fn();
const canManageMoneyAccounts = vi.fn();
const requireAdmin = vi.fn();
const resolveWritableEditionId = vi.fn();
const assertBudgetInEdition = vi.fn();
const registerFigures = vi.fn();
const revalidatePath = vi.fn();

const tx = {
  cashRegister: { create: vi.fn(), update: vi.fn() },
  cashCount: { createMany: vi.fn() },
  journalEntry: { aggregate: vi.fn(), create: vi.fn() },
  $executeRaw: vi.fn(),
};
const prisma = {
  moneyAccount: { findUnique: vi.fn() },
  cashRegister: { findUnique: vi.fn() },
  posSession: { findFirst: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({
  getCurrentUserAccess: () => getCurrentUserAccess(),
  canManageMoneyAccounts: (...a: unknown[]) => canManageMoneyAccounts(...a),
  requireAdmin: () => requireAdmin(),
}));
vi.mock("@/lib/budgets", () => ({
  assertBudgetInEdition: (...a: unknown[]) => assertBudgetInEdition(...a),
}));
// Keep the real plannedEntries — the whole point of the helper is that the
// action and the modal share it. Only the DB-reading half is mocked.
vi.mock("@/lib/cash-register", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cash-register")>()),
  registerFigures: (...a: unknown[]) => registerFigures(...a),
}));
vi.mock("@/lib/edition-context", () => ({ resolveWritableEditionId: () => resolveWritableEditionId() }));
vi.mock("@/lib/db", () => ({ prisma }));

const { openCashRegisterAction, closeCashRegisterAction, journalCashRegisterAction } = await import("./actions");

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

function journalForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("registerId", "reg_1");
  fd.set("budgetId", "bud_1");
  for (const [k, v] of Object.entries(overrides)) {
    if (v === "") fd.delete(k);
    else fd.set(k, v);
  }
  return fd;
}

const CLOSED_AT = new Date("2026-08-01T22:00:00.000Z");

/** float / cashTaken / expected / actual / gap in rappen; the rest derived. */
function figures(float: number, cashTaken: number, actual: number) {
  const expected = float + cashTaken;
  return { float, cashTaken, expected, actual, gap: expected - actual, sessionCount: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserAccess.mockResolvedValue({ id: "u_1", role: "ADMIN", departmentNames: [] });
  canManageMoneyAccounts.mockReturnValue(true);
  requireAdmin.mockResolvedValue({ id: "u_1", role: "ADMIN", departmentNames: [] });
  resolveWritableEditionId.mockResolvedValue("ed_1");
  assertBudgetInEdition.mockResolvedValue(undefined);
  registerFigures.mockResolvedValue(figures(10000, 25000, 34000));
  prisma.moneyAccount.findUnique.mockResolvedValue({ editionId: "ed_1", type: "CASH" });
  prisma.cashRegister.findUnique.mockResolvedValue({ editionId: "ed_1", closedAt: null });
  prisma.posSession.findFirst.mockResolvedValue(null);
  tx.cashRegister.create.mockResolvedValue({ id: "reg_1" });
  tx.journalEntry.aggregate.mockResolvedValue({ _max: { sequenceNumber: 7 } });
  tx.journalEntry.create.mockResolvedValue({});
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

  it("refuses to close while a POS session is still on the register", async () => {
    prisma.posSession.findFirst.mockResolvedValue({ id: "sess_1" });
    const result = await closeCashRegisterAction({ error: null }, closeForm());
    expect(result.error).toMatch(/point-of-sale session is still using this register/i);
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

describe("journalCashRegisterAction", () => {
  const closedUnbooked = {
    editionId: "ed_1",
    name: "Bar 1",
    moneyAccountId: "acc_cash",
    closedAt: CLOSED_AT,
    journaledAt: null,
  };

  /** The rows `tx.journalEntry.create` was asked to write, in order. */
  function writtenEntries() {
    return tx.journalEntry.create.mock.calls.map((call) => call[0].data);
  }

  it("refuses a non-admin, even one who can manage money accounts", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized."));
    const result = await journalCashRegisterAction({ error: null }, journalForm());
    expect(result.error).toMatch(/unauthorized/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a register that is not in the current edition", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue({ ...closedUnbooked, editionId: "ed_other" });
    const result = await journalCashRegisterAction({ error: null }, journalForm());
    expect(result.error).toMatch(/no longer exists/i);
  });

  it("refuses a register that has not been counted back", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue({ ...closedUnbooked, closedAt: null });
    const result = await journalCashRegisterAction({ error: null }, journalForm());
    expect(result.error).toMatch(/count the register back in/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a second booking", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue({ ...closedUnbooked, journaledAt: new Date() });
    const result = await journalCashRegisterAction({ error: null }, journalForm());
    expect(result.error).toMatch(/already been booked/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses while a POS session on the register is still running", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(closedUnbooked);
    prisma.posSession.findFirst.mockResolvedValue({ id: "sess_1" });
    const result = await journalCashRegisterAction({ error: null }, journalForm());
    expect(result.error).toMatch(/still running/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires a budget and checks it belongs to the edition", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(closedUnbooked);
    const missing = await journalCashRegisterAction({ error: null }, journalForm({ budgetId: "" }));
    expect(missing.error).toMatch(/budgetId is required/i);

    assertBudgetInEdition.mockRejectedValue(new Error("That budget does not belong to the active edition."));
    const wrong = await journalCashRegisterAction({ error: null }, journalForm());
    expect(wrong.error).toMatch(/does not belong/i);
  });

  it("writes two entries and no correction when the till balances", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(closedUnbooked);
    // float 100.00, no sales, counted back 100.00
    registerFigures.mockResolvedValue(figures(10000, 0, 10000));

    const result = await journalCashRegisterAction({ error: null }, journalForm());
    expect(result).toEqual({ error: null });

    const rows = writtenEntries();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.accountType, row.amount])).toEqual([
      ["CHARGES", 100],
      ["PRODUITS", 100],
    ]);
    // Consecutive sequence numbers off the max, dated closedAt, tagged with the register.
    expect(rows.map((row) => row.sequenceNumber)).toEqual([8, 9]);
    expect(rows.every((row) => row.date === CLOSED_AT)).toBe(true);
    expect(rows.every((row) => row.cashRegisterId === "reg_1")).toBe(true);
    expect(rows.every((row) => row.moneyAccountId === "acc_cash")).toBe(true);
    expect(tx.cashRegister.update).toHaveBeenCalledWith({
      where: { id: "reg_1" },
      data: { journaledAt: expect.any(Date), journaledById: "u_1" },
    });
  });

  it("adds an 'over' correction as PRODUITS, net movement = actual - float", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(closedUnbooked);
    // float 100, cash sales 250, counted back 360 → expected 350, gap -10 (over)
    registerFigures.mockResolvedValue(figures(10000, 25000, 36000));

    const result = await journalCashRegisterAction({ error: null }, journalForm());
    expect(result).toEqual({ error: null });

    const rows = writtenEntries();
    expect(rows.map((row) => [row.accountType, row.amount])).toEqual([
      ["CHARGES", 100],
      ["PRODUITS", 350],
      ["PRODUITS", 10],
    ]);
    const net = rows.reduce((sum, row) => sum + (row.accountType === "PRODUITS" ? row.amount : -row.amount), 0);
    expect(net).toBeCloseTo(260); // actual 360 − float 100
  });

  it("books a shortage as CHARGES — a missing CHF 10 is a loss, not a produit", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(closedUnbooked);
    // float 100, cash sales 250 → the drawer should hold 350; it holds 340, so it
    // is CHF 10 short. That shortage is money lost, so entry 3 is a CHARGES.
    registerFigures.mockResolvedValue(figures(10000, 25000, 34000));

    const result = await journalCashRegisterAction({ error: null }, journalForm());
    const rows = writtenEntries();
    expect(rows.map((row) => [row.accountType, row.amount])).toEqual([
      ["CHARGES", 100], // float out
      ["PRODUITS", 350], // returned in
      ["CHARGES", 10], // shortage — a loss, booked out
    ]);
    const net = rows.reduce((sum, row) => sum + (row.accountType === "PRODUITS" ? row.amount : -row.amount), 0);
    expect(net).toBeCloseTo(240); // actual 340 − float 100
    expect(result).toEqual({ error: null });
  });

  it("adds a larger 'short' correction the same way", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(closedUnbooked);
    // float 100, cash sales 250, counted back 330 → expected 350, gap +20 (short)
    registerFigures.mockResolvedValue(figures(10000, 25000, 33000));

    const result = await journalCashRegisterAction({ error: null }, journalForm());
    const rows = writtenEntries();
    expect(rows.map((row) => [row.accountType, row.amount])).toEqual([
      ["CHARGES", 100],
      ["PRODUITS", 350],
      ["CHARGES", 20],
    ]);
    const net = rows.reduce((sum, row) => sum + (row.accountType === "PRODUITS" ? row.amount : -row.amount), 0);
    expect(net).toBeCloseTo(230); // actual 330 − float 100
    expect(result).toEqual({ error: null });
  });

  it("flips entry 2 to CHARGES when the till paid out more than it took", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(closedUnbooked);
    // float 100, cash sales −150 (all refunds), counted back 0 → expected −50, gap −50
    registerFigures.mockResolvedValue(figures(10000, -15000, 0));

    await journalCashRegisterAction({ error: null }, journalForm());
    const rows = writtenEntries();
    expect(rows.map((row) => [row.accountType, row.amount])).toEqual([
      ["CHARGES", 100],
      ["CHARGES", 50],
      ["PRODUITS", 50],
    ]);
  });

  it("uses a supplied date over closedAt", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(closedUnbooked);
    registerFigures.mockResolvedValue(figures(10000, 0, 10000));

    await journalCashRegisterAction({ error: null }, journalForm({ date: "2026-08-15" }));
    const rows = writtenEntries();
    expect(rows.every((row) => row.date.toISOString().slice(0, 10) === "2026-08-15")).toBe(true);
  });

  it("passes the optional cost centre through", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(closedUnbooked);
    registerFigures.mockResolvedValue(figures(10000, 0, 10000));

    await journalCashRegisterAction({ error: null }, journalForm({ costCenterId: "cc_1" }));
    expect(writtenEntries().every((row) => row.costCenterId === "cc_1")).toBe(true);

    tx.journalEntry.create.mockClear();
    await journalCashRegisterAction({ error: null }, journalForm());
    expect(writtenEntries().every((row) => row.costCenterId === null)).toBe(true);
  });

  it("takes the advisory lock before reading the max sequence", async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(closedUnbooked);
    registerFigures.mockResolvedValue(figures(10000, 0, 10000));

    await journalCashRegisterAction({ error: null }, journalForm());
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.journalEntry.aggregate.mock.invocationCallOrder[0],
    );
    expect(revalidatePath).toHaveBeenCalledWith("/journal");
  });
});
