"use server";

import { ExpensePaymentMethod, ExpenseReportStatus, ExpenseReportType, TaskType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getCurrentUserAccess, requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getActiveEditionId, getRequiredString } from "@/lib/server-action-helpers";
import { createAdminTask, resolvePendingTask } from "@/lib/tasks";

function parsePositiveAmount(raw: string) {
  const normalized = raw.replace(",", ".").trim();
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number.");
  }

  return amount;
}

function parsePaymentMethod(value: string) {
  if (value !== ExpensePaymentMethod.MY_MONEY && value !== ExpensePaymentMethod.FESTIVAL_ACCOUNT) {
    throw new Error("Invalid payment method.");
  }

  return value;
}

function parseDate(raw: string) {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Date is invalid.");
  }

  return date;
}

function parseReportType(value: string) {
  if (value !== ExpenseReportType.STANDARD && value !== ExpenseReportType.DRIVING) {
    throw new Error("Invalid expense report type.");
  }

  return value;
}

function parsePositiveNumber(raw: string, fieldName: string) {
  const normalized = raw.replace(",", ".").trim();
  const value = Number(normalized);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }

  return value;
}

export async function createExpenseReportAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const editionId = await getActiveEditionId();
  const reportType = parseReportType(getRequiredString(formData, "reportType"));
  const submittedPaymentMethod = String(formData.get("paymentMethod") ?? "").trim();
  const date = parseDate(getRequiredString(formData, "date"));
  const departmentId = getRequiredString(formData, "departmentId");

  const activeEdition = await prisma.edition.findUniqueOrThrow({
    where: { id: editionId },
    select: { drivingRatePerKm: true },
  });

  let description: string;
  let amount: number;
  let departure: string | null = null;
  let arrival: string | null = null;
  let kilometers: number | null = null;
  let ratePerKm: number | null = null;
  let paymentMethod: ExpensePaymentMethod;
  let proofData: Uint8Array<ArrayBuffer> | null = null;
  let proofMimeType: string | null = null;
  let proofFilename: string | null = null;

  if (reportType === ExpenseReportType.DRIVING) {
    description = getRequiredString(formData, "drivingReason");
    departure = getRequiredString(formData, "departure");
    arrival = getRequiredString(formData, "arrival");
    kilometers = parsePositiveNumber(getRequiredString(formData, "kilometers"), "Kilometers");
    ratePerKm = Number(activeEdition.drivingRatePerKm.toString());
    amount = Number((kilometers * ratePerKm).toFixed(2));
    paymentMethod = ExpensePaymentMethod.MY_MONEY;
  } else {
    description = getRequiredString(formData, "description");
    amount = parsePositiveAmount(getRequiredString(formData, "amount"));
    paymentMethod = parsePaymentMethod(submittedPaymentMethod || getRequiredString(formData, "paymentMethod"));

    const proof = formData.get("proof");
    if (!(proof instanceof File) || proof.size === 0) {
      throw new Error("Proof file is required.");
    }

    proofData = new Uint8Array(await proof.arrayBuffer()) as Uint8Array<ArrayBuffer>;
    proofMimeType = proof.type || "application/octet-stream";
    proofFilename = proof.name || "proof";
  }

  const expenseReport = await prisma.expenseReport.create({
    data: {
      editionId,
      departmentId,
      submittedById: access.id,
      reportType,
      description,
      departure,
      arrival,
      kilometers,
      ratePerKm,
      amount,
      paymentMethod,
      date,
      proofData,
      proofMimeType,
      proofFilename,
      status: ExpenseReportStatus.PENDING,
    },
  });

  await createAdminTask(TaskType.REVIEW_EXPENSE_REPORT, `Review: ${description}`, expenseReport.id);
  revalidatePath("/expense-reports");
  revalidatePath("/tasks");
}

export async function approveExpenseReportAction(formData: FormData) {
  const access = await requireAdmin();
  const expenseReportId = getRequiredString(formData, "expenseReportId");

  // Find the report to get its description for the follow-up task title
  const report = await prisma.expenseReport.findUniqueOrThrow({
    where: { id: expenseReportId },
    select: { description: true },
  });

  await prisma.expenseReport.update({
    where: { id: expenseReportId },
    data: {
      status: ExpenseReportStatus.APPROVED,
      rejectionReason: null,
      reviewedAt: new Date(),
      reviewedById: access.id,
    },
  });

  await resolvePendingTask({ type: TaskType.REVIEW_EXPENSE_REPORT, expenseReportId, resolvedById: access.id });
  await createAdminTask(TaskType.RECORD_JOURNAL, `Record in journal: ${report.description}`, expenseReportId);

  revalidatePath("/expense-reports");
  revalidatePath("/tasks");
}

export async function rejectExpenseReportAction(formData: FormData) {
  const access = await requireAdmin();
  const expenseReportId = getRequiredString(formData, "expenseReportId");
  const rejectionReason = String(formData.get("rejectionReason") ?? "").trim() || null;

  await prisma.expenseReport.update({
    where: { id: expenseReportId },
    data: {
      status: ExpenseReportStatus.REJECTED,
      rejectionReason,
      reviewedAt: new Date(),
      reviewedById: access.id,
    },
  });

  await resolvePendingTask({ type: TaskType.REVIEW_EXPENSE_REPORT, expenseReportId, resolvedById: access.id });

  revalidatePath("/expense-reports");
  revalidatePath("/tasks");
}
