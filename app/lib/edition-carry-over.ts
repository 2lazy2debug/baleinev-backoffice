import { AccountType, Prisma } from "@prisma/client";

import { decimalToNumber } from "@/lib/utils";

/** The *solde à nouveau* label, carried over from the closing edition. */
export const CARRY_OVER_LABEL = "Report édition précédente";

/**
 * Brings an edition's structure, budget and closing balances into another
 * edition: budgets with their lines and department attachments, cost centers
 * and money accounts, plus one locked opening entry per account that does not
 * close at zero.
 *
 * A year's budget is mostly last year's budget with different amounts, so it is
 * copied verbatim — the admin edits the numbers afterwards rather than typing
 * every line again.
 *
 * Runs inside the caller's transaction so a failed copy leaves no
 * half-populated edition behind.
 */
export async function carryOverEdition(
  tx: Prisma.TransactionClient,
  sourceEditionId: string,
  targetEditionId: string,
): Promise<void> {
  if (sourceEditionId === targetEditionId) {
    throw new Error("An edition cannot be carried over into itself.");
  }

  const source = await tx.edition.findUnique({
    where: { id: sourceEditionId },
    include: {
      budgets: { include: { budgetLines: true, departments: true } },
      costCenters: true,
      moneyAccounts: { include: { journalEntries: true } },
    },
  });

  if (!source) {
    throw new Error("The edition to bring data over from was not found.");
  }

  for (const budget of source.budgets) {
    if (budget.budgetLines.length === 0) {
      continue;
    }

    // The departments are edition-independent and already exist — what carries
    // over is the budget itself, its name, and which departments watch it.
    const carried = await tx.budget.create({
      data: {
        editionId: targetEditionId,
        name: budget.name,
        departments: {
          create: budget.departments.map((attachment) => ({ departmentId: attachment.departmentId })),
        },
      },
    });

    await tx.budgetLine.createMany({
      data: budget.budgetLines.map((line) => ({
        budgetId: carried.id,
        accountType: line.accountType,
        // Free text from the workbook ("Septembre", …), not a dated value, so
        // it stays true in the new edition.
        billingMonth: line.billingMonth,
        label: line.label,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        amount: line.amount,
        notes: line.notes,
        // The budget page orders lines by `createdAt`, and every row written in
        // one transaction shares the same `now()`. Keeping the source timestamp
        // is what makes the carried budget read in the order it was planned in.
        createdAt: line.createdAt,
      })),
    });
  }

  for (const costCenter of source.costCenters) {
    await tx.costCenter.create({
      data: { editionId: targetEditionId, code: costCenter.code, name: costCenter.name },
    });
  }

  // Opening entries share the edition's sequence space — JournalEntry carries
  // @@unique([editionId, sequenceNumber]) — so each one takes its own number.
  // Regular entries continue from the highest of these, because
  // createJournalEntryAction maxes over sequenceNumber > 0.
  let sequenceNumber = 0;

  for (const account of source.moneyAccounts) {
    const carried = await tx.moneyAccount.create({
      data: {
        editionId: targetEditionId,
        name: account.name,
        type: account.type,
        // The carried amount is expressed as the opening entry below. Writing it
        // here as well would count it twice, since a balance is
        // openingBalance + entries.
        openingBalance: 0,
        // Without the bank identity a carried-over account cannot produce a
        // Swiss QR invoice.
        iban: account.iban,
        beneficiaryName: account.beneficiaryName,
        beneficiaryAddress: account.beneficiaryAddress,
        beneficiaryPostalCode: account.beneficiaryPostalCode,
        beneficiaryCity: account.beneficiaryCity,
        beneficiaryCountry: account.beneficiaryCountry,
      },
    });

    // Same definition of a balance the rest of the app uses: the account's own
    // opening balance plus every movement on it.
    const closingBalance = account.journalEntries.reduce((total, entry) => {
      const amount = decimalToNumber(entry.amount);
      return entry.accountType === AccountType.PRODUITS ? total + amount : total - amount;
    }, decimalToNumber(account.openingBalance));

    if (closingBalance === 0) {
      continue;
    }

    await tx.journalEntry.create({
      data: {
        editionId: targetEditionId,
        moneyAccountId: carried.id,
        accountType: closingBalance >= 0 ? AccountType.PRODUITS : AccountType.CHARGES,
        sequenceNumber,
        date: new Date(),
        amount: new Prisma.Decimal(Math.abs(closingBalance).toFixed(2)),
        label: CARRY_OVER_LABEL,
        isOpeningEntry: true,
      },
    });

    sequenceNumber += 1;
  }
}
