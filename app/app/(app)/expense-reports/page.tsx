import { ExpenseReportStatus } from "@prisma/client";

import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber, formatCurrency } from "@/lib/utils";

import { approveExpenseReportAction, rejectExpenseReportAction } from "./actions";
import CreateExpenseReportForm from "./create-expense-report-form";

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default async function ExpenseReportsPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const activeEdition = await prisma.edition.findFirst({
    where: { isActive: true },
    include: {
      departments: { orderBy: { name: "asc" } },
      expenseReports: {
        where: access.role === "ADMIN" ? undefined : { submittedById: access.id },
        include: {
          department: { select: { name: true } },
          submittedBy: {
            select: {
              name: true,
              refundFirstName: true,
              refundLastName: true,
              refundIban: true,
              refundZip: true,
              refundCity: true,
            },
          },
          reviewedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.expenseReports.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noActiveEdition}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">{copy.common.createAndActivateEdition}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.expenseReports.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.expenseReports.title} {activeEdition.name}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">{copy.expenseReports.subtitle}</p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <CreateExpenseReportForm
          departments={activeEdition.departments
            .filter((department) => access.role === "ADMIN" || access.departmentRoleNames.includes(department.name))
            .map((department) => ({ id: department.id, name: department.name }))}
          drivingRatePerKm={decimalToNumber(activeEdition.drivingRatePerKm)}
          copy={{
            create: copy.expenseReports.create,
            submit: copy.expenseReports.submit,
            reportType: copy.expenseReports.reportType,
            standardExpense: copy.expenseReports.standardExpense,
            drivingExpense: copy.expenseReports.drivingExpense,
            description: copy.expenseReports.description,
            drivingReason: copy.expenseReports.drivingReason,
            departure: copy.expenseReports.departure,
            arrival: copy.expenseReports.arrival,
            kilometers: copy.expenseReports.kilometers,
            amount: copy.expenseReports.amount,
            calculatedAmount: copy.expenseReports.calculatedAmount,
            ratePerKm: copy.expenseReports.ratePerKm,
            paymentMethod: copy.expenseReports.paymentMethod,
            myMoney: copy.expenseReports.myMoney,
            festivalAccount: copy.expenseReports.festivalAccount,
            drivingRefundFixed: copy.expenseReports.drivingRefundFixed,
            date: copy.expenseReports.date,
            uploadProof: copy.expenseReports.uploadProof,
            noProofRequired: copy.expenseReports.noProofRequired,
            department: copy.expenseReports.department,
            selectDepartment: copy.journal.selectDepartment,
          }}
        />

        <section className="rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-6">
          <h2 className="text-xl font-semibold">{copy.expenseReports.history}</h2>

          {activeEdition.expenseReports.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">{copy.expenseReports.noHistory}</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--panel)] text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">{copy.expenseReports.date}</th>
                    <th className="px-3 py-2 font-medium">{copy.expenseReports.reportType}</th>
                    <th className="px-3 py-2 font-medium">{copy.expenseReports.description}</th>
                    <th className="px-3 py-2 font-medium">{copy.expenseReports.department}</th>
                    <th className="px-3 py-2 font-medium">{copy.expenseReports.amount}</th>
                    <th className="px-3 py-2 font-medium">{copy.expenseReports.paymentMethod}</th>
                    <th className="px-3 py-2 font-medium">{copy.expenseReports.status}</th>
                    <th className="px-3 py-2 font-medium">{copy.expenseReports.proof}</th>
                    {access.role === "ADMIN" ? <th className="px-3 py-2 font-medium">{copy.journal.actions}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {activeEdition.expenseReports.map((report) => {
                    const statusLabel =
                      report.status === ExpenseReportStatus.PENDING
                        ? copy.expenseReports.pending
                        : report.status === ExpenseReportStatus.APPROVED
                          ? copy.expenseReports.approved
                          : copy.expenseReports.rejected;

                    const bankInfoLines = [
                      `${copy.expenseReports.bankFirstName}: ${report.submittedBy.refundFirstName || copy.expenseReports.missingBankInfo}`,
                      `${copy.expenseReports.bankLastName}: ${report.submittedBy.refundLastName || copy.expenseReports.missingBankInfo}`,
                      `${copy.expenseReports.bankIban}: ${report.submittedBy.refundIban || copy.expenseReports.missingBankInfo}`,
                      `${copy.expenseReports.bankZip}: ${report.submittedBy.refundZip || copy.expenseReports.missingBankInfo}`,
                      `${copy.expenseReports.bankCity}: ${report.submittedBy.refundCity || copy.expenseReports.missingBankInfo}`,
                    ].join("\n");

                    return (
                      <tr key={report.id} className="border-t border-[var(--line)] align-top">
                        <td className="px-3 py-2 text-xs">{formatDate(report.date)}</td>
                        <td className="px-3 py-2 text-xs">
                          {report.reportType === "DRIVING" ? copy.expenseReports.drivingExpense : copy.expenseReports.standardExpense}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{report.description}</p>
                          {report.reportType === "DRIVING" ? (
                            <p className="text-xs text-[var(--muted)]">
                              {`${report.departure} -> ${report.arrival} | ${decimalToNumber(report.kilometers ?? 0)} km @ CHF ${decimalToNumber(report.ratePerKm ?? 0).toFixed(2)}`}
                            </p>
                          ) : null}
                          <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
                            <span>{copy.expenseReports.submittedBy}: {report.submittedBy.name}</span>
                            {access.role === "ADMIN" ? (
                              <span
                                title={`${copy.expenseReports.userBankInfo}\n${bankInfoLines}`}
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--line)] text-[10px] font-semibold text-[var(--muted)]"
                              >
                                i
                              </span>
                            ) : null}
                          </p>
                        </td>
                        <td className="px-3 py-2">{report.department.name}</td>
                        <td className="px-3 py-2">{formatCurrency(decimalToNumber(report.amount))}</td>
                        <td className="px-3 py-2 text-xs">
                          {report.paymentMethod === "MY_MONEY" ? copy.expenseReports.myMoney : copy.expenseReports.festivalAccount}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <p>{statusLabel}</p>
                          {report.status !== ExpenseReportStatus.PENDING && report.reviewedBy ? (
                            <p className="text-[var(--muted)]">{copy.expenseReports.reviewedBy}: {report.reviewedBy.name}</p>
                          ) : null}
                          {report.rejectionReason ? (
                            <p className="mt-1 text-rose-300">{report.rejectionReason}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {report.proofFilename ? (
                            <a
                              href={`/api/expense-reports/${report.id}/proof`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-[var(--accent)] hover:underline"
                            >
                              {copy.expenseReports.openProof}
                            </a>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">-</span>
                          )}
                        </td>
                        {access.role === "ADMIN" ? (
                          <td className="px-3 py-2">
                            {report.status === ExpenseReportStatus.PENDING ? (
                              <div className="space-y-2">
                                <form action={approveExpenseReportAction}>
                                  <input type="hidden" name="expenseReportId" value={report.id} />
                                  <button className="w-full rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-strong)]">
                                    {copy.expenseReports.approve}
                                  </button>
                                </form>
                                <form action={rejectExpenseReportAction} className="space-y-2">
                                  <input type="hidden" name="expenseReportId" value={report.id} />
                                  <input
                                    type="text"
                                    name="rejectionReason"
                                    placeholder={copy.expenseReports.rejectionReasonOptional}
                                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs outline-none"
                                  />
                                  <button className="w-full rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-950/40">
                                    {copy.expenseReports.reject}
                                  </button>
                                </form>
                              </div>
                            ) : report.status === ExpenseReportStatus.APPROVED ? (
                              <a
                                href={`/journal?fromExpenseReport=${report.id}`}
                                className="block w-full rounded-lg border border-[var(--accent)] px-3 py-1.5 text-center text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10"
                              >
                                {copy.expenseReports.recordInJournal}
                              </a>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
