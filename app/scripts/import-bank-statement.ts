/**
 * Imports a BCV "Extraction transactionnelle" (LBA movement export) into the
 * journal of one edition.
 *
 * The bank statement is the source of truth for the bank account, so the import
 * REPLACES every journal entry on that account and leaves every other account
 * (the cash box) alone — except for the mirror side of a bank/cash transfer,
 * which the statement only sees from the bank's end.
 *
 * The export lists third-party movements only: BCV's own charges (frais
 * périodiques, frais annuel, …) are not in it, so the statement alone lands
 * above the real balance. The difference against --expect is booked as one
 * charge — see bookMissingCharges below.
 *
 *   npm run db:import:bank -- --dry-run
 *   npm run db:import:bank -- --apply
 *
 * Nothing is written without --apply.
 */
import path from "node:path";
import fs from "node:fs";

import { AccountType, MoneyAccountType, Prisma, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

/** Column headers of the BCV export, as they are spelled in the sheet. */
const COL = {
  date: "Date",
  direction: "Entrée/sortie",
  bookingText: "Texte comptable",
  amountChf: "Montant CHF",
  counterparty: "Contrepartie",
  communication: "Communication",
} as const;

/** `Texte comptable` values that mean "money moved between the bank and the cash box". */
const TRANSFER_BOOKING_TEXTS = new Set(["VERSEMENT", "PRELEVEMENT"]);

/**
 * The association itself. Only ever the counterpart of a movement between our
 * own accounts — an incoming payment faces whoever the bank names, not us.
 */
const SELF = "BLV";

/** The bank, as the beneficiary of its own charges. */
const BANK_COUNTERPARTY = "BCV";

type StatementRow = {
  excelRow: number;
  date: Date;
  isIncome: boolean;
  amount: number;
  counterparty: string;
  label: string;
  isTransfer: boolean;
};

type PlannedEntry = {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  date: Date;
  amount: number;
  counterparty: string | null;
  label: string;
};

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Excel serials are timezone-free — keep them that way by pinning to UTC midnight. */
function toDate(value: unknown): Date {
  if (typeof value === "number") {
    const parts = XLSX.SSF.parse_date_code(value);
    if (!parts) throw new Error(`Unreadable date serial: ${value}`);
    return new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  }

  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  throw new Error(`Unreadable date: ${String(value)}`);
}

function readStatement(workbookPath: string, skipFirst: number): StatementRow[] {
  const workbook = XLSX.read(fs.readFileSync(workbookPath), { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true,
  });

  // The export puts two title lines and a blank one above the header, so find
  // the header rather than trusting an offset.
  const headerIndex = grid.findIndex((row) => row.some((cell) => text(cell) === COL.direction));
  if (headerIndex === -1) {
    throw new Error(`No header row containing '${COL.direction}' found in ${workbookPath}.`);
  }

  const columnIndex = new Map<string, number>();
  grid[headerIndex].forEach((cell, index) => columnIndex.set(text(cell), index));

  for (const header of Object.values(COL)) {
    if (!columnIndex.has(header)) {
      throw new Error(`Column '${header}' is missing from ${workbookPath}.`);
    }
  }

  const cell = (row: unknown[], header: string) => row[columnIndex.get(header)!];

  const rows: StatementRow[] = [];

  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const row = grid[i] ?? [];
    const direction = text(cell(row, COL.direction));
    if (!direction) {
      continue;
    }

    if (direction !== "E" && direction !== "S") {
      throw new Error(`Row ${i + 1}: '${COL.direction}' is '${direction}', expected E or S.`);
    }

    const amount = round2(Number(cell(row, COL.amountChf)));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Row ${i + 1}: unusable '${COL.amountChf}' value.`);
    }

    const counterparty = text(cell(row, COL.counterparty));
    const communication = text(cell(row, COL.communication));
    // TWINT payouts carry a machine reference, not a label worth reading.
    const isTwint = /TWINT/i.test(counterparty) || /TWINT/i.test(communication);

    rows.push({
      excelRow: i + 1,
      date: toDate(cell(row, COL.date)),
      isIncome: direction === "E",
      amount,
      counterparty,
      label: isTwint ? "" : communication,
      isTransfer: TRANSFER_BOOKING_TEXTS.has(text(cell(row, COL.bookingText))),
    });
  }

  // The opening balance is stated as of *after* these, so they are not ours.
  return rows.slice(skipFirst);
}

function planEntries(
  rows: StatementRow[],
  bank: { id: string; name: string },
  cash: { id: string; name: string },
): PlannedEntry[] {
  const planned: PlannedEntry[] = [];

  for (const row of rows) {
    // Whichever way the money went, the counterpart is the other side of it —
    // the party the bank names. Naming ourselves there says nothing: an incoming
    // payment is interesting precisely because of where it came from. The one
    // exception is money moving between our own accounts, which faces BLV on
    // both legs because there is no third party in it.
    const counterparty = row.isTransfer ? SELF : row.counterparty || null;

    planned.push({
      accountId: bank.id,
      accountName: bank.name,
      accountType: row.isIncome ? AccountType.PRODUITS : AccountType.CHARGES,
      date: row.date,
      amount: row.amount,
      counterparty,
      label: row.label,
    });

    if (!row.isTransfer) {
      continue;
    }

    // The statement sees one leg of a transfer. The cash box holds the other:
    // paying cash in is an outflow from the box, drawing cash is an inflow.
    planned.push({
      accountId: cash.id,
      accountName: cash.name,
      accountType: row.isIncome ? AccountType.CHARGES : AccountType.PRODUITS,
      date: row.date,
      amount: row.amount,
      counterparty,
      label: row.label,
    });
  }

  return planned;
}

/**
 * The gap between what the statement adds up to and what the account really
 * holds, booked as a single charge.
 *
 * The LBA export carries no fee rows at all — `FRAIS`, `TAXE`, `COMMISSION` and
 * `INTERET` appear nowhere in it — while the bank debits them all year, so the
 * imported movements alone always land above the real balance. One dated,
 * named entry keeps the account honest and stays splittable later, once the fee
 * advices are at hand.
 *
 * Only ever a charge: a statement that lands *below* the expected balance means
 * movements are missing, which no single entry can legitimately paper over.
 */
function bookMissingCharges(
  drift: number,
  bank: { id: string; name: string },
  date: Date,
  label: string,
): PlannedEntry {
  if (drift <= 0) {
    throw new Error(
      `The statement lands ${Math.abs(drift).toFixed(2)} *below* the expected balance, so movements are missing, not charges. Refusing to invent an entry.`,
    );
  }

  return {
    accountId: bank.id,
    accountName: bank.name,
    accountType: AccountType.CHARGES,
    date,
    amount: drift,
    counterparty: BANK_COUNTERPARTY,
    label,
  };
}

/**
 * Rewrites the *solde à nouveau* entries of the following edition so next year
 * opens on the balances this import just changed. Matches accounts by name, the
 * same way carryOverEdition creates them.
 */
async function refreshCarryOver(
  tx: Prisma.TransactionClient,
  sourceEditionId: string,
  targetEditionName: string,
): Promise<string[]> {
  const target = await tx.edition.findUnique({
    where: { name: targetEditionName },
    include: { moneyAccounts: true },
  });

  if (!target) {
    throw new Error(`Edition '${targetEditionName}' does not exist, so its carry-over cannot be refreshed.`);
  }

  const sourceAccounts = await tx.moneyAccount.findMany({
    where: { editionId: sourceEditionId },
    include: { journalEntries: { select: { accountType: true, amount: true } } },
  });

  const report: string[] = [];

  for (const source of sourceAccounts) {
    const carried = target.moneyAccounts.find((account) => account.name === source.name);
    if (!carried) {
      continue;
    }

    const closing = round2(source.journalEntries.reduce((total, entry) => (
      entry.accountType === AccountType.PRODUITS ? total + Number(entry.amount) : total - Number(entry.amount)
    ), Number(source.openingBalance)));

    const opening = await tx.journalEntry.findFirst({
      where: { editionId: target.id, moneyAccountId: carried.id, isOpeningEntry: true },
    });

    if (!opening) {
      continue;
    }

    await tx.journalEntry.update({
      where: { id: opening.id },
      data: {
        accountType: closing >= 0 ? AccountType.PRODUITS : AccountType.CHARGES,
        amount: Math.abs(closing),
      },
    });

    // `amount` is stored unsigned, the side carries the sign — report the signed
    // figure so an unchanged carry-over does not read as a flip.
    const previous = opening.accountType === AccountType.PRODUITS ? Number(opening.amount) : -Number(opening.amount);
    report.push(`${source.name.padEnd(14)} ${previous.toFixed(2)} → ${closing.toFixed(2)}`);
  }

  return report;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    workbookPath: path.resolve(process.cwd(), "../docs/soa/Extraction transactionnelle.xlsx"),
    editionName: "2025-2026",
    bankAccountName: "CompteCourant",
    cashAccountName: "Coffre",
    openingBalance: 4619.01,
    expectedBalance: 813.47,
    skipFirst: 2,
    chargesLabel: "Frais bancaires BCV (cumul)",
    carryIntoEdition: "2026-2027",
    apply: false,
    allowMismatch: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case "--workbook": options.workbookPath = path.resolve(process.cwd(), value); i += 1; break;
      case "--edition": options.editionName = value; i += 1; break;
      case "--bank-account": options.bankAccountName = value; i += 1; break;
      case "--cash-account": options.cashAccountName = value; i += 1; break;
      case "--opening": options.openingBalance = Number(value); i += 1; break;
      case "--expect": options.expectedBalance = Number(value); i += 1; break;
      case "--skip": options.skipFirst = Number(value); i += 1; break;
      case "--charges-label": options.chargesLabel = value; i += 1; break;
      case "--carry-into": options.carryIntoEdition = value; i += 1; break;
      case "--no-carry-over": options.carryIntoEdition = ""; break;
      case "--apply": options.apply = true; break;
      case "--dry-run": options.apply = false; break;
      case "--allow-mismatch": options.allowMismatch = true; break;
      default: throw new Error(`Unknown argument '${arg}'.`);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const rows = readStatement(options.workbookPath, options.skipFirst);

  if (rows.length === 0) {
    throw new Error("The statement holds no transactions.");
  }

  const edition = await prisma.edition.findUnique({
    where: { name: options.editionName },
    include: { moneyAccounts: true },
  });

  if (!edition) {
    throw new Error(`Edition '${options.editionName}' does not exist.`);
  }

  if (edition.closedAt) {
    throw new Error(`Edition '${options.editionName}' is closed.`);
  }

  const bank = edition.moneyAccounts.find((account) => account.name === options.bankAccountName);
  const cash = edition.moneyAccounts.find((account) => account.name === options.cashAccountName);

  if (!bank || bank.type !== MoneyAccountType.BANK) {
    throw new Error(`No bank account named '${options.bankAccountName}' in edition '${options.editionName}'.`);
  }

  if (!cash || cash.type !== MoneyAccountType.CASH) {
    throw new Error(`No cash account named '${options.cashAccountName}' in edition '${options.editionName}'.`);
  }

  const planned = planEntries(rows, bank, cash);

  const statementTotal = (type: AccountType) => round2(
    planned
      .filter((entry) => entry.accountId === bank.id && entry.accountType === type)
      .reduce((total, entry) => total + entry.amount, 0),
  );

  const income = statementTotal(AccountType.PRODUITS);
  const movements = statementTotal(AccountType.CHARGES);
  const drift = round2(round2(options.openingBalance + income - movements) - options.expectedBalance);

  if (drift !== 0) {
    planned.push(bookMissingCharges(drift, bank, rows[rows.length - 1].date, options.chargesLabel));
  }

  const bankEntries = planned.filter((entry) => entry.accountId === bank.id);
  const cashEntries = planned.filter((entry) => entry.accountId === cash.id);
  // `movements` is read before the charge is planned, so it is the statement's own total.
  const charges = round2(movements + drift);
  const bankBalance = round2(options.openingBalance + income - charges);

  console.log(`Statement      ${options.workbookPath}`);
  console.log(`Edition        ${edition.name}`);
  console.log(`Transactions   ${rows.length} (first ${options.skipFirst} skipped)`);
  console.log(`               ${rows[0].date.toISOString().slice(0, 10)} → ${rows[rows.length - 1].date.toISOString().slice(0, 10)}`);
  console.log(`Entries        ${bankEntries.length} on ${bank.name}, ${cashEntries.length} mirrored on ${cash.name}`);
  console.log("");
  console.log(`${bank.name} opening    ${options.openingBalance.toFixed(2)}`);
  console.log(`${bank.name} income   + ${income.toFixed(2)}`);
  console.log(`${bank.name} payments - ${movements.toFixed(2)}`);
  if (drift !== 0) {
    console.log(`${bank.name} charges  - ${drift.toFixed(2)}   ${options.chargesLabel}, ${rows[rows.length - 1].date.toISOString().slice(0, 10)}`);
  }
  console.log(`${bank.name} balance    ${bankBalance.toFixed(2)}   (expected ${options.expectedBalance.toFixed(2)})`);

  if (bankBalance !== options.expectedBalance && !options.allowMismatch) {
    throw new Error(
      `Control failed: ${bank.name} lands on ${bankBalance.toFixed(2)}, not ${options.expectedBalance.toFixed(2)}. Nothing was written.`,
    );
  }

  if (!options.apply) {
    console.log("\nDry run — nothing written. Pass --apply to import.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // The statement is the whole truth for this account: replace, do not merge.
    // The cash box is not ours to replace, except for the transfer legs a
    // previous run wrote there — without clearing those, re-importing doubles
    // every transfer. They are recognisable because createJournalEntryAction and
    // both update actions all require a department, so an entry with none can
    // only have come from this script.
    const removed = await tx.journalEntry.deleteMany({
      where: {
        editionId: edition.id,
        OR: [
          { moneyAccountId: bank.id },
          {
            moneyAccountId: cash.id,
            departmentId: null,
            costCenterId: null,
            enteredById: null,
          },
        ],
      },
    });

    await tx.moneyAccount.update({
      where: { id: bank.id },
      data: { openingBalance: options.openingBalance },
    });

    const highest = await tx.journalEntry.aggregate({
      where: { editionId: edition.id },
      _max: { sequenceNumber: true },
    });

    let sequenceNumber = (highest._max.sequenceNumber ?? 0) + 1;

    await tx.journalEntry.createMany({
      data: planned.map((entry) => ({
        editionId: edition.id,
        moneyAccountId: entry.accountId,
        sequenceNumber: sequenceNumber++,
        accountType: entry.accountType,
        date: entry.date,
        amount: entry.amount,
        counterparty: entry.counterparty,
        label: entry.label,
        departmentId: null,
        costCenterId: null,
        enteredById: null,
        isOpeningEntry: false,
      })),
    });

    console.log(`\nRemoved ${removed.count} entries from ${bank.name}, wrote ${planned.length}.`);

    if (options.carryIntoEdition) {
      const refreshed = await refreshCarryOver(tx, edition.id, options.carryIntoEdition);
      for (const line of refreshed) {
        console.log(`${options.carryIntoEdition} opening  ${line}`);
      }
    }
  }, { timeout: 120_000 });

  const written = await prisma.journalEntry.findMany({
    where: { editionId: edition.id },
    select: { moneyAccountId: true, accountType: true, amount: true },
  });

  for (const account of [bank, cash]) {
    const opening = account.id === bank.id ? options.openingBalance : Number(account.openingBalance);
    const balance = written
      .filter((entry) => entry.moneyAccountId === account.id)
      .reduce((total, entry) => (
        entry.accountType === AccountType.PRODUITS ? total + Number(entry.amount) : total - Number(entry.amount)
      ), opening);
    console.log(`${account.name.padEnd(14)} ${round2(balance).toFixed(2)}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
