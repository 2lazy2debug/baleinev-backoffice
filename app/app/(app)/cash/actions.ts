"use server";

import { AccountType, CashCountKind, MoneyAccountType, PosSessionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { canManageMoneyAccounts, getCurrentUserAccess, requireAdmin } from "@/lib/access";
import { assertBudgetInEdition } from "@/lib/budgets";
import { CASH_DENOMINATIONS, fromRappen } from "@/lib/cash";
import { registerFigures } from "@/lib/cash-register";
import { prisma } from "@/lib/db";
import { resolveWritableEditionId } from "@/lib/edition-context";
import { type ActionState, getRequiredString, toActionErrorMessage } from "@/lib/server-action-helpers";

/**
 * Opening and closing a till. Both are counting, not booking: nothing here
 * writes to the journal — the three entries a closed register produces are
 * 106's job, from these two count sheets and what the POS sold.
 *
 * A till is money leaving a cash account, so who may touch it is exactly who may
 * touch money accounts: `canManageMoneyAccounts`. No new role.
 */

type ParsedCount = { denomination: number; quantity: number };

/** The twelve `${prefix}-<denomination>` fields as a sheet, zeros dropped. */
function parseCounts(formData: FormData, prefix: "opening" | "closing"): ParsedCount[] {
  const counts: ParsedCount[] = [];

  for (const denomination of CASH_DENOMINATIONS) {
    const raw = String(formData.get(`${prefix}-${denomination}`) ?? "").trim();
    if (!raw) {
      continue;
    }

    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error("Counts must be whole numbers of coins and notes.");
    }

    // A zero row means "counted, none" and a missing row means the same thing —
    // storing twelve rows per register for no reason only makes 106's reads longer.
    if (quantity > 0) {
      counts.push({ denomination, quantity });
    }
  }

  return counts;
}

function sheetTotal(counts: ParsedCount[]): number {
  return counts.reduce((total, { denomination, quantity }) => total + denomination * quantity, 0);
}

async function requireCashManager() {
  const access = await getCurrentUserAccess();

  if (!canManageMoneyAccounts(access)) {
    throw new Error("Only an admin or the accounting team can open a register.");
  }

  return access;
}

export async function openCashRegisterAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await requireCashManager();
    const editionId = await resolveWritableEditionId();
    const moneyAccountId = getRequiredString(formData, "moneyAccountId");
    const name = getRequiredString(formData, "name");

    const account = await prisma.moneyAccount.findUnique({
      where: { id: moneyAccountId },
      select: { editionId: true, type: true },
    });

    if (!account || account.editionId !== editionId || account.type !== MoneyAccountType.CASH) {
      throw new Error("Pick a cash account. A register cannot be opened on a bank account.");
    }

    const counts = parseCounts(formData, "opening");
    if (sheetTotal(counts) === 0) {
      throw new Error("Count the float before opening the register.");
    }

    await prisma.$transaction(async (tx) => {
      const register = await tx.cashRegister.create({
        data: { editionId, moneyAccountId, name, openedById: access.id },
      });

      await tx.cashCount.createMany({
        data: counts.map((count) => ({
          registerId: register.id,
          kind: CashCountKind.OPENING,
          denomination: count.denomination,
          quantity: count.quantity,
        })),
      });
    });

    revalidatePath("/cash");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function closeCashRegisterAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await requireCashManager();
    const editionId = await resolveWritableEditionId();
    const registerId = getRequiredString(formData, "registerId");

    const register = await prisma.cashRegister.findUnique({
      where: { id: registerId },
      select: { editionId: true, closedAt: true },
    });

    if (!register || register.editionId !== editionId) {
      throw new Error("That register no longer exists. Refresh and try again.");
    }

    if (register.closedAt) {
      // Closing is not idempotent — a second count would silently replace the first.
      throw new Error("That register is already closed.");
    }

    // Closing the drawer under a running till is how money goes missing.
    const liveSession = await prisma.posSession.findFirst({
      where: { cashRegisterId: registerId, status: { in: ["OPEN", "PAUSED"] } },
      select: { id: true },
    });
    if (liveSession) {
      throw new Error("A point-of-sale session is still using this register. Close it first.");
    }

    const counts = parseCounts(formData, "closing");

    // A till can genuinely come back empty, but a blank sheet and an empty till
    // are indistinguishable — so an empty sheet needs an explicit confirmation.
    if (counts.length === 0 && String(formData.get("confirmEmpty") ?? "") !== "on") {
      throw new Error("Tick the box to confirm the register came back empty.");
    }

    await prisma.$transaction(async (tx) => {
      if (counts.length > 0) {
        await tx.cashCount.createMany({
          data: counts.map((count) => ({
            registerId,
            kind: CashCountKind.CLOSING,
            denomination: count.denomination,
            quantity: count.quantity,
          })),
        });
      }

      await tx.cashRegister.update({
        where: { id: registerId },
        data: { closedAt: new Date(), closedById: access.id },
      });
    });

    revalidatePath("/cash");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

