"use client";

import { useActionState } from "react";
import { ExpenseReportStatus } from "@prisma/client";

import { FormError } from "@/components/form-error";
import { initialActionState } from "@/lib/server-action-helpers";
import { decimalToNumber, formatCurrency } from "@/lib/utils";

import { approveExpenseReportAction, rejectExpenseReportAction } from "./actions";

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

interface SubmittedBySummary {
  name: string;
  refundFirstName: string | null;
  refundLastName: string | null;
  refundIban: string | null;
  refundZip: string | null;
  refundCity: string | null;
}

type DecimalLike = { toString(): string };

interface ExpenseReportRow {
  id: string;
  date: Date;
  reportType: string;
  description: string;
  departure: string | null;
  arrival: string | null;
  kilometers: DecimalLike | null;
  ratePerKm: DecimalLike | null;
  amount: DecimalLike | number;
  paymentMethod: string;
  status: ExpenseReportStatus;
  rejectionReason: string | null;
  proofFilename: string | null;
  department: { name: string };
  submittedBy: SubmittedBySummary;
  reviewedBy: { name: string } | null;
}

interface UserAccess {
  role: "ADMIN" | "DEPARTMENT";
}

interface ExpenseReportsCopy {
  history: string;
  noHistory: string;
  date: string;
  reportType: string;
  description: string;
  department: string;
  amount: string;
  paymentMethod: string;
  status: string;
  proof: string;
  pending: string;
  approved: string;
  rejected: string;
  bankFirstName: string;
  bankLastName: string;
  bankIban: string;
  bankZip: string;
  bankCity: string;
  missingBankInfo: string;
  drivingExpense: string;
  standardExpense: string;
  submittedBy: string;
  userBankInfo: string;
  myMoney: string;
  festivalAccount: string;
  reviewedBy: string;
  openProof: string;
  approve: string;
  rejectionReasonOptional: string;
  reject: string;
  recordInJournal: string;
}

interface PageCopy {
  expenseReports: ExpenseReportsCopy;
  journal: { actions: string };
}

export function ExpenseReportsPageClient({
  expenseReports,
  access,
  copy,
}: {
  expenseReports: ExpenseReportRow[];
  access: UserAccess;
  copy: PageCopy;
}) {
  const [approveState, approveFormAction, isApproving] = useActionState(
    approveExpenseReportAction,
    initialActionState
  );
  const [rejectState, rejectFormAction, isRejecting] = useActionState(rejectExpenseReportAction, initialActionState);

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6">
      <h2 className="text-xl font-semibold">{copy.expenseReports.history}</h2>

      {access.role === "ADMIN" ? (
        <div className="mt-4 space-y-2">
          <FormError message={approveState.error} />
          <FormError message={rejectState.error} />
        </div>
      ) : null}

      {expenseReports.length === 0 ? (
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
              {expenseReports.map((report) => {
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
                            <form action={approveFormAction}>
                              <input type="hidden" name="expenseReportId" value={report.id} />
                              <button
                                disabled={isApproving}
                                className="w-full rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
                              >
                                {copy.expenseReports.approve}
                              </button>
                            </form>
                            <form action={rejectFormAction} className="space-y-2">
                              <input type="hidden" name="expenseReportId" value={report.id} />
                              <input
                                type="text"
                                name="rejectionReason"
                                placeholder={copy.expenseReports.rejectionReasonOptional}
                                className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs outline-none"
                              />
                              <button
                                disabled={isRejecting}
                                className="w-full rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-950/40 disabled:opacity-60"
                              >
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
  );
}
