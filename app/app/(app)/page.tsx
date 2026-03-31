import { AccountType, TaskType } from "@prisma/client";
import { TrendingDown, TrendingUp } from "lucide-react";

import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { getPendingTasksForUser } from "@/lib/tasks";
import { decimalToNumber, formatCurrency } from "@/lib/utils";

function sumAmounts<T extends { amount: { toString(): string } }>(items: T[]) {
  return items.reduce((total, item) => total + decimalToNumber(item.amount), 0);
}

export default async function DashboardPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const access = await getCurrentUserAccess();

  const pendingTasks = await getPendingTasksForUser(access);

  const activeEdition = await prisma.edition.findFirst({
    where: { isActive: true },
    include: {
      departments: {
        orderBy: { name: "asc" },
        include: { budgetLines: true },
      },
      moneyAccounts: {
        orderBy: { name: "asc" },
        include: { journalEntries: true },
      },
      journalEntries: true,
    },
  });

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.dashboard.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noActiveEdition}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
          {copy.common.createAndActivateEdition}
        </p>
      </div>
    );
  }

  const departmentRows = activeEdition.departments.map((department) => {
    const budgetCharges = sumAmounts(
      department.budgetLines.filter((line) => line.accountType === AccountType.CHARGES),
    );
    const budgetProduits = sumAmounts(
      department.budgetLines.filter((line) => line.accountType === AccountType.PRODUITS),
    );
    const actualCharges = sumAmounts(
      activeEdition.journalEntries.filter(
        (entry) => entry.departmentId === department.id && entry.accountType === AccountType.CHARGES,
      ),
    );
    const actualProduits = sumAmounts(
      activeEdition.journalEntries.filter(
        (entry) => entry.departmentId === department.id && entry.accountType === AccountType.PRODUITS,
      ),
    );

    return {
      name: department.name,
      budgetCharges,
      budgetProduits,
      budgetResult: budgetProduits - budgetCharges,
      actualCharges,
      actualProduits,
      actualResult: actualProduits - actualCharges,
    };
  });

  const totals = departmentRows.reduce(
    (acc, row) => ({
      budgetCharges: acc.budgetCharges + row.budgetCharges,
      budgetProduits: acc.budgetProduits + row.budgetProduits,
      budgetResult: acc.budgetResult + row.budgetResult,
      actualCharges: acc.actualCharges + row.actualCharges,
      actualProduits: acc.actualProduits + row.actualProduits,
      actualResult: acc.actualResult + row.actualResult,
    }),
    { budgetCharges: 0, budgetProduits: 0, budgetResult: 0, actualCharges: 0, actualProduits: 0, actualResult: 0 },
  );
  const totalDelta = totals.actualResult - totals.budgetResult;

  const moneyAccountCards = activeEdition.moneyAccounts.map((account) => {
    const balance = account.journalEntries.reduce((total, entry) => {
      const amount = decimalToNumber(entry.amount);
      return entry.accountType === AccountType.PRODUITS ? total + amount : total - amount;
    }, decimalToNumber(account.openingBalance));

    return { name: account.name, type: account.type, balance };
  });

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.dashboard.title}</p>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{copy.dashboard.editionPrefix} {activeEdition.name}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--muted)]">
            {copy.dashboard.subtitle}
          </p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {moneyAccountCards.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)] md:col-span-2 xl:col-span-4">
            {copy.dashboard.noMoneyAccounts}
          </div>
        ) : (
          moneyAccountCards.map((account) => (
            <article key={account.name} className="rounded-3xl bg-[var(--panel-strong)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{account.type}</p>
              <h2 className="mt-2 text-lg font-semibold">{account.name}</h2>
              <p className="mt-4 text-2xl font-semibold tracking-tight">{formatCurrency(account.balance)}</p>
            </article>
          ))
        )}
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[var(--line)]">
        <div className="border-b border-[var(--line)] bg-[var(--panel-strong)] px-5 py-4">
          <h2 className="text-lg font-semibold">{copy.dashboard.budgetVsActuals}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--panel-strong)] text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">{copy.dashboard.department}</th>
                <th className="px-5 py-3 font-medium">{copy.dashboard.budgetCharges}</th>
                <th className="px-5 py-3 font-medium">{copy.dashboard.budgetProduits}</th>
                <th className="px-5 py-3 font-medium">{copy.dashboard.budgetResult}</th>
                <th className="border-l border-[var(--line)] px-5 py-3 font-medium">{copy.dashboard.actualCharges}</th>
                <th className="px-5 py-3 font-medium">{copy.dashboard.actualProduits}</th>
                <th className="px-5 py-3 font-medium">{copy.dashboard.actualResult}</th>
                <th className="border-l border-[var(--line)] px-5 py-3 font-medium">{copy.common.delta}</th>
              </tr>
            </thead>
            <tbody>
              {departmentRows.map((row) => {
                const delta = row.actualResult - row.budgetResult;
                return (
                  <tr key={row.name} className="border-t border-[var(--line)]">
                    <td className="px-5 py-4 font-medium">{row.name}</td>
                    <td className="px-5 py-4">{formatCurrency(row.budgetCharges)}</td>
                    <td className="px-5 py-4">{formatCurrency(row.budgetProduits)}</td>
                    <td className="px-5 py-4">{formatCurrency(row.budgetResult)}</td>
                    <td className="border-l border-[var(--line)] px-5 py-4">{formatCurrency(row.actualCharges)}</td>
                    <td className="px-5 py-4">{formatCurrency(row.actualProduits)}</td>
                    <td className="px-5 py-4">{formatCurrency(row.actualResult)}</td>
                    <td className="border-l border-[var(--line)] px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatCurrency(delta)}</span>
                        {delta >= 0
                          ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                          : <TrendingDown className="h-4 w-4 text-rose-400" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--line)] bg-[var(--panel-strong)] font-semibold">
                <td className="px-5 py-4">{copy.common.total}</td>
                <td className="px-5 py-4">{formatCurrency(totals.budgetCharges)}</td>
                <td className="px-5 py-4">{formatCurrency(totals.budgetProduits)}</td>
                <td className="px-5 py-4">{formatCurrency(totals.budgetResult)}</td>
                <td className="border-l border-[var(--line)] px-5 py-4">{formatCurrency(totals.actualCharges)}</td>
                <td className="px-5 py-4">{formatCurrency(totals.actualProduits)}</td>
                <td className="px-5 py-4">{formatCurrency(totals.actualResult)}</td>
                <td className="border-l border-[var(--line)] px-5 py-4">
                  <div className="flex items-center gap-1.5">
                    <span className={totalDelta >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatCurrency(totalDelta)}</span>
                    {totalDelta >= 0
                      ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                      : <TrendingDown className="h-4 w-4 text-rose-400" />}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {pendingTasks.length > 0 ? (
        <section className="overflow-hidden rounded-[28px] border border-[var(--line)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel-strong)] px-5 py-4">
            <h2 className="text-lg font-semibold">{copy.tasks.title}</h2>
            <a href="/tasks" className="text-xs font-semibold text-[var(--accent)] hover:underline">{copy.tasks.allTasks} →</a>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {pendingTasks.slice(0, 5).map((task) => {
              const expenseReport = task.expenseReport;
              const shift = task.staffAssignment?.shift;
              const eventDay = shift?.eventDay;
              const event = eventDay?.event;
              return (
                <li key={task.id} className="flex items-center justify-between gap-4 bg-[var(--panel-strong)] px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {task.type === TaskType.REVIEW_EXPENSE_REPORT
                        ? copy.tasks.reviewExpenseReport
                        : task.type === TaskType.RECORD_JOURNAL
                          ? copy.tasks.recordJournal
                          : task.type === TaskType.STAFF_SHIFT
                            ? copy.tasks.staffShift
                            : copy.tasks.generalTask}
                    </p>
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    {event && eventDay ? (
                      <p className="text-xs text-[var(--muted)]">{event.name} — {new Date(eventDay.date).toLocaleDateString()}</p>
                    ) : null}
                  </div>
                  {task.type === TaskType.RECORD_JOURNAL && expenseReport ? (
                    <a
                      href={`/journal?fromExpenseReport=${expenseReport.id}`}
                      className="shrink-0 rounded-full border border-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10"
                    >
                      {copy.tasks.recordJournal}
                    </a>
                  ) : task.type === TaskType.REVIEW_EXPENSE_REPORT ? (
                    <a
                      href="/expense-reports"
                      className="shrink-0 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--panel)]"
                    >
                      {copy.tasks.reviewExpenseReport} →
                    </a>
                  ) : (
                    <a
                      href="/tasks"
                      className="shrink-0 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--panel)]"
                    >
                      {copy.tasks.allTasks} →
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}