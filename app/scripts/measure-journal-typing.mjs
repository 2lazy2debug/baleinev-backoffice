#!/usr/bin/env node
// Measures how expensive a keystroke is in the journal bulk-edit grid, against
// a production build with a large fixture edition. Run from app/:
//   node scripts/measure-journal-typing.mjs <label>
// See docs/plans/114-journal-analysis-results.md (step 1) for the full spec.
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { PrismaClient, AccountType, MoneyAccountType } from "@prisma/client";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const label = process.argv[2];
if (!label) {
  console.error("Usage: node scripts/measure-journal-typing.mjs <label>");
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run against NODE_ENV=production.");
  process.exit(1);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const LOAD_ENTRIES = Number(process.env.LOAD_ENTRIES ?? "700");

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set (see app/.env).");
  process.exit(1);
}

const EDITION_NAME = "DEV — Journal load";
const prisma = new PrismaClient();

async function ensureFixture() {
  const edition = await prisma.edition.upsert({
    where: { name: EDITION_NAME },
    update: {},
    create: {
      name: EDITION_NAME,
      isDefault: false,
      closedAt: null,
      startDate: new Date("2030-01-01"),
      endDate: new Date("2030-12-31"),
    },
  });

  const accountNames = ["Load bank", "Load cash"];
  const accounts = [];
  for (const [i, name] of accountNames.entries()) {
    accounts.push(
      await prisma.moneyAccount.upsert({
        where: { editionId_name: { editionId: edition.id, name } },
        update: {},
        create: {
          editionId: edition.id,
          name,
          type: i === 0 ? MoneyAccountType.BANK : MoneyAccountType.CASH,
          openingBalance: 0,
        },
      }),
    );
  }

  const budgets = [];
  for (let i = 1; i <= 20; i++) {
    const name = `Load budget ${String(i).padStart(2, "0")}`;
    budgets.push(
      await prisma.budget.upsert({
        where: { editionId_name: { editionId: edition.id, name } },
        update: {},
        create: { editionId: edition.id, name },
      }),
    );
  }

  const costCenters = [];
  for (let i = 1; i <= 30; i++) {
    const code = `L${String(i).padStart(2, "0")}`;
    costCenters.push(
      await prisma.costCenter.upsert({
        where: { editionId_code: { editionId: edition.id, code } },
        update: {},
        create: { editionId: edition.id, code, name: code },
      }),
    );
  }

  const existingCount = await prisma.journalEntry.count({ where: { editionId: edition.id } });
  if (existingCount !== LOAD_ENTRIES) {
    await prisma.journalEntry.deleteMany({ where: { editionId: edition.id } });
    const entries = [];
    for (let i = 1; i <= LOAD_ENTRIES; i++) {
      const dayOfYear = ((i - 1) % 365) + 1;
      entries.push({
        editionId: edition.id,
        budgetId: budgets[i % budgets.length].id,
        moneyAccountId: accounts[i % accounts.length].id,
        costCenterId: costCenters[i % costCenters.length].id,
        accountType: i % 2 === 0 ? AccountType.CHARGES : AccountType.PRODUITS,
        sequenceNumber: i,
        date: new Date(Date.UTC(2030, 0, 1) + (dayOfYear - 1) * 86400000),
        amount: (i % 500) + 0.5,
        counterparty: `Supplier ${i % 40}`,
        label: `Load entry ${i}`,
        isOpeningEntry: false,
      });
    }
    await prisma.journalEntry.createMany({ data: entries });
  }

  return edition;
}

async function withAdminOnEdition(editionId, fn) {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  const originalEditionId = admin.selectedEditionId;
  await prisma.user.update({ where: { id: admin.id }, data: { selectedEditionId: editionId } });
  try {
    return await fn();
  } finally {
    await prisma.user.update({ where: { id: admin.id }, data: { selectedEditionId: originalEditionId } });
  }
}

async function recordTrace(tracePath) {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 960 });

    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle0" });
    await page.type('input[name="email"]', ADMIN_EMAIL);
    await page.type('input[name="password"]', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click('button[type="submit"]'),
    ]);

    if (await page.$('input[name="totp"]')) {
      console.error("admin has 2FA enabled locally — disable it or use an account without it");
      process.exit(1);
    }

    await page.goto(`${BASE_URL}/journal`, { waitUntil: "networkidle0" });
    await page.waitForSelector("table tbody tr");

    const bulkEditButton = await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll("button")].find(
          (b) => b.textContent?.trim() === "Bulk edit" || b.textContent?.trim() === "Édition groupée",
        );
        return button ?? null;
      },
      { polling: "raf" },
    );
    await bulkEditButton.asElement().click();

    const firstAmountInput = await page.waitForSelector(
      "table tbody tr:first-child td:nth-child(5) input",
    );
    await firstAmountInput.click();
    await page.keyboard.press("End");

    await page.tracing.start({ path: tracePath });
    await page.keyboard.type("abcdefghijklmnopqrst", { delay: 80 });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.tracing.stop();
  } finally {
    await browser.close();
  }
}

const edition = await ensureFixture();

const tracesDir = path.join(repoRoot, "docs/soa/traces");
mkdirSync(tracesDir, { recursive: true });
const tracePath = path.join(tracesDir, `${label}.json`);

await withAdminOnEdition(edition.id, () => recordTrace(tracePath));
await prisma.$disconnect();

const output = execFileSync(
  "python3",
  [path.join(repoRoot, "docs/soa/analyze-trace.py"), tracePath],
  { encoding: "utf8" },
);
console.log(output);
