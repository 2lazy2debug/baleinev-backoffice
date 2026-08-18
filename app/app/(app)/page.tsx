import { AccountType, TaskType } from "@prisma/client";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardGrid, THead, TFoot, TR, TH, TD } from "@/components/ui";
import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
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

  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
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
  }) : null;

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.dashboard.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noEditionSelected}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
          {copy.common.pickEditionHint}
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

      <CardGrid>
        {moneyAccountCards.length === 0 ? (
          <Card span="full" dashed>{copy.dashboard.noMoneyAccounts}</Card>
        ) : (
          moneyAccountCards.map((account) => (
            <Card key={account.name} span="1/4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{account.type}</p>
              <h2 className="mt-2 text-lg font-semibold">{account.name}</h2>
              <p className="mt-4 text-2xl font-semibold tracking-tight">{formatCurrency(account.balance)}</p>
            </Card>
          ))
        )}
      </CardGrid>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)]">
        <div className="border-b border-[var(--line)] bg-[var(--panel-strong)] px-5 py-4">
          <h2 className="text-lg font-semibold">{copy.dashboard.budgetVsActuals}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-full text-left text-sm">
            <THead>
              <TR>
                <TH className="px-5 py-3">{copy.dashboard.department}</TH>
                <TH className="px-5 py-3">{copy.dashboard.budgetCharges}</TH>
                <TH className="px-5 py-3">{copy.dashboard.budgetProduits}</TH>
                <TH className="px-5 py-3">{copy.dashboard.budgetResult}</TH>
                <TH className="border-l border-[var(--line)] px-5 py-3">{copy.dashboard.actualCharges}</TH>
                <TH className="px-5 py-3">{copy.dashboard.actualProduits}</TH>
                <TH className="px-5 py-3">{copy.dashboard.actualResult}</TH>
                <TH className="border-l border-[var(--line)] px-5 py-3">{copy.common.delta}</TH>
              </TR>
            </THead>
            <tbody>
              {departmentRows.map((row) => {
                const delta = row.actualResult - row.budgetResult;
                return (
                  <TR key={row.name}>
                    <TD className="px-5 py-4 font-medium">{row.name}</TD>
                    <TD className="px-5 py-4">{formatCurrency(row.budgetCharges)}</TD>
                    <TD className="px-5 py-4">{formatCurrency(row.budgetProduits)}</TD>
                    <TD className="px-5 py-4">{formatCurrency(row.budgetResult)}</TD>
                    <TD className="border-l border-[var(--line)] px-5 py-4">{formatCurrency(row.actualCharges)}</TD>
                    <TD className="px-5 py-4">{formatCurrency(row.actualProduits)}</TD>
                    <TD className="px-5 py-4">{formatCurrency(row.actualResult)}</TD>
                    <TD className="border-l border-[var(--line)] px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatCurrency(delta)}</span>
                        {delta >= 0
                          ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                          : <TrendingDown className="h-4 w-4 text-rose-400" />}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
            <TFoot>
              <TR>
                <TD className="px-5 py-4">{copy.common.total}</TD>
                <TD className="px-5 py-4">{formatCurrency(totals.budgetCharges)}</TD>
                <TD className="px-5 py-4">{formatCurrency(totals.budgetProduits)}</TD>
                <TD className="px-5 py-4">{formatCurrency(totals.budgetResult)}</TD>
                <TD className="border-l border-[var(--line)] px-5 py-4">{formatCurrency(totals.actualCharges)}</TD>
                <TD className="px-5 py-4">{formatCurrency(totals.actualProduits)}</TD>
                <TD className="px-5 py-4">{formatCurrency(totals.actualResult)}</TD>
                <TD className="border-l border-[var(--line)] px-5 py-4">
                  <div className="flex items-center gap-1.5">
                    <span className={totalDelta >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatCurrency(totalDelta)}</span>
                    {totalDelta >= 0
                      ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                      : <TrendingDown className="h-4 w-4 text-rose-400" />}
                  </div>
                </TD>
              </TR>
            </TFoot>
          </table>
        </div>
      </section>

      {pendingTasks.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-[var(--line)]">
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
                      className="shrink-0 rounded-md border border-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10"
                    >
                      {copy.tasks.recordJournal}
                    </a>
                  ) : task.type === TaskType.REVIEW_EXPENSE_REPORT ? (
                    <a
                      href="/expense-reports"
                      className="shrink-0 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--panel)]"
                    >
                      {copy.tasks.reviewExpenseReport} →
                    </a>
                  ) : (
                    <a
                      href="/tasks"
                      className="shrink-0 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--panel)]"
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