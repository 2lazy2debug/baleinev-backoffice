import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/access";
import { buildControllingWorkbook } from "@/lib/controlling-workbook";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { loadEditionSummary } from "@/lib/edition-summary";
import { getDictionary, getLocale } from "@/lib/i18n";
import { buildRunningBalances } from "@/lib/journal-grid";
import { decimalToNumber } from "@/lib/utils";

/** `07.10.2026 13:45`, in the festival's time zone whatever the server's. */
function formatExportedAt(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zurich",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    label: `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`,
    stamp: `${parts.year}${parts.month}${parts.day}`,
  };
}

async function readLogo() {
  try {
    return await readFile(path.resolve(process.cwd(), "public", "logo_blv_dark.png"));
  } catch {
    return undefined;
  }
}

/** The active edition's controlling workbook — the journal and the dashboard's figures are admin-only, so is this. */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const editionId = await resolveEditionIdOrNull();
  const loaded = editionId ? await loadEditionSummary(editionId) : null;
  if (!editionId || !loaded) {
    return NextResponse.json({ error: "Pick an edition first." }, { status: 404 });
  }

  const [entries, moneyAccounts, logo] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { editionId },
      orderBy: [{ sequenceNumber: "asc" }],
      include: {
        budget: { select: { name: true } },
        moneyAccount: { select: { name: true } },
        costCenter: { select: { code: true } },
      },
    }),
    prisma.moneyAccount.findMany({ where: { editionId }, select: { id: true, openingBalance: true } }),
    readLogo(),
  ]);

  const balances = buildRunningBalances(
    entries.map((entry) => ({ ...entry, amount: entry.amount.toString() })),
    Object.fromEntries(moneyAccounts.map((account) => [account.id, decimalToNumber(account.openingBalance)])),
  );

  const copy = getDictionary(await getLocale());
  const exportedAt = formatExportedAt(new Date());
  const workbook = buildControllingWorkbook({
    editionName: loaded.edition.name,
    exportedAt: exportedAt.label,
    summary: loaded.summary,
    copy,
    logo,
    journal: entries.map((entry) => ({
      sequenceNumber: entry.sequenceNumber,
      date: entry.date,
      budget: entry.budget?.name ?? null,
      accountType: entry.accountType,
      amount: decimalToNumber(entry.amount),
      label: entry.label,
      referenceNumber: entry.referenceNumber,
      counterparty: entry.counterparty,
      moneyAccount: entry.moneyAccount.name,
      costCenter: entry.costCenter?.code ?? null,
      balance: balances[entry.id] ?? 0,
    })),
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `controlling-${loaded.edition.name.replace(/[^\w.-]+/g, "_")}-${exportedAt.stamp}.xlsx`;

  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
