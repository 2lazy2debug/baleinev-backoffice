import ExcelJS from "exceljs";

import type { EditionSummary, Split } from "@/lib/edition-summary";
import type { Locale, dictionaries } from "@/lib/i18n-dictionaries";

/**
 * The controlling export: one workbook per edition, a summary sheet with the
 * dashboard's accounting figures and a sheet with every journal entry. Values
 * only — no formulas, no validation lists — so the file reads the same in any
 * spreadsheet and after any copy-paste.
 *
 * A spreadsheet cannot read CSS variables, so the light theme's tokens
 * (`:root[data-theme="light"]` in app/globals.css) are repeated here as ARGB.
 * Keep the two in step.
 */
const PALETTE = {
  page: "FFEFE6D8",
  panel: "FFF8F2E6",
  panelStrong: "FFFFFBF3",
  line: "FFC9B393",
  ink: "FF3A2C1E",
  muted: "FF6E5A40",
  accent: "FF00A68C",
  good: "FF065F46",
  bad: "FFBE123C",
  white: "FFFFFFFF",
} as const;

const FONT = "Arial";
const MONEY = "#,##0.00;-#,##0.00";
const PERCENT = "0.0%";
const DATE = "dd.mm.yyyy";

type Copy = (typeof dictionaries)[Locale];

export type ControllingJournalEntry = {
  sequenceNumber: number;
  date: Date;
  budget: string | null;
  accountType: "CHARGES" | "PRODUITS";
  amount: number;
  label: string;
  referenceNumber: string | null;
  counterparty: string | null;
  moneyAccount: string;
  costCenter: string | null;
  /** The account's balance once this entry is booked. */
  balance: number;
};

export type ControllingWorkbookInput = {
  editionName: string;
  exportedAt: string;
  summary: EditionSummary;
  journal: ControllingJournalEntry[];
  copy: Copy;
  /** The dark mark, as PNG; left out when the asset cannot be read. */
  logo?: Buffer;
};

const thin = (argb: string): Partial<ExcelJS.Border> => ({ style: "thin", color: { argb } });
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const font = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 10, color: { argb: PALETTE.ink }, ...extra });

type Column = { header: string; kind: "text" | "money" | "percent" | "date" | "integer" | "signed" };

/** Text reads from the left, figures from the right; one indent keeps neighbours from touching. */
const align = (column: Column): Partial<ExcelJS.Alignment> => ({
  vertical: "middle",
  horizontal: column.kind === "text" ? "left" : column.kind === "date" || column.kind === "integer" ? "center" : "right",
  indent: column.kind === "date" || column.kind === "integer" ? 0 : 1,
});

function styleHeader(row: ExcelJS.Row, columns: Column[]) {
  row.height = 20;
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    cell.value = column.header;
    cell.font = font({ bold: true, color: { argb: PALETTE.white } });
    cell.fill = fill(PALETTE.accent);
    cell.alignment = align(column);
    cell.border = { bottom: thin(PALETTE.accent) };
  });
}

function styleBody(row: ExcelJS.Row, columns: Column[], striped: boolean, total = false) {
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    const value = typeof cell.value === "number" ? cell.value : null;
    const signedColour =
      column.kind === "signed" && value !== null && value !== 0 ? (value > 0 ? PALETTE.good : PALETTE.bad) : PALETTE.ink;
    cell.font = font({ bold: total, color: { argb: signedColour } });
    cell.fill = fill(total ? PALETTE.page : striped ? PALETTE.panel : PALETTE.panelStrong);
    cell.border = total
      ? { top: { style: "medium", color: { argb: PALETTE.ink } }, bottom: thin(PALETTE.line) }
      : { bottom: thin(PALETTE.line) };
    cell.alignment = align(column);
    if (column.kind === "money" || column.kind === "signed") cell.numFmt = MONEY;
    if (column.kind === "percent") cell.numFmt = PERCENT;
    if (column.kind === "date") cell.numFmt = DATE;
    if (column.kind === "integer") cell.numFmt = "0";
  });
}

