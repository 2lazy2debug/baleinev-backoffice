import path from "node:path";

import { AccountType, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

type BudgetLineInput = {
  departmentName: string;
  accountType: AccountType;
  billingMonth: string | null;
  label: string;
  amount: number;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseAmount(value: unknown): number {
  const asText = normalizeText(value).replace("'", "").replace(",", ".");
  const parsed = Number(asText);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isStopMarker(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.startsWith("total") || normalized === "comptabilite" || normalized === "charges" || normalized === "produits";
}

function parseSectionRows(
  rows: (string | number | Date | null)[][],
  departmentName: string,
  sectionTitle: "Charges" | "Produits",
  accountType: AccountType,
): BudgetLineInput[] {
  const sectionIndex = rows.findIndex((row) => normalizeText(row[0]).toLowerCase() === sectionTitle.toLowerCase());
  if (sectionIndex === -1) {
    return [];
  }

  // Expected template: section title row, then header row, then data rows.
  const start = sectionIndex + 2;
  const parsed: BudgetLineInput[] = [];

  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const marker = normalizeText(row[0]);

    if (marker && isStopMarker(marker)) {
      break;
    }

    const label = normalizeText(row[1]); // column B
    const amount = parseAmount(row[4]); // column E

    if (!label || amount <= 0) {
      continue;
    }

    const billingMonth = normalizeText(row[0]) || null; // column A

    parsed.push({
      departmentName,
      accountType,
      billingMonth,
      label,
      amount,
    });
  }

  return parsed;
}

function extractBudgetLines(workbookPath: string): BudgetLineInput[] {
  const workbook = XLSX.readFile(workbookPath, { cellDates: true });

  const excludedSheets = new Set(["JOURNAL", "RESULTATS", "DATA", "A Propos", "Tabelle1", "Vide", "Vide_2"]);

  const parsedLines: BudgetLineInput[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (excludedSheets.has(sheetName)) {
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
      raw: true,
    });

    const title = normalizeText(rows[0]?.[0]) || sheetName;
    const hasBudgetMarker = rows.slice(0, 20).some((row) => normalizeText(row[0]).toUpperCase() === "BUDGET");

    if (!title || !hasBudgetMarker) {
      continue;
    }

    const departmentName = title;

    parsedLines.push(
      ...parseSectionRows(rows, departmentName, "Charges", AccountType.CHARGES),
      ...parseSectionRows(rows, departmentName, "Produits", AccountType.PRODUITS),
    );
  }

  return parsedLines;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options: {
    workbookPath: string;
    editionName: string;
    replaceExisting: boolean;
  } = {
    workbookPath: path.resolve(process.cwd(), "../soa/compta_2025-2026.xlsx"),
    editionName: "2025-2026",
    replaceExisting: true,
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

    if (arg === "--append") {
      options.replaceExisting = false;
    }
  }

  return options;
}

async function main() {
  const { workbookPath, editionName, replaceExisting } = parseArgs();

  const parsedLines = extractBudgetLines(workbookPath);
  if (parsedLines.length === 0) {
    throw new Error("No budget lines were parsed from workbook department sheets.");
  }

  const uniqueDepartments = [...new Set(parsedLines.map((line) => line.departmentName))].sort();

  const importedCount = await prisma.$transaction(async (tx) => {
    let edition = await tx.edition.findUnique({ where: { name: editionName } });

    if (!edition) {
      await tx.edition.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      edition = await tx.edition.create({ data: { name: editionName, isDefault: true } });
    }

    for (const departmentName of uniqueDepartments) {
      // The department itself is global and outlives the workbook; only its
      // budget for this edition is (re)built here.
      const department = await tx.department.upsert({
        where: { name: departmentName },
        update: { hasBudget: true },
        create: { name: departmentName, hasBudget: true },
      });

      // The workbook names one budget per department; it is upserted by
      // (editionId, name) and attached to that department.
      const budget = await tx.budget.upsert({
        where: { editionId_name: { editionId: edition.id, name: departmentName } },
        update: {},
        create: { editionId: edition.id, name: departmentName },
      });

      await tx.budgetDepartment.upsert({
        where: { budgetId_departmentId: { budgetId: budget.id, departmentId: department.id } },
        update: {},
        create: { budgetId: budget.id, departmentId: department.id },
      });
    }

    if (replaceExisting) {
      await tx.budgetLine.deleteMany({ where: { budget: { editionId: edition.id } } });
    }

    const budgets = await tx.budget.findMany({
      where: { editionId: edition.id },
      select: { id: true, name: true },
    });
    const budgetByDepartmentName = new Map(budgets.map((budget) => [budget.name, budget.id]));

    let inserted = 0;

    for (const line of parsedLines) {
      const budgetId = budgetByDepartmentName.get(line.departmentName);
      if (!budgetId) {
        continue;
      }

      await tx.budgetLine.create({
        data: {
          budgetId,
          accountType: line.accountType,
          billingMonth: line.billingMonth,
          label: line.label,
          amount: line.amount,
        },
      });

      inserted += 1;
    }

    return inserted;
  });

  console.log(`Imported ${importedCount} budget lines into edition '${editionName}'.`);
  console.log(`Source workbook: ${workbookPath}`);
  console.log(`Mode: ${replaceExisting ? "replace existing budget lines" : "append"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
