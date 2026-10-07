import { AccountType, type MoneyAccountType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { decimalToNumber } from "@/lib/utils";

/**
 * The accounting figures of one edition — money account balances, budget vs
 * actuals, and earnings/spendings split by budget and by cost center. The
 * dashboard draws them and the controlling export writes them out, so both read
 * this one computation instead of each summing the journal its own way.
 */

type Amount = { toString(): string };
type Entry = { accountType: AccountType; amount: Amount };

function sumAmounts(items: { amount: Amount }[]) {
  return items.reduce((total, item) => total + decimalToNumber(item.amount), 0);
}

/**
 * The association as its own counterparty — how the bank-statement import spells
 * a move between our own accounts (see `scripts/import-bank-statement.ts`). Such
 * a move is booked twice, a charge on the account it leaves and an earning on the
 * one it reaches, so counting it would inflate both sides of the splits by the
 * same amount without a franc having been earned or spent.
 */
export const SELF_COUNTERPARTY = "BLV";

export type SplitRow = { name: string; produits: number; charges: number };
export type Split = { rows: SplitRow[]; unassigned: { produits: number; charges: number } };

export type BudgetRow = {
  name: string;
  budgetCharges: number;
  budgetProduits: number;
  budgetResult: number;
  actualCharges: number;
  actualProduits: number;
  actualResult: number;
};

export type EditionSummary = {
  moneyAccounts: { name: string; type: MoneyAccountType; balance: number }[];
  budgetRows: BudgetRow[];
  totals: Omit<BudgetRow, "name">;
  byBudget: Split;
  byCostCenter: Split;
};

export type EditionSummaryInput = {
  budgets: { name: string; budgetLines: Entry[]; journalEntries: Entry[] }[];
  costCenters: { code: string; journalEntries: Entry[] }[];
  moneyAccounts: { name: string; type: MoneyAccountType; openingBalance: Amount; journalEntries: Entry[] }[];
  /** What is booked with no budget / no cost center, transfers and opening entries left out. */
  looseBudget: { produits: number; charges: number };
  looseCostCenter: { produits: number; charges: number };
};

const side = (entries: Entry[], accountType: AccountType) =>
  sumAmounts(entries.filter((entry) => entry.accountType === accountType));

export function summarizeEdition(input: EditionSummaryInput): EditionSummary {
  const budgetRows = input.budgets.map((budget) => {
    const budgetCharges = side(budget.budgetLines, AccountType.CHARGES);
    const budgetProduits = side(budget.budgetLines, AccountType.PRODUITS);
    const actualCharges = side(budget.journalEntries, AccountType.CHARGES);
    const actualProduits = side(budget.journalEntries, AccountType.PRODUITS);
    return {
      name: budget.name,
      budgetCharges,
      budgetProduits,
      budgetResult: budgetProduits - budgetCharges,
      actualCharges,
      actualProduits,
      actualResult: actualProduits - actualCharges,
    };
  });

  const totals = budgetRows.reduce(
    (acc, row) => ({
      budgetCharges: acc.budgetCharges + row.budgetCharges,
      budgetProduits: acc.budgetProduits + row.budgetProduits,
      budgetResult: acc.budgetResult + row.budgetResult,
      actualCharges: acc.actualCharges + row.actualCharges,
      actualProduits: acc.actualProduits + row.actualProduits,
      actualResult: acc.actualResult + row.actualResult,
    }),
    { budgetCharges: 0, budgetProduits: 0, budgetResult: 0, actualCharges: 0, actualProduits: 0, actualResult: 0 },
  );

  const split = (buckets: { name: string; journalEntries: Entry[] }[], unassigned: Split["unassigned"]): Split => ({
    rows: buckets.map((bucket) => ({
      name: bucket.name,
      produits: side(bucket.journalEntries, AccountType.PRODUITS),
      charges: side(bucket.journalEntries, AccountType.CHARGES),
    })),
    unassigned,
  });

  return {
    moneyAccounts: input.moneyAccounts.map((account) => ({
      name: account.name,
      type: account.type,
      balance: account.journalEntries.reduce((total, entry) => {
        const amount = decimalToNumber(entry.amount);
        return entry.accountType === AccountType.PRODUITS ? total + amount : total - amount;
      }, decimalToNumber(account.openingBalance)),
    })),
    budgetRows,
    totals,
    byBudget: split(input.budgets, input.looseBudget),
    byCostCenter: split(
      input.costCenters.map((costCenter) => ({ name: costCenter.code, journalEntries: costCenter.journalEntries })),
      input.looseCostCenter,
    ),
  };
}

/** The edition's name and summary, or `null` when the edition does not exist. */
export async function loadEditionSummary(editionId: string) {
  const edition = await prisma.edition.findUnique({
    where: { id: editionId },
    include: {
      budgets: {
        orderBy: { name: "asc" },
        include: { budgetLines: true, journalEntries: true },
      },
      costCenters: {
        orderBy: { code: "asc" },
        include: { journalEntries: true },
      },
      moneyAccounts: {
        orderBy: { name: "asc" },
        include: { journalEntries: true },
      },
    },
  });
  if (!edition) return null;

  // What is booked but unbudgeted / unattributed. Two kinds of entry are left
  // out because neither is a spending or an earning: an opening entry, which is
  // a carried balance, and a transfer between our own accounts. Both are
  // unattributed by nature, so this is the only place they could have crept in —
  // an entry that carries a budget or a cost center is real money either way.
  const unattributed = async (field: "budgetId" | "costCenterId") => {
    const sums = await prisma.journalEntry.groupBy({
      by: ["accountType"],
      where: {
        editionId,
        isOpeningEntry: false,
        counterparty: { not: SELF_COUNTERPARTY },
        [field]: null,
      },
      _sum: { amount: true },
    });
    const of = (accountType: AccountType) =>
      decimalToNumber(sums.find((row) => row.accountType === accountType)?._sum.amount ?? 0);
    return { produits: of(AccountType.PRODUITS), charges: of(AccountType.CHARGES) };
  };
  const [looseBudget, looseCostCenter] = await Promise.all([
    unattributed("budgetId"),
    unattributed("costCenterId"),
  ]);

  return {
    edition: { id: edition.id, name: edition.name },
    summary: summarizeEdition({
      budgets: edition.budgets,
      costCenters: edition.costCenters,
      moneyAccounts: edition.moneyAccounts,
      looseBudget,
      looseCostCenter,
    }),
  };
}
