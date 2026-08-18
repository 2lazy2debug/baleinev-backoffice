import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionIdOrNull } from "@/lib/edition-context";
import { getDictionary, getLocale } from "@/lib/i18n";
import { decimalToNumber } from "@/lib/utils";

import { WritableEditionOnly } from "@/components/edition-read-only";

import { ExpenseReportsPageClient } from "./client";
import CreateExpenseReportForm from "./create-expense-report-form";

export default async function ExpenseReportsPage() {
  const access = await getCurrentUserAccess();
  const locale = await getLocale();
  const copy = getDictionary(locale);

  const editionId = await resolveEditionIdOrNull();
  const activeEdition = editionId ? await prisma.edition.findUnique({
    where: { id: editionId },
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
  }) : null;

  if (!activeEdition) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.expenseReports.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.common.noEditionSelected}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">{copy.common.pickEditionHint}</p>
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
        <WritableEditionOnly>
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
        </WritableEditionOnly>

        <ExpenseReportsPageClient
          expenseReports={activeEdition.expenseReports}
          access={{ role: access.role }}
          copy={copy}
        />
      </section>
    </div>
  );
}
