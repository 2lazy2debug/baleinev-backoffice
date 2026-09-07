import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The /cash screen's own gate.
 *
 * Not a rendering test — the tree is the build's job. What is asserted here is
 * the *logic* the page carries: who is allowed to reach it at all, and which
 * reads are skipped for someone who is allowed in but cannot book.
 */

const requireMoneyAccountManager = vi.fn();
const isAdmin = vi.fn();
const resolveEditionIdOrNull = vi.fn();
const editionBudgets = vi.fn();
const registerFigures = vi.fn();

const prisma = {
  moneyAccount: { findMany: vi.fn() },
  cashRegister: { findMany: vi.fn() },
  costCenter: { findMany: vi.fn() },
};

vi.mock("@/lib/access", () => ({
  requireMoneyAccountManager: () => requireMoneyAccountManager(),
  isAdmin: (...a: unknown[]) => isAdmin(...a),
}));
vi.mock("@/lib/budgets", () => ({ editionBudgets: (...a: unknown[]) => editionBudgets(...a) }));
vi.mock("@/lib/cash-register", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cash-register")>()),
  registerFigures: (...a: unknown[]) => registerFigures(...a),
}));
vi.mock("@/lib/edition-context", () => ({ resolveEditionIdOrNull: () => resolveEditionIdOrNull() }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  getLocale: async () => "en",
}));

// The page's view layer, stubbed to nothing: none of it runs in a node test.
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("@/components/edition-read-only", () => ({ WritableEditionOnly: () => null }));
vi.mock("@/components/ui", () => ({
  EmptyPage: () => null,
  PageHeader: () => null,
  buttonClasses: () => "",
}));
vi.mock("./client", () => ({ CashRegistersClient: () => null }));
vi.mock("./open-register-modal", () => ({ default: () => null }));

const { default: CashPage } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  requireMoneyAccountManager.mockResolvedValue({ id: "u1", role: "DEPARTMENT" });
  isAdmin.mockReturnValue(false);
  resolveEditionIdOrNull.mockResolvedValue("ed_1");
  prisma.moneyAccount.findMany.mockResolvedValue([{ id: "acc_cash", name: "Bar" }]);
  prisma.cashRegister.findMany.mockResolvedValue([]);
  prisma.costCenter.findMany.mockResolvedValue([]);
  editionBudgets.mockResolvedValue([]);
});

describe("CashPage", () => {
  it("refuses anyone who may not manage money accounts", async () => {
    requireMoneyAccountManager.mockRejectedValue(new Error("Unauthorized."));

    await expect(CashPage()).rejects.toThrow("Unauthorized.");
    expect(prisma.cashRegister.findMany).not.toHaveBeenCalled();
  });

  it("gates before the edition is even resolved", async () => {
    requireMoneyAccountManager.mockRejectedValue(new Error("Unauthorized."));

    await expect(CashPage()).rejects.toThrow();
    expect(resolveEditionIdOrNull).not.toHaveBeenCalled();
  });

  it("does not read budgets or cost centres for a non-admin cash manager", async () => {
    await CashPage();

    expect(prisma.cashRegister.findMany).toHaveBeenCalled();
    expect(editionBudgets).not.toHaveBeenCalled();
    expect(prisma.costCenter.findMany).not.toHaveBeenCalled();
  });

  it("reads them for an admin, who can open the booking modal", async () => {
    isAdmin.mockReturnValue(true);

    await CashPage();

    expect(editionBudgets).toHaveBeenCalledWith("ed_1");
    expect(prisma.costCenter.findMany).toHaveBeenCalled();
  });
});
