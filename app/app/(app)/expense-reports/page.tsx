import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import { WritableEditionOnly } from "@/components/edition-read-only";

import { ExpenseReportsPageClient } from "./client";
import CreateExpenseReportModal from "./create-expense-report-modal";
import { EmptyPage, PageHeader } from "@/components/ui";

export default async function ExpenseReportsPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
    include: {
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
  }) : null;

  // An expense is filed by a team, so the picker is the departments themselves —
  // global, and for a department user, the ones they belong to.
  const departments = activeEdition
    ? await prisma.department.findMany({
        where: access.role === "ADMIN" ? {} : { id: { in: access.departmentIds } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  if (!activeEdition) {
    return (
      <EmptyPage eyebrow={copy.expenseReports.title} title={copy.common.noEditionSelected}>
        {copy.common.pickEditionHint}
      </EmptyPage>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.expenseReports.title}
        title={<>{copy.expenseReports.title} {activeEdition.name}</>}
        description={copy.expenseReports.subtitle}
        actions={
          <WritableEditionOnly>
            <CreateExpenseReportModal
              departments={departments}
              drivingRatePerKm={decimalToNumber(activeEdition.drivingRatePerKm)}
              copy={{
                create: copy.expenseReports.create,
                cancel: copy.shell.cancel,
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
          </WritableEditionOnly>
        }
      />

      <ExpenseReportsPageClient
        expenseReports={activeEdition.expenseReports}
        access={{ role: access.role }}
        copy={copy}
      />
    </div>
  );
}
