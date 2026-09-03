import path from "node:path";

import { AccountType, MoneyAccountType, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

type JournalRow = {
  sequenceNumber: number;
  date: Date;
  amount: number;
  counterparty: string | null;
  label: string;
  referenceNumber: string | null;
  enteredBy: string | null;
  departmentName: string;
  accountType: AccountType;
  moneyAccountName: string;
  moneyAccountType: MoneyAccountType;
  costCenterCode: string | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseAmount(value: unknown): number {
  const asText = normalizeText(value).replace("'", "").replace(",", ".");
  const parsed = Number(asText);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSequence(value: unknown, fallback: number): number {
  const parsed = Number(normalizeText(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const asText = normalizeText(value);
  if (!asText) {
    return null;
  }

  const parsed = new Date(asText);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toAccountType(raw: string): AccountType | null {
  const normalized = raw.toLowerCase();

  if (normalized.includes("produit")) {
    return AccountType.PRODUITS;
  }

  if (normalized.includes("charge")) {
    return AccountType.CHARGES;
  }

  return null;
}

function toMoneyAccountType(raw: string): MoneyAccountType {
  const normalized = raw.toLowerCase();

  if (normalized.includes("coffre") || normalized.includes("cash")) {
    return MoneyAccountType.CASH;
  }

  return MoneyAccountType.BANK;
}

function parseDepartmentFromCompte(compte: string): string | null {
  const separatorIndex = compte.indexOf("/");
  if (separatorIndex === -1) {
    return null;
  }

  return compte.slice(0, separatorIndex).trim() || null;
}

function extractJournalRows(workbookPath: string): JournalRow[] {
  const workbook = XLSX.readFile(workbookPath, { cellDates: true });
  const sheet = workbook.Sheets["JOURNAL"];

  if (!sheet) {
    throw new Error("Sheet 'JOURNAL' not found in workbook.");
  }

  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: true,
  });

  const parsedRows: JournalRow[] = [];
  let fallbackSequence = 1;

  for (let i = 4; i < rows.length; i += 1) {
    const row = rows[i] ?? [];

    const compteRaw = normalizeText(row[1]); // B
    const accountType = toAccountType(compteRaw);
    const departmentName = parseDepartmentFromCompte(compteRaw);

    if (!compteRaw || !accountType || !departmentName) {
      continue;
    }

    const date = parseDate(row[3]); // D
    if (!date) {
      continue;
    }

    const amount = parseAmount(row[4]); // E
    if (amount <= 0) {
      continue;
    }

    const moneyAccountName = normalizeText(row[8]); // I
    if (!moneyAccountName) {
      continue;
    }

    const sequenceNumber = parseSequence(row[2], fallbackSequence); // C
    fallbackSequence = Math.max(fallbackSequence + 1, sequenceNumber + 1);

    parsedRows.push({
      sequenceNumber,
      date,
      amount,
      counterparty: normalizeText(row[5]) || null, // F
      label: normalizeText(row[6]) || "Imported journal entry", // G
      enteredBy: normalizeText(row[7]) || null, // H
      referenceNumber: normalizeText(row[10]) || null, // K
      departmentName,
      accountType,
      moneyAccountName,
      moneyAccountType: toMoneyAccountType(moneyAccountName),
      costCenterCode: normalizeText(row[9]) || null, // J
    });
  }

  return parsedRows;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options: {
    workbookPath: string;
    editionName: string;
    force: boolean;
  } = {
    workbookPath: path.resolve(process.cwd(), "../soa/compta_2025-2026.xlsx"),
    editionName: "2025-2026",
    force: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--workbook" && args[i + 1]) {
      options.workbookPath = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
      continue;
    }

    if (arg === "--edition" && args[i + 1]) {
      options.editionName = args[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
    }
  }

  return options;
}

async function main() {
  const { workbookPath, editionName, force } = parseArgs();

  const journalRows = extractJournalRows(workbookPath);
  if (journalRows.length === 0) {
    throw new Error("No journal rows were parsed from the workbook.");
  }

  const uniqueDepartmentNames = [...new Set(journalRows.map((row) => row.departmentName))].sort();
  const uniqueMoneyAccounts = [...new Map(
    journalRows.map((row) => [row.moneyAccountName, row.moneyAccountType]),
  ).entries()];
  const uniqueCostCenters = [...new Set(journalRows.map((row) => row.costCenterCode).filter(Boolean) as string[])].sort();

  const adminUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  await prisma.$transaction(async (tx) => {
    let edition = await tx.edition.findUnique({ where: { name: editionName } });

    if (!edition) {
      await tx.edition.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      edition = await tx.edition.create({ data: { name: editionName, isDefault: true } });
    }

    const existingEntries = await tx.journalEntry.count({ where: { editionId: edition.id } });
    if (existingEntries > 0 && !force) {
      throw new Error(
        `Edition '${editionName}' already has journal entries. Run with --force to replace imported data.`,
      );
    }

    if (force) {
      await tx.journalEntry.deleteMany({ where: { editionId: edition.id } });
      await tx.budgetLine.deleteMany({ where: { departmentBudget: { editionId: edition.id } } });
      // The departments themselves are global and survive a re-import; only
      // their budget for this edition is thrown away with the entries.
      await tx.departmentBudget.deleteMany({ where: { editionId: edition.id } });
      await tx.costCenter.deleteMany({ where: { editionId: edition.id } });
      await tx.moneyAccount.deleteMany({ where: { editionId: edition.id } });
    }

    await tx.edition.updateMany({ where: { isDefault: true, id: { not: edition.id } }, data: { isDefault: false } });
    await tx.edition.update({ where: { id: edition.id }, data: { isDefault: true } });

    for (const departmentName of uniqueDepartmentNames) {
      await tx.department.upsert({
        where: { name: departmentName },
        update: { hasBudget: true },
        create: { name: departmentName, hasBudget: true },
      });
    }

    for (const [moneyAccountName, moneyAccountType] of uniqueMoneyAccounts) {
      await tx.moneyAccount.upsert({
        where: { editionId_name: { editionId: edition.id, name: moneyAccountName } },
        update: { type: moneyAccountType },
        create: { editionId: edition.id, name: moneyAccountName, type: moneyAccountType },
      });
    }

    for (const code of uniqueCostCenters) {
      await tx.costCenter.upsert({
        where: { editionId_code: { editionId: edition.id, code } },
        update: {},
        create: { editionId: edition.id, code, name: code },
      });
    }

    const departments = await tx.department.findMany({ where: { name: { in: uniqueDepartmentNames } } });
    const moneyAccounts = await tx.moneyAccount.findMany({ where: { editionId: edition.id } });
    const costCenters = await tx.costCenter.findMany({ where: { editionId: edition.id } });

    const departmentByName = new Map(departments.map((department) => [department.name, department.id]));
    const moneyAccountByName = new Map(moneyAccounts.map((account) => [account.name, account.id]));
    const costCenterByCode = new Map(costCenters.map((center) => [center.code, center.id]));

    for (const row of journalRows) {
      const departmentId = departmentByName.get(row.departmentName);
      const moneyAccountId = moneyAccountByName.get(row.moneyAccountName);

      if (!departmentId || !moneyAccountId) {
        continue;
      }

      await tx.journalEntry.upsert({
        where: {
          editionId_sequenceNumber: {
            editionId: edition.id,
            sequenceNumber: row.sequenceNumber,
          },
        },
        update: {
          departmentId,
          moneyAccountId,
          enteredById: adminUser?.id ?? null,
          costCenterId: row.costCenterCode ? costCenterByCode.get(row.costCenterCode) ?? null : null,
          accountType: row.accountType,
          date: row.date,
          amount: row.amount,
          counterparty: row.counterparty,
          label: row.label,
          referenceNumber: row.referenceNumber,
          isOpeningEntry: false,
        },
        create: {
          editionId: edition.id,
          departmentId,
          moneyAccountId,
          enteredById: adminUser?.id ?? null,
          costCenterId: row.costCenterCode ? costCenterByCode.get(row.costCenterCode) ?? null : null,
          accountType: row.accountType,
          sequenceNumber: row.sequenceNumber,
          date: row.date,
          amount: row.amount,
          counterparty: row.counterparty,
          label: row.label,
          referenceNumber: row.referenceNumber,
          isOpeningEntry: false,
        },
      });
    }
  });

  console.log(`Imported ${journalRows.length} journal rows into edition '${editionName}'.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