/** Writes a titled table from `startRow` and returns the first free row after it, one blank row included. */
function writeTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  columns: Column[],
  rows: (string | number | null)[][],
  totalRow?: (string | number | null)[],
): number {
  const titleCell = sheet.getCell(startRow, 1);
  titleCell.value = title;
  titleCell.font = font({ bold: true, size: 12 });
  titleCell.alignment = { vertical: "bottom", indent: 0 };
  sheet.getRow(startRow).height = 22;

  styleHeader(sheet.getRow(startRow + 1), columns);
  rows.forEach((values, index) => {
    const row = sheet.getRow(startRow + 2 + index);
    row.values = values;
    styleBody(row, columns, index % 2 === 1);
  });
  let next = startRow + 2 + rows.length;
  if (totalRow) {
    const row = sheet.getRow(next);
    row.values = totalRow;
    styleBody(row, columns, false, true);
    next += 1;
  }
  return next + 1;
}

function splitTable(split: Split, nameHeader: string, copy: Copy) {
  const rows = split.rows.map((row) => ({ name: row.name, produits: row.produits, charges: row.charges }));
  if (split.unassigned.produits > 0 || split.unassigned.charges > 0) {
    rows.push({ name: copy.dashboard.unassigned, ...split.unassigned });
  }
  const produits = rows.reduce((total, row) => total + row.produits, 0);
  const charges = rows.reduce((total, row) => total + row.charges, 0);
  const share = (value: number, of: number) => (of === 0 ? 0 : value / of);

  const columns: Column[] = [
    { header: nameHeader, kind: "text" },
    { header: copy.common.produits, kind: "money" },
    { header: copy.controlling.share, kind: "percent" },
    { header: copy.common.charges, kind: "money" },
    { header: copy.controlling.share, kind: "percent" },
  ];
  return {
    columns,
    rows: rows.map((row) => [row.name, row.produits, share(row.produits, produits), row.charges, share(row.charges, charges)]),
    total: [copy.common.total, produits, produits === 0 ? 0 : 1, charges, charges === 0 ? 0 : 1],
  };
}

