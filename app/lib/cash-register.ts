import { AccountType, CashCountKind, PosPaymentMethod, type Prisma, type PrismaClient } from "@prisma/client";

import { countTotal, toRappen } from "@/lib/cash";

/**
 * The three numbers a closed till is booked from, plus what feeds them. All
 * integer rappen.
 *
 *   float     = the OPENING count sheet — what went into the drawer
 *   cashTaken = Σ total of every CASH `PosSale` in every session on this register
 *   expected  = float + cashTaken — what the drawer should hold
 *   actual    = the CLOSING count sheet — what was counted back
 *   gap       = expected − actual — positive means the till came back short
 *
 * `cashTaken` is the sale *totals*, not what customers handed over: the drawer
 * moved by `total` on each sale (the customer's `cashGiven` minus the
 * `changeDue` handed back is exactly that), and a negative-total sale — a
 * deposit returned — correctly subtracts.
 *
 * One function, taking a client, so the action can call it inside its
 * transaction and the screen can call it outside. Two implementations of
 * `expected` is the bug this file exists to prevent.
 */
export type RegisterFigures = {
  /** All rappen. */
  float: number;
  cashTaken: number;
  expected: number;
  actual: number;
  gap: number;
  /** How many sessions fed `cashTaken`, for the screen to name. */
  sessionCount: number;
};

export async function registerFigures(
  db: Prisma.TransactionClient | PrismaClient,
  registerId: string,
): Promise<RegisterFigures> {
  const counts = await db.cashCount.findMany({
    where: { registerId },
    select: { kind: true, denomination: true, quantity: true },
  });

  const float = countTotal(counts.filter((count) => count.kind === CashCountKind.OPENING));
  const actual = countTotal(counts.filter((count) => count.kind === CashCountKind.CLOSING));

  const cashSum = await db.posSale.aggregate({
    _sum: { total: true },
    where: { session: { cashRegisterId: registerId }, method: PosPaymentMethod.CASH },
  });
  // A register is only attached to sessions that accept cash, so every session
  // on it can feed `cashTaken`; a null sum (no cash sales yet) is 0, not NaN.
  const cashTaken = cashSum._sum.total == null ? 0 : toRappen(cashSum._sum.total);

  const sessionCount = await db.posSession.count({ where: { cashRegisterId: registerId } });

  const expected = float + cashTaken;
  const gap = expected - actual;

  return { float, cashTaken, expected, actual, gap, sessionCount };
}

/**
 * The entries a register's booking writes, in order — the one place the "which
 * account, how much, skip the zeros" rule lives, so the modal's preview and the
 * action's writes cannot drift.
 *
 * `kind` is what the row *is*; the label is the caller's to word. The stored
 * label is an English sentence (`actions.ts`); the modal's preview row is
 * localised. `amount` is always positive rappen — the direction is `accountType`.
 */
export type PlannedEntryKind = "float" | "return" | "correction";

export type PlannedEntry = {
  kind: PlannedEntryKind;
  accountType: AccountType;
  /** Positive rappen. */
  amount: number;
};

export function plannedEntries(figures: RegisterFigures): PlannedEntry[] {
  return (
    [
      { kind: "float", accountType: AccountType.CHARGES, amount: figures.float },
      {
        kind: "return",
        accountType: figures.expected >= 0 ? AccountType.PRODUITS : AccountType.CHARGES,
        amount: Math.abs(figures.expected),
      },
      {
        kind: "correction",
        accountType: figures.gap > 0 ? AccountType.CHARGES : AccountType.PRODUITS,
        amount: Math.abs(figures.gap),
      },
    ] satisfies PlannedEntry[]
  ).filter((entry) => entry.amount > 0);
}
