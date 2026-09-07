import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The journal's "you cannot touch that" rules.
 *
 * The three entries a cash-register closing writes carry `cashRegisterId`, and
 * `CashRegister.journaledAt` stays set forever — there is no un-book action. So
 * deleting one leg, or moving its money, would leave `/cash` still reading
 * **Booked** over a ledger that no longer matches it.
 */

const requireAdmin = vi.fn();
const requireWritableEdition = vi.fn();
const resolveWritableEditionId = vi.fn();
const assertBudgetInEdition = vi.fn();
const revalidatePath = vi.fn();

const prisma = {
  journalEntry: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(async () => []),
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/budgets", () => ({ assertBudgetInEdition: (...a: unknown[]) => assertBudgetInEdition(...a) }));
vi.mock("@/lib/edition-context", () => ({
  requireWritableEdition: (...a: unknown[]) => requireWritableEdition(...a),
  resolveWritableEditionId: () => resolveWritableEditionId(),
}));
vi.mock("@/lib/tasks", () => ({ resolvePendingTask: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma }));

const { deleteJournalEntryAction, updateJournalEntryAction, bulkUpdateJournalEntriesAction } = await import(
  "./actions"
);

/** What a booked register's entry looks like coming back from the database. */
const booked = {
  editionId: "ed_1",
  isOpeningEntry: false,
  cashRegisterId: "reg_1",
  amount: "120.00",
  accountType: "CHARGES",
  moneyAccountId: "acc_cash",
  linkedInvoice: null,
};

const plain = { ...booked, cashRegisterId: null };

function updateForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("journalEntryId", "je_1");
  fd.set("budgetId", "bud_1");
  fd.set("moneyAccountId", "acc_cash");
  fd.set("accountType", "CHARGES");
  fd.set("date", "2026-08-01");
  fd.set("amount", "120.00");
  fd.set("label", "Register float — Bar 1");
  for (const [k, v] of Object.entries(overrides)) {
    if (v === "") fd.delete(k);
    else fd.set(k, v);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "u_admin" });
  requireWritableEdition.mockResolvedValue(undefined);
  assertBudgetInEdition.mockResolvedValue(undefined);
  prisma.$transaction.mockResolvedValue([]);
});

describe("deleteJournalEntryAction", () => {
  it("refuses an entry a cash register booked", async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(booked);

    const fd = new FormData();
    fd.set("journalEntryId", "je_1");
    const result = await deleteJournalEntryAction({ error: null }, fd);

    expect(result.error).toMatch(/cash register closing/);
    expect(prisma.journalEntry.delete).not.toHaveBeenCalled();
  });

  it("still deletes an ordinary entry", async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(plain);

    const fd = new FormData();
    fd.set("journalEntryId", "je_1");
    const result = await deleteJournalEntryAction({ error: null }, fd);

    expect(result.error).toBeNull();
    expect(prisma.journalEntry.delete).toHaveBeenCalledWith({ where: { id: "je_1" } });
  });
});

describe("updateJournalEntryAction", () => {
  it("lets a booked entry be re-labelled, re-dated and re-budgeted", async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(booked);

    const result = await updateJournalEntryAction(
      { error: null },
      updateForm({ label: "Bar 1 — float", date: "2026-08-02", budgetId: "bud_2" }),
    );

    expect(result.error).toBeNull();
    expect(prisma.journalEntry.update).toHaveBeenCalled();
  });

  it("refuses a changed amount on a booked entry", async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(booked);

    const result = await updateJournalEntryAction({ error: null }, updateForm({ amount: "130.00" }));

    expect(result.error).toMatch(/cash register closing/);
    expect(prisma.journalEntry.update).not.toHaveBeenCalled();
  });

  it("refuses a flipped direction on a booked entry", async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(booked);

    const result = await updateJournalEntryAction({ error: null }, updateForm({ accountType: "PRODUITS" }));

    expect(result.error).toMatch(/cash register closing/);
  });

  it("refuses moving a booked entry to another money account", async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(booked);

    const result = await updateJournalEntryAction({ error: null }, updateForm({ moneyAccountId: "acc_bank" }));

    expect(result.error).toMatch(/cash register closing/);
  });

  it("leaves an ordinary entry's amount alone", async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(plain);

    const result = await updateJournalEntryAction({ error: null }, updateForm({ amount: "130.00" }));

    expect(result.error).toBeNull();
    expect(prisma.journalEntry.update).toHaveBeenCalled();
  });
});

describe("bulkUpdateJournalEntriesAction", () => {
  function bulkForm(row: Record<string, string>): FormData {
    const fd = new FormData();
    fd.set(
      "entries",
      JSON.stringify([
        {
          journalEntryId: "je_1",
          budgetId: "bud_1",
          moneyAccountId: "acc_cash",
          accountType: "CHARGES",
          date: "2026-08-01",
          amount: "120.00",
          label: "Register float — Bar 1",
          ...row,
        },
      ]),
    );
    return fd;
  }

  it("refuses a booked entry whose amount the grid changed", async () => {
    prisma.journalEntry.findMany.mockResolvedValue([{ id: "je_1", ...booked }]);

    const result = await bulkUpdateJournalEntriesAction({ error: null }, bulkForm({ amount: "130.00" }));

    expect(result.error).toMatch(/cash register closing/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("saves a booked entry the grid only re-labelled", async () => {
    prisma.journalEntry.findMany.mockResolvedValue([{ id: "je_1", ...booked }]);

    const result = await bulkUpdateJournalEntriesAction({ error: null }, bulkForm({ label: "Bar 1 — float" }));

    expect(result.error).toBeNull();
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
