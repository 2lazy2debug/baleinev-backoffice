"use client";

import { useActionState } from "react";
import { ExpenseReportStatus } from "@prisma/client";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { FormError } from "@/components/form-error";
import {
  Badge,
  Button,
  Card,
  Cardlet,
  CardletActions,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  Input,
  SectionTitle,
  TD,
  TH,
  THead,
  TR,
  Table,
  buttonClasses,
} from "@/components/ui";
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

  const isAdmin = access.role === "ADMIN";

  // Every label and permission is derived once, here, and read by both the
  // desktop table and the mobile cardlets — the two views must never compute a
  // status, an amount or an action gate of their own.
  const rows = expenseReports.map((report) => ({
    report,
    statusLabel:
      report.status === ExpenseReportStatus.PENDING
        ? copy.expenseReports.pending
        : report.status === ExpenseReportStatus.APPROVED
          ? copy.expenseReports.approved
          : copy.expenseReports.rejected,
    statusTone: (report.status === ExpenseReportStatus.APPROVED
      ? "success"
      : report.status === ExpenseReportStatus.REJECTED
        ? "error"
        : "warning") as "success" | "error" | "warning",
    typeLabel:
      report.reportType === "DRIVING" ? copy.expenseReports.drivingExpense : copy.expenseReports.standardExpense,
    paymentLabel:
      report.paymentMethod === "MY_MONEY" ? copy.expenseReports.myMoney : copy.expenseReports.festivalAccount,
    amountLabel: formatCurrency(decimalToNumber(report.amount)),
    drivingSummary:
      report.reportType === "DRIVING"
        ? `${report.departure} -> ${report.arrival} | ${decimalToNumber(report.kilometers ?? 0)} km @ CHF ${decimalToNumber(report.ratePerKm ?? 0).toFixed(2)}`
        : null,
    bankInfoTitle: [
      copy.expenseReports.userBankInfo,
      `${copy.expenseReports.bankFirstName}: ${report.submittedBy.refundFirstName || copy.expenseReports.missingBankInfo}`,
      `${copy.expenseReports.bankLastName}: ${report.submittedBy.refundLastName || copy.expenseReports.missingBankInfo}`,
      `${copy.expenseReports.bankIban}: ${report.submittedBy.refundIban || copy.expenseReports.missingBankInfo}`,
      `${copy.expenseReports.bankZip}: ${report.submittedBy.refundZip || copy.expenseReports.missingBankInfo}`,
      `${copy.expenseReports.bankCity}: ${report.submittedBy.refundCity || copy.expenseReports.missingBankInfo}`,
    ].join("\n"),
    canReview: isAdmin && !isReadOnly && report.status === ExpenseReportStatus.PENDING,
    canRecord: isAdmin && !isReadOnly && report.status === ExpenseReportStatus.APPROVED,
    reviewerLabel:
      report.status !== ExpenseReportStatus.PENDING && report.reviewedBy ? report.reviewedBy.name : null,
  }));

  return (
    <div>
      {/* Below `sm` the frame and the heading go: the tab strip in the top bar
          already says "History", and the cardlets are surfaces of their own. */}
      <Card as="section" flushOnMobile>
        <SectionTitle desktopOnly>{copy.expenseReports.history}</SectionTitle>

        {isAdmin ? (
          <div className="space-y-2 sm:mt-4">
            <FormError message={approveState.error} />
            <FormError message={rejectState.error} />
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)] sm:mt-4">{copy.expenseReports.noHistory}</p>
        ) : (
          <>
            <Table dense desktopOnly frameClassName="mt-4">
              <THead>
                <TR>
                  <TH>{copy.expenseReports.date}</TH>
                  <TH>{copy.expenseReports.reportType}</TH>
                  <TH>{copy.expenseReports.description}</TH>
                  <TH>{copy.expenseReports.department}</TH>
                  <TH>{copy.expenseReports.amount}</TH>
                  <TH>{copy.expenseReports.paymentMethod}</TH>
                  <TH>{copy.expenseReports.status}</TH>
                  <TH>{copy.expenseReports.proof}</TH>
                  {isAdmin ? <TH>{copy.journal.actions}</TH> : null}
                </TR>
              </THead>
              <tbody>
                {rows.map((row) => (
                  <TR key={row.report.id} className="align-top">
                    <TD>{formatDate(row.report.date)}</TD>
                    <TD>{row.typeLabel}</TD>
                    <TD>
                      <p className="font-medium">{row.report.description}</p>
                      {row.drivingSummary ? (
                        <p className="text-xs text-[var(--muted)]">{row.drivingSummary}</p>
                      ) : null}
                      <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
                        <span>{copy.expenseReports.submittedBy}: {row.report.submittedBy.name}</span>
                        {isAdmin ? (
                          <Badge tone="neutral" title={row.bankInfoTitle}>
                            i
                          </Badge>
                        ) : null}
                      </p>
                    </TD>
                    <TD>{row.report.department.name}</TD>
                    <TD>{row.amountLabel}</TD>
                    <TD>{row.paymentLabel}</TD>
                    <TD>
                      <p>{row.statusLabel}</p>
                      {row.reviewerLabel ? (
                        <p className="text-[var(--muted)]">{copy.expenseReports.reviewedBy}: {row.reviewerLabel}</p>
                      ) : null}
                      {row.report.rejectionReason ? (
                        <p className="mt-1 text-rose-300">{row.report.rejectionReason}</p>
                      ) : null}
                    </TD>
                    <TD>
                      {row.report.proofFilename ? (
                        <a
                          href={`/api/expense-reports/${row.report.id}/proof`}
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
                    {isAdmin ? (
                      <TD>
                        {isReadOnly ? (
                          <span className="text-xs text-[var(--muted)]">-</span>
                        ) : row.canReview ? (
                          <div className="space-y-2">
                            <form action={approveFormAction}>
                              <input type="hidden" name="expenseReportId" value={row.report.id} />
                              <Button type="submit" variant="primary" size="sm" disabled={isApproving} className="w-full">
                                {copy.expenseReports.approve}
                              </Button>
                            </form>
                            <form action={rejectFormAction} className="space-y-2">
                              <input type="hidden" name="expenseReportId" value={row.report.id} />
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
                        ) : row.canRecord ? (
                          <a
                            href={`/journal?fromExpenseReport=${row.report.id}`}
                            className={buttonClasses("primary", "sm", "w-full")}
                          >
                            {copy.expenseReports.recordInJournal}
                          </a>
                        ) : null}
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </tbody>
            </Table>

            <CardletList>
              {rows.map((row) => (
                <Cardlet key={row.report.id}>
                  <CardletHeader
                    title={row.report.description}
                    action={<Badge tone={row.statusTone}>{row.statusLabel}</Badge>}
                  />

                  <CardletFields>
                    <CardletField label={copy.expenseReports.date}>{formatDate(row.report.date)}</CardletField>
                    <CardletField label={copy.expenseReports.reportType}>{row.typeLabel}</CardletField>
                    <CardletField label={copy.expenseReports.department}>{row.report.department.name}</CardletField>
                    <CardletField label={copy.expenseReports.amount}>{row.amountLabel}</CardletField>
                    <CardletField label={copy.expenseReports.paymentMethod}>{row.paymentLabel}</CardletField>
                    <CardletField label={copy.expenseReports.proof}>
                      {row.report.proofFilename ? (
                        <a
                          href={`/api/expense-reports/${row.report.id}/proof`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[var(--accent)]"
                        >
                          {copy.expenseReports.openProof}
                        </a>
                      ) : (
                        <span className="text-[var(--muted)]">-</span>
                      )}
                    </CardletField>
                  </CardletFields>

                  {row.drivingSummary ? (
                    <p className="text-xs text-[var(--muted)]">{row.drivingSummary}</p>
                  ) : null}

                  <p className="text-xs text-[var(--muted)]">
                    {copy.expenseReports.submittedBy}: {row.report.submittedBy.name}
                    {row.reviewerLabel ? ` · ${copy.expenseReports.reviewedBy}: ${row.reviewerLabel}` : null}
                  </p>

                  {row.report.rejectionReason ? (
                    <p className="text-xs text-rose-300">{row.report.rejectionReason}</p>
                  ) : null}

                  {row.canReview ? (
                    <CardletActions>
                      <form action={approveFormAction}>
                        <input type="hidden" name="expenseReportId" value={row.report.id} />
                        <Button type="submit" variant="primary" disabled={isApproving}>
                          {copy.expenseReports.approve}
                        </Button>
                      </form>
                      <form action={rejectFormAction} className="space-y-2">
                        <input type="hidden" name="expenseReportId" value={row.report.id} />
                        <Input
                          type="text"
                          name="rejectionReason"
                          placeholder={copy.expenseReports.rejectionReasonOptional}
                        />
                        <Button type="submit" variant="destructive" disabled={isRejecting}>
                          {copy.expenseReports.reject}
                        </Button>
                      </form>
                    </CardletActions>
                  ) : row.canRecord ? (
                    <CardletActions>
                      <a
                        href={`/journal?fromExpenseReport=${row.report.id}`}
                        className={buttonClasses("primary")}
                      >
                        {copy.expenseReports.recordInJournal}
                      </a>
                    </CardletActions>
                  ) : null}
                </Cardlet>
              ))}
            </CardletList>
          </>
        )}
      </Card>
    </div>
  );
}
