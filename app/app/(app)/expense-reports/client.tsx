"use client";

import { useActionState } from "react";
import { ExpenseReportStatus } from "@prisma/client";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import { Badge, Button, Card, Input, Table, TD, TH, THead, TR, buttonClasses } from "@/components/ui";
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
  const isReadOnly = useEditionReadOnly();

  return (
    <div>
      <Card as="section">
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
          <Table frameClassName="mt-4">
              <THead>
                <TR>
                  <TH className="px-3 py-2">{copy.expenseReports.date}</TH>
                  <TH className="px-3 py-2">{copy.expenseReports.reportType}</TH>
                  <TH className="px-3 py-2">{copy.expenseReports.description}</TH>
                  <TH className="px-3 py-2">{copy.expenseReports.department}</TH>
                  <TH className="px-3 py-2">{copy.expenseReports.amount}</TH>
                  <TH className="px-3 py-2">{copy.expenseReports.paymentMethod}</TH>
                  <TH className="px-3 py-2">{copy.expenseReports.status}</TH>
                  <TH className="px-3 py-2">{copy.expenseReports.proof}</TH>
                  {access.role === "ADMIN" ? <TH className="px-3 py-2">{copy.journal.actions}</TH> : null}
                </TR>
              </THead>
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
                    <TR key={report.id} className="align-top">
                      <TD className="px-3 py-2 text-xs">{formatDate(report.date)}</TD>
                      <TD className="px-3 py-2 text-xs">
                        {report.reportType === "DRIVING" ? copy.expenseReports.drivingExpense : copy.expenseReports.standardExpense}
                      </TD>
                      <TD className="px-3 py-2">
                        <p className="font-medium">{report.description}</p>
                        {report.reportType === "DRIVING" ? (
                          <p className="text-xs text-[var(--muted)]">
                            {`${report.departure} -> ${report.arrival} | ${decimalToNumber(report.kilometers ?? 0)} km @ CHF ${decimalToNumber(report.ratePerKm ?? 0).toFixed(2)}`}
                          </p>
                        ) : null}
                        <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
                          <span>{copy.expenseReports.submittedBy}: {report.submittedBy.name}</span>
                          {access.role === "ADMIN" ? (
                            <Badge tone="neutral" title={`${copy.expenseReports.userBankInfo}\n${bankInfoLines}`}>
                              i
                            </Badge>
                          ) : null}
                        </p>
                      </TD>
                      <TD className="px-3 py-2">{report.department.name}</TD>
                      <TD className="px-3 py-2">{formatCurrency(decimalToNumber(report.amount))}</TD>
                      <TD className="px-3 py-2 text-xs">
                        {report.paymentMethod === "MY_MONEY" ? copy.expenseReports.myMoney : copy.expenseReports.festivalAccount}
                      </TD>
                      <TD className="px-3 py-2 text-xs">
                        <p>{statusLabel}</p>
                        {report.status !== ExpenseReportStatus.PENDING && report.reviewedBy ? (
                          <p className="text-[var(--muted)]">{copy.expenseReports.reviewedBy}: {report.reviewedBy.name}</p>
                        ) : null}
                        {report.rejectionReason ? (
                          <p className="mt-1 text-rose-300">{report.rejectionReason}</p>
                        ) : null}
                      </TD>
                      <TD className="px-3 py-2">
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
                      </TD>
                      {access.role === "ADMIN" ? (
                        <TD className="px-3 py-2">
                          {isReadOnly ? (
                            <span className="text-xs text-[var(--muted)]">-</span>
                          ) : report.status === ExpenseReportStatus.PENDING ? (
                            <div className="space-y-2">
                              <form action={approveFormAction}>
                                <input type="hidden" name="expenseReportId" value={report.id} />
                                <Button type="submit" variant="primary" size="sm" disabled={isApproving} className="w-full">
                                  {copy.expenseReports.approve}
                                </Button>
                              </form>
                              <form action={rejectFormAction} className="space-y-2">
                                <input type="hidden" name="expenseReportId" value={report.id} />
                                <Input
                                  type="text"
                                  name="rejectionReason"
                                  placeholder={copy.expenseReports.rejectionReasonOptional}
                                  size="sm"
                                />
                                <Button type="submit" variant="destructive" size="sm" disabled={isRejecting} className="w-full">
                                  {copy.expenseReports.reject}
                                </Button>
                              </form>
                            </div>
                          ) : report.status === ExpenseReportStatus.APPROVED ? (
                            <a
                              href={`/journal?fromExpenseReport=${report.id}`}
                              className={buttonClasses("primary", "sm", "w-full")}
                            >
                              {copy.expenseReports.recordInJournal}
                            </a>
                          ) : null}
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
