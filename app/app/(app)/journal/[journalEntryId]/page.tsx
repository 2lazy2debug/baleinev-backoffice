import Link from "next/link";
import { AccountType } from "@prisma/client";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import { updateJournalEntryAction } from "../actions";

type JournalEntryEditPageProps = {
  params: Promise<{ journalEntryId: string }>;
};

export default async function JournalEntryEditPage({ params }: JournalEntryEditPageProps) {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const { journalEntryId } = await params;

  const activeEdition = await prisma.edition.findFirst({
    where: { isActive: true },
    include: {
      departments: { orderBy: { name: "asc" } },
      moneyAccounts: { orderBy: { name: "asc" } },
      costCenters: { orderBy: { code: "asc" } },
    },
  });

  if (!activeEdition) {
    notFound();
  }

  const entry = await prisma.journalEntry.findFirst({
    where: {
      id: journalEntryId,
      editionId: activeEdition.id,
    },
  });

  if (!entry || entry.isOpeningEntry) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.journal.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.journal.edit} #{entry.sequenceNumber}</h1>
        <p className="text-sm text-[var(--muted)]">{copy.journal.subtitle}</p>
      </header>

      <section className="rounded-[28px] border border-[var(--line)] bg-[var(--panel)] p-6">
        <form action={updateJournalEntryAction} className="space-y-4">
          <input type="hidden" name="journalEntryId" value={entry.id} />

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted)]">{copy.journal.department}</span>
            <select
              name="departmentId"
              required
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
              defaultValue={entry.departmentId ?? ""}
            >
              <option value="" disabled>
                {copy.journal.selectDepartment}
              </option>
              {activeEdition.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.journal.type}</span>
              <select
                name="accountType"
                required
                defaultValue={entry.accountType}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
              >
                <option value={AccountType.CHARGES}>{copy.common.charges}</option>
                <option value={AccountType.PRODUITS}>{copy.common.produits}</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.journal.date}</span>
              <input
                type="date"
                name="date"
                required
                defaultValue={entry.date.toISOString().slice(0, 10)}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted)]">{copy.journal.amount}</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              name="amount"
              required
              defaultValue={decimalToNumber(entry.amount).toFixed(2)}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted)]">{copy.journal.moneyAccount}</span>
            <select
              name="moneyAccountId"
              required
              defaultValue={entry.moneyAccountId}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
            >
              {activeEdition.moneyAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted)]">{copy.journal.label}</span>
            <input
              type="text"
              name="label"
              required
              defaultValue={entry.label}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.journal.counterparty}</span>
              <input
                type="text"
                name="counterparty"
                defaultValue={entry.counterparty ?? ""}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.journal.reference}</span>
              <input
                type="text"
                name="referenceNumber"
                defaultValue={entry.referenceNumber ?? ""}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted)]">{copy.journal.costCenter}</span>
            <select
              name="costCenterId"
              defaultValue={entry.costCenterId ?? ""}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
            >
              <option value="">{copy.journal.none}</option>
              {activeEdition.costCenters.map((costCenter) => (
                <option key={costCenter.id} value={costCenter.id}>
                  {costCenter.code}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-3">
            <button className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
              {copy.shell.save}
            </button>
            <Link href="/journal" className="rounded-full border border-[var(--line)] px-5 py-2 text-sm font-semibold hover:bg-[var(--panel-strong)]">
              {copy.shell.cancel}
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