/**
 * Booking a closed register into the journal — the last step of a till's life
 * and the only one that writes to the ledger, so it is **admin only**, unlike
 * opening and closing.
 *
 * Three entries, all on the register's cash `MoneyAccount`, all dated its
 * `closedAt` unless a date is given:
 *
 *   1. CHARGES `float`            — the float that went in
 *   2. PRODUITS `expected`        — what the drawer should have returned
 *      (flips to CHARGES with `abs(expected)` for a till that paid out more
 *      than it took)
 *   3. CHARGES `gap` if short, PRODUITS `abs(gap)` if over — the user correction
 *
 * Any entry whose amount is zero is skipped — a correction of nothing is noise,
 * and a zero float is not a movement. The net effect on the cash account is
 * exactly `actual - float`: what was counted back, less what went in.
 *
 * Booking is once and only once: a second press is refused so the journal is
 * never doubled.
 */
export async function journalCashRegisterAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const editionId = await resolveWritableEditionId();
    const registerId = getRequiredString(formData, "registerId");
    const budgetId = getRequiredString(formData, "budgetId");
    const costCenterId = String(formData.get("costCenterId") ?? "").trim() || null;

    const register = await prisma.cashRegister.findUnique({
      where: { id: registerId },
      select: { editionId: true, name: true, moneyAccountId: true, closedAt: true, journaledAt: true },
    });

    if (!register || register.editionId !== editionId) {
      throw new Error("That register no longer exists. Refresh and try again.");
    }

    if (!register.closedAt) {
      throw new Error("Count the register back in before booking it.");
    }

    if (register.journaledAt) {
      throw new Error("This register has already been booked.");
    }

    const liveSession = await prisma.posSession.findFirst({
      where: { cashRegisterId: registerId, status: { not: PosSessionStatus.CLOSED } },
      select: { id: true },
    });
    if (liveSession) {
      throw new Error("A point-of-sale session on this register is still running. Close it first.");
    }

    await assertBudgetInEdition(budgetId, editionId);

    const dateRaw = String(formData.get("date") ?? "").trim();
    let date = register.closedAt;
    if (dateRaw) {
      date = new Date(dateRaw);
      if (Number.isNaN(date.getTime())) {
        throw new Error("Date is invalid.");
      }
    }

    const figures = await registerFigures(prisma, registerId);

    // Amounts are always positive in JournalEntry; the direction is accountType.
    const planned = [
      {
        accountType: AccountType.CHARGES,
        amount: figures.float,
        label: `Register float — ${register.name}`,
      },
      {
        accountType: figures.expected >= 0 ? AccountType.PRODUITS : AccountType.CHARGES,
        amount: Math.abs(figures.expected),
        label: `Register returned — ${register.name}`,
      },
      {
        accountType: figures.gap > 0 ? AccountType.CHARGES : AccountType.PRODUITS,
        amount: Math.abs(figures.gap),
        label: `User correction — ${register.name}`,
      },
    ].filter((entry) => entry.amount > 0);

    await prisma.$transaction(async (tx) => {
      // Same sequence discipline as createJournalEntryAction: take the
      // per-edition advisory lock once, then allocate all three numbers under
      // it — three creates that each read the max collide on
      // @@unique([editionId, sequenceNumber]).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${editionId})::bigint)`;

      const maxSequence = await tx.journalEntry.aggregate({
        where: { editionId, sequenceNumber: { gt: 0 } },
        _max: { sequenceNumber: true },
      });
      let sequenceNumber = maxSequence._max.sequenceNumber ?? 0;

      for (const entry of planned) {
        sequenceNumber += 1;
        await tx.journalEntry.create({
          data: {
            editionId,
            sequenceNumber,
            budgetId,
            moneyAccountId: register.moneyAccountId,
            accountType: entry.accountType,
            date,
            amount: fromRappen(entry.amount),
            label: entry.label,
            costCenterId,
            cashRegisterId: registerId,
            enteredById: admin.id,
            isOpeningEntry: false,
          },
        });
      }

      await tx.cashRegister.update({
        where: { id: registerId },
        data: { journaledAt: new Date(), journaledById: admin.id },
      });
    });

    revalidatePath("/cash");
    revalidatePath("/journal");
    revalidatePath("/");
    revalidatePath("/money-accounts");
    revalidatePath("/cost-centers");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
