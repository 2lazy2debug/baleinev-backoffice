import { TaskType } from "@prisma/client";

import { Card, CardGrid, Cardlet, CardletField, CardletFields, CardletHeader, CardletList, DonutChart, EmptyPage, PageHeader, Panel, PanelHeader, SectionTitle, SignedAmount, TD, TFoot, TH, THead, TR, Table, buttonClasses, colourOrder, microLabelClasses } from "@/components/ui";
import type { DonutSlice } from "@/components/ui";
import { getCurrentUserAccess } from "@/lib/access";
import { loadEditionSummary, type Split } from "@/lib/edition-summary";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { getPendingTasksForUser } from "@/lib/tasks";
import { formatCurrency } from "@/lib/utils";

/**
 * One side of a split, for a donut. Entries with no bucket get their own slice
 * rather than being dropped: a chart that says "earnings by budget" while
 * silently leaving out everything unbudgeted shows a total that matches nothing.
 */
function slicesBy(split: Split, side: "produits" | "charges", unassignedLabel: string): DonutSlice[] {
  const slices = split.rows.map((row) => ({ label: row.name, value: row[side] }));
  const loose = split.unassigned[side];
  return loose > 0 ? [...slices, { label: unassignedLabel, value: loose }] : slices;
}

export default async function DashboardPage() {
  const locale = await getLocale();
  const copy = getDictionary(locale);
  const access = await getCurrentUserAccess();

  const pendingTasks = await getPendingTasksForUser(access);

  const editionId = await resolveEditionIdOrNull();
  const loaded = editionId ? await loadEditionSummary(editionId) : null;

  if (!loaded) {
    return (
      <EmptyPage eyebrow={copy.dashboard.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  const { edition: activeEdition, summary } = loaded;
  const { budgetRows: departmentRows, totals, moneyAccounts: moneyAccountCards } = summary;
  const totalDelta = totals.actualResult - totals.budgetResult;

  // One colour order per dimension, shared by that dimension's two donuts, so a
  // budget keeps its colour between "earnings" and "spendings" instead of being
  // repainted by how it happens to rank on each side.
  const donutPair = (split: Split, earningsTitle: string, expensesTitle: string) => {
    const earnings = slicesBy(split, "produits", copy.dashboard.unassigned);
    const expenses = slicesBy(split, "charges", copy.dashboard.unassigned);
    const order = colourOrder([...earnings, ...expenses]);
    return [
      { title: earningsTitle, slices: earnings, order },
      { title: expensesTitle, slices: expenses, order },
    ];
  };

  const donuts = [
    ...donutPair(summary.byBudget, copy.dashboard.earningsByBudget, copy.dashboard.expensesByBudget),
    ...donutPair(summary.byCostCenter, copy.dashboard.earningsByCostCenter, copy.dashboard.expensesByCostCenter),
  ];

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.dashboard.title}
        title={<>{copy.dashboard.editionPrefix} {activeEdition.name}</>}
        description={copy.dashboard.subtitle}
      />

      <CardGrid>
        {moneyAccountCards.length === 0 ? (
          <Card span="full" dashed>{copy.dashboard.noMoneyAccounts}</Card>
        ) : (
          moneyAccountCards.map((account) => (
            <Card key={account.name} span="1/4">
              <p className={microLabelClasses}>{account.type}</p>
              <SectionTitle className="mt-2">{account.name}</SectionTitle>
              <p className="mt-4 text-2xl font-semibold tracking-tight">{formatCurrency(account.balance)}</p>
            </Card>
          ))
        )}
      </CardGrid>

      <CardGrid>
        {donuts.map((donut) => (
          <Card key={donut.title} span="1/2">
            <SectionTitle>{donut.title}</SectionTitle>
            <DonutChart
              className="mt-4"
              data={donut.slices}
              order={donut.order}
              format={formatCurrency}
              otherLabel={copy.dashboard.otherSlice}
              emptyLabel={copy.dashboard.nothingBooked}
            />
          </Card>
        ))}
      </CardGrid>

      <Panel flushOnMobile>
        <PanelHeader flushOnMobile>
          <SectionTitle>{copy.dashboard.budgetVsActuals}</SectionTitle>
        </PanelHeader>
        <CardletList>
          {departmentRows.map((row) => {
            const delta = row.actualResult - row.budgetResult;
            return (
              <Cardlet key={row.name}>
                <CardletHeader title={row.name} action={<SignedAmount value={delta} label={formatCurrency(delta)} trend className="text-sm font-semibold" />} />
                <CardletFields>
                  <CardletField label={copy.dashboard.budgetCharges}>{formatCurrency(row.budgetCharges)}</CardletField>
                  <CardletField label={copy.dashboard.actualCharges}>{formatCurrency(row.actualCharges)}</CardletField>
                  <CardletField label={copy.dashboard.budgetProduits}>{formatCurrency(row.budgetProduits)}</CardletField>
                  <CardletField label={copy.dashboard.actualProduits}>{formatCurrency(row.actualProduits)}</CardletField>
                  <CardletField label={copy.dashboard.budgetResult}>{formatCurrency(row.budgetResult)}</CardletField>
                  <CardletField label={copy.dashboard.actualResult}>{formatCurrency(row.actualResult)}</CardletField>
                </CardletFields>
              </Cardlet>
            );
          })}
          <Cardlet>
            <CardletHeader title={copy.common.total} action={<SignedAmount value={totalDelta} label={formatCurrency(totalDelta)} trend className="text-sm font-semibold" />} />
            <CardletFields>
              <CardletField label={copy.dashboard.budgetCharges}>{formatCurrency(totals.budgetCharges)}</CardletField>
              <CardletField label={copy.dashboard.actualCharges}>{formatCurrency(totals.actualCharges)}</CardletField>
              <CardletField label={copy.dashboard.budgetProduits}>{formatCurrency(totals.budgetProduits)}</CardletField>
              <CardletField label={copy.dashboard.actualProduits}>{formatCurrency(totals.actualProduits)}</CardletField>
              <CardletField label={copy.dashboard.budgetResult}>{formatCurrency(totals.budgetResult)}</CardletField>
              <CardletField label={copy.dashboard.actualResult}>{formatCurrency(totals.actualResult)}</CardletField>
            </CardletFields>
          </Cardlet>
        </CardletList>
        <Table frame={false} desktopOnly className="min-w-full">
            <THead>
              <TR>
                <TH>{copy.dashboard.budget}</TH>
                <TH>{copy.dashboard.budgetCharges}</TH>
                <TH>{copy.dashboard.budgetProduits}</TH>
                <TH>{copy.dashboard.budgetResult}</TH>
                <TH className="border-l border-[var(--line)]">{copy.dashboard.actualCharges}</TH>
                <TH>{copy.dashboard.actualProduits}</TH>
                <TH>{copy.dashboard.actualResult}</TH>
                <TH className="border-l border-[var(--line)]">{copy.common.delta}</TH>
              </TR>
            </THead>
            <tbody>
              {departmentRows.map((row) => {
                const delta = row.actualResult - row.budgetResult;
                return (
                  <TR key={row.name}>
                    <TD className="font-medium">{row.name}</TD>
                    <TD>{formatCurrency(row.budgetCharges)}</TD>
                    <TD>{formatCurrency(row.budgetProduits)}</TD>
                    <TD>{formatCurrency(row.budgetResult)}</TD>
                    <TD className="border-l border-[var(--line)]">{formatCurrency(row.actualCharges)}</TD>
                    <TD>{formatCurrency(row.actualProduits)}</TD>
                    <TD>{formatCurrency(row.actualResult)}</TD>
                    <TD className="border-l border-[var(--line)]">
                      <SignedAmount value={delta} label={formatCurrency(delta)} trend className="font-semibold" />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
            <TFoot>
              <TR>
                <TD>{copy.common.total}</TD>
                <TD>{formatCurrency(totals.budgetCharges)}</TD>
                <TD>{formatCurrency(totals.budgetProduits)}</TD>
                <TD>{formatCurrency(totals.budgetResult)}</TD>
                <TD className="border-l border-[var(--line)]">{formatCurrency(totals.actualCharges)}</TD>
                <TD>{formatCurrency(totals.actualProduits)}</TD>
                <TD>{formatCurrency(totals.actualResult)}</TD>
                <TD className="border-l border-[var(--line)]">
                  <SignedAmount value={totalDelta} label={formatCurrency(totalDelta)} trend />
                </TD>
              </TR>
            </TFoot>
        </Table>
      </Panel>

      {pendingTasks.length > 0 ? (
        <Panel>
          <PanelHeader>
            <SectionTitle>{copy.tasks.title}</SectionTitle>
            <a href="/tasks" className="text-xs font-semibold text-[var(--accent)] hover:underline">{copy.tasks.allTasks} →</a>
          </PanelHeader>
          <ul className="divide-y divide-[var(--line)]">
            {pendingTasks.slice(0, 5).map((task) => {
              const expenseReport = task.expenseReport;
              const shift = task.staffAssignment?.shift;
              const eventDay = shift?.eventDay;
              const event = eventDay?.event;
              return (
                <li key={task.id} className="flex items-center justify-between gap-4 bg-[var(--panel-strong)] px-5 py-3">
                  <div className="min-w-0">
                    <p className={microLabelClasses}>
                      {task.type === TaskType.REVIEW_EXPENSE_REPORT
                        ? copy.tasks.reviewExpenseReport
                        : task.type === TaskType.RECORD_JOURNAL
                          ? copy.tasks.recordJournal
                          : task.type === TaskType.STAFF_SHIFT
                            ? copy.tasks.staffShift
                            : task.type === TaskType.DEPARTMENT_ACCESS_REQUEST
                              ? copy.tasks.departmentAccessRequest
                              : copy.tasks.generalTask}
                    </p>
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    {event && eventDay ? (
                      <p className="text-xs text-[var(--muted)]">{event.name} — {new Date(eventDay.date).toLocaleDateString(locale)}</p>
                    ) : null}
                  </div>
                  {task.type === TaskType.RECORD_JOURNAL && expenseReport ? (
                    <a href={`/journal?fromExpenseReport=${expenseReport.id}`} className={buttonClasses("primary", "sm")}>
                      {copy.tasks.recordJournal}
                    </a>
                  ) : task.type === TaskType.REVIEW_EXPENSE_REPORT ? (
                    <a href="/expense-reports" className={buttonClasses("secondary", "sm")}>
                      {copy.tasks.reviewExpenseReport} →
                    </a>
                  ) : task.type === TaskType.DEPARTMENT_ACCESS_REQUEST ? (
                    <a href="/users" className={buttonClasses("secondary", "sm")}>
                      {copy.tasks.reviewDepartments} →
                    </a>
                  ) : (
                    <a href="/tasks" className={buttonClasses("secondary", "sm")}>
                      {copy.tasks.allTasks} →
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}