function writeSummary(workbook: ExcelJS.Workbook, input: ControllingWorkbookInput) {
  const { copy, summary } = input;
  const sheet = workbook.addWorksheet(copy.controlling.summarySheet, {
    properties: { tabColor: { argb: PALETTE.accent } },
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [{ width: 34 }, ...Array.from({ length: 7 }, () => ({ width: 17 }))];
  sheet.headerFooter.oddFooter = `&L&8${copy.controlling.title} · ${input.editionName}&R&8&P / &N`;

  // Letterhead: the mark on the left, what this file is on the right, closed by an accent rule.
  if (input.logo) {
    const image = workbook.addImage({ buffer: input.logo as unknown as ExcelJS.Buffer, extension: "png" });
    sheet.addImage(image, { tl: { col: 0.1, row: 0.25 }, ext: { width: 164, height: 48 } });
  }
  const meta: [string, Partial<ExcelJS.Font>][] = [
    [copy.controlling.title, font({ bold: true, size: 18 })],
    [`${copy.dashboard.editionPrefix} ${input.editionName}`, font({ bold: true, size: 11 })],
    [`${copy.controlling.exportedAt} ${input.exportedAt}`, font({ size: 9, color: { argb: PALETTE.muted } })],
  ];
  meta.forEach(([text, style], index) => {
    const rowNumber = index + 1;
    sheet.mergeCells(rowNumber, 2, rowNumber, 8);
    const cell = sheet.getCell(rowNumber, 2);
    cell.value = text;
    cell.font = style;
    cell.alignment = { horizontal: "right", vertical: "middle" };
  });
  sheet.getRow(1).height = 26;
  sheet.getRow(2).height = 18;
  sheet.getRow(3).height = 16;
  for (let column = 1; column <= 8; column += 1) {
    sheet.getCell(4, column).border = { bottom: { style: "medium", color: { argb: PALETTE.accent } } };
  }
  sheet.getRow(4).height = 6;

  let row = 6;

  const accountTypeLabel = { BANK: copy.moneyAccounts.bank, CASH: copy.moneyAccounts.cash, OTHER: copy.moneyAccounts.other };
  row = writeTable(
    sheet,
    row,
    copy.moneyAccounts.title,
    [
      { header: copy.journal.account, kind: "text" },
      { header: copy.journal.type, kind: "text" },
      { header: copy.journal.balance, kind: "money" },
    ],
    summary.moneyAccounts.map((account) => [account.name, accountTypeLabel[account.type], account.balance]),
    [copy.common.total, null, summary.moneyAccounts.reduce((total, account) => total + account.balance, 0)],
  );

  const budgetColumns: Column[] = [
    { header: copy.dashboard.budget, kind: "text" },
    { header: copy.dashboard.budgetCharges, kind: "money" },
    { header: copy.dashboard.budgetProduits, kind: "money" },
    { header: copy.dashboard.budgetResult, kind: "money" },
    { header: copy.dashboard.actualCharges, kind: "money" },
    { header: copy.dashboard.actualProduits, kind: "money" },
    { header: copy.dashboard.actualResult, kind: "money" },
    { header: copy.common.delta, kind: "signed" },
  ];
  const budgetLine = (name: string, figures: EditionSummary["totals"]) => [
    name,
    figures.budgetCharges,
    figures.budgetProduits,
    figures.budgetResult,
    figures.actualCharges,
    figures.actualProduits,
    figures.actualResult,
    figures.actualResult - figures.budgetResult,
  ];
  row = writeTable(
    sheet,
    row,
    copy.dashboard.budgetVsActuals,
    budgetColumns,
    summary.budgetRows.map((budget) => budgetLine(budget.name, budget)),
    budgetLine(copy.common.total, summary.totals),
  );

  // The splits start a printed page of their own rather than leaving a title orphaned under budget vs actuals.
  sheet.getRow(row - 1).addPageBreak();
  const byBudget = splitTable(summary.byBudget, copy.dashboard.budget, copy);
  row = writeTable(sheet, row, copy.controlling.byBudget, byBudget.columns, byBudget.rows, byBudget.total);

  const byCostCenter = splitTable(summary.byCostCenter, copy.journal.costCenter, copy);
  writeTable(sheet, row, copy.controlling.byCostCenter, byCostCenter.columns, byCostCenter.rows, byCostCenter.total);
}

function writeJournal(workbook: ExcelJS.Workbook, input: ControllingWorkbookInput) {
  const { copy } = input;
  const sheet = workbook.addWorksheet(copy.controlling.journalSheet, {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:1" },
  });
  sheet.headerFooter.oddFooter = `&L&8${copy.controlling.journalSheet} · ${input.editionName}&R&8&P / &N`;

  const columns: (Column & { width: number })[] = [
    { header: copy.journal.recordNumber, kind: "integer", width: 10 },
    { header: copy.journal.date, kind: "date", width: 12 },
    { header: copy.journal.budget, kind: "text", width: 22 },
    { header: copy.journal.type, kind: "text", width: 11 },
    { header: copy.journal.amount, kind: "money", width: 14 },
    { header: copy.journal.label, kind: "text", width: 44 },
    { header: copy.journal.reference, kind: "text", width: 16 },
    { header: copy.journal.counterpart, kind: "text", width: 26 },
    { header: copy.journal.account, kind: "text", width: 18 },
    { header: copy.journal.costCenter, kind: "text", width: 14 },
    { header: copy.journal.balance, kind: "money", width: 15 },
  ];
  sheet.columns = columns.map((column) => ({ width: column.width }));
  styleHeader(sheet.getRow(1), columns);

  const typeLabel = { CHARGES: copy.common.charges, PRODUITS: copy.common.produits };
  input.journal.forEach((entry, index) => {
    const row = sheet.getRow(index + 2);
    row.values = [
      entry.sequenceNumber,
      entry.date,
      entry.budget,
      typeLabel[entry.accountType],
      entry.amount,
      entry.label,
      entry.referenceNumber,
      entry.counterparty,
      entry.moneyAccount,
      entry.costCenter,
      entry.balance,
    ];
    styleBody(row, columns, index % 2 === 1);
  });
}

export function buildControllingWorkbook(input: ControllingWorkbookInput): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Baleinev";
  workbook.title = `${input.copy.controlling.title} ${input.editionName}`;
  writeSummary(workbook, input);
  writeJournal(workbook, input);
  return workbook;
}
