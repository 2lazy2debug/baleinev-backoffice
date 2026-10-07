import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { summarizeEdition } = await import("./edition-summary");
const { buildControllingWorkbook } = await import("./controlling-workbook");
const { dictionaries } = await import("./i18n-dictionaries");

const entry = (accountType: "CHARGES" | "PRODUITS", amount: number) => ({ accountType, amount: amount.toFixed(2) });

const summary = summarizeEdition({
  budgets: [
    { name: "Bar", budgetLines: [entry("PRODUITS", 1000), entry("CHARGES", 400)], journalEntries: [entry("PRODUITS", 900), entry("CHARGES", 500)] },
    { name: "Stage", budgetLines: [entry("CHARGES", 300)], journalEntries: [entry("CHARGES", 100)] },
  ],
  costCenters: [{ code: "CC1", journalEntries: [entry("CHARGES", 600)] }],
  moneyAccounts: [
    { name: "Coffre", type: "CASH", openingBalance: "50.00", journalEntries: [entry("PRODUITS", 900), entry("CHARGES", 600)] },
  ],
  looseBudget: { produits: 0, charges: 0 },
  looseCostCenter: { produits: 900, charges: 0 },
});

describe("summarizeEdition", () => {
  it("adds up budget lines and journal entries per budget", () => {
    expect(summary.budgetRows[0]).toEqual({
      name: "Bar",
      budgetCharges: 400,
      budgetProduits: 1000,
      budgetResult: 600,
      actualCharges: 500,
      actualProduits: 900,
      actualResult: 400,
    });
    expect(summary.totals.budgetResult).toBe(300);
    expect(summary.totals.actualResult).toBe(300);
  });

  it("starts an account's balance from its opening balance", () => {
    expect(summary.moneyAccounts).toEqual([{ name: "Coffre", type: "CASH", balance: 350 }]);
  });

  it("splits by cost center and carries what is unattributed", () => {
    expect(summary.byCostCenter).toEqual({
      rows: [{ name: "CC1", produits: 0, charges: 600 }],
      unassigned: { produits: 900, charges: 0 },
    });
  });
});

describe("buildControllingWorkbook", () => {
  async function roundTrip() {
    const workbook = buildControllingWorkbook({
      editionName: "2025-2026",
      exportedAt: "07.10.2026 13:45",
      summary,
      copy: dictionaries.en,
      journal: [
        {
          sequenceNumber: 1,
          date: new Date("2025-09-01T00:00:00.000Z"),
          budget: "Bar",
          accountType: "PRODUITS",
          amount: 900,
          label: "Bar sales",
          referenceNumber: "R-1",
          counterparty: null,
          moneyAccount: "Coffre",
          costCenter: null,
          balance: 950,
        },
      ],
    });
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(await workbook.xlsx.writeBuffer());
    return read;
  }

  it("writes a summary sheet then a journal sheet", async () => {
    const workbook = await roundTrip();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Summary", "Journal"]);
  });

  it("names the edition on the summary", async () => {
    const sheet = (await roundTrip()).getWorksheet("Summary")!;
    expect(sheet.getCell("B2").value).toBe("Edition 2025-2026");
  });

  it("reports values, not formulas", async () => {
    const sheet = (await roundTrip()).getWorksheet("Summary")!;
    const values: unknown[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => values.push(cell.value)));
    expect(values.some((value) => typeof value === "object" && value !== null && "formula" in value)).toBe(false);
    expect(values).toContain("Unassigned");
    expect(values).toContain(350);
  });

  it("writes one journal row per entry with real dates and numbers", async () => {
    const sheet = (await roundTrip()).getWorksheet("Journal")!;
    expect(sheet.rowCount).toBe(2);
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe(1);
    expect(row.getCell(2).value).toEqual(new Date("2025-09-01T00:00:00.000Z"));
    expect(row.getCell(4).value).toBe("Earnings");
    expect(row.getCell(5).value).toBe(900);
    expect(row.getCell(11).value).toBe(950);
  });
});
