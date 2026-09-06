"use server";

import { CashCountKind, MoneyAccountType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { canManageMoneyAccounts, getCurrentUserAccess } from "@/lib/access";
import { CASH_DENOMINATIONS } from "@/lib/cash";
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
