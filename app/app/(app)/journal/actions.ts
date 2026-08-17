"use server";

import { revalidatePath } from "next/cache";
import { AccountType, TaskType } from "@prisma/client";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { resolveEditionId } from "@/lib/edition-context";
import {
  type ActionState,
  getRequiredString,
  toActionErrorMessage,
} from "@/lib/server-action-helpers";
import { resolvePendingTask } from "@/lib/tasks";

function toPositiveAmount(raw: string) {
  const normalized = raw.replace(",", ".").trim();
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number.");
  }

  return amount;
}

export async function createJournalEntryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const editionId = await resolveEditionId();

    const departmentId = getRequiredString(formData, "departmentId");
    const moneyAccountId = getRequiredString(formData, "moneyAccountId");
    const accountType = getRequiredString(formData, "accountType") as AccountType;
    const dateRaw = getRequiredString(formData, "date");
    const amountRaw = getRequiredString(formData, "amount");
    const label = getRequiredString(formData, "label");

    const date = new Date(dateRaw);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Date is invalid.");
    }

    const amount = toPositiveAmount(amountRaw);

    const counterparty = String(formData.get("counterparty") ?? "").trim() || null;
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim() || null;
    const costCenterId = String(formData.get("costCenterId") ?? "").trim() || null;

    await prisma.$transaction(async (tx) => {
      // Serialize sequence allocation per edition so two concurrent creations
      // cannot read the same max and collide on @@unique([editionId, sequenceNumber]).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${editionId})::bigint)`;

      const maxSequence = await tx.journalEntry.aggregate({
        where: { editionId, sequenceNumber: { gt: 0 } },
        _max: { sequenceNumber: true },
      });

      await tx.journalEntry.create({
        data: {
          editionId,
          sequenceNumber: (maxSequence._max.sequenceNumber ?? 0) + 1,
          departmentId,
          moneyAccountId,
          accountType,
          date,
          amount,
          label,
          counterparty,
          referenceNumber,
          costCenterId,
          enteredById: admin.id,
          isOpeningEntry: false,
        },
      });
    });

    const fromExpenseReportId = String(formData.get("fromExpenseReportId") ?? "").trim() || null;
    if (fromExpenseReportId) {
      await resolvePendingTask({ type: TaskType.RECORD_JOURNAL, expenseReportId: fromExpenseReportId, resolvedById: admin.id });
    }

    revalidatePath("/journal");
    revalidatePath("/");
    revalidatePath("/money-accounts");
    revalidatePath("/cost-centers");
    revalidatePath("/tasks");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function deleteJournalEntryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const journalEntryId = getRequiredString(formData, "journalEntryId");

    const entry = await prisma.journalEntry.findUnique({
      where: { id: journalEntryId },
      select: { isOpeningEntry: true, linkedInvoice: { select: { id: true } } },
    });

    if (!entry) {
      throw new Error("Journal entry not found.");
    }

    if (entry.isOpeningEntry) {
      throw new Error("Opening entries are locked and cannot be deleted.");
    }

    if (entry.linkedInvoice) {
      throw new Error("This journal entry is linked to a paid invoice. Set the invoice as unpaid first.");
    }

    await prisma.journalEntry.delete({ where: { id: journalEntryId } });

    revalidatePath("/journal");
    revalidatePath("/");
    revalidatePath("/money-accounts");
    revalidatePath("/cost-centers");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}

export async function updateJournalEntryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const journalEntryId = getRequiredString(formData, "journalEntryId");
    const departmentId = getRequiredString(formData, "departmentId");
    const moneyAccountId = getRequiredString(formData, "moneyAccountId");
    const accountType = getRequiredString(formData, "accountType") as AccountType;
    const dateRaw = getRequiredString(formData, "date");
    const amountRaw = getRequiredString(formData, "amount");
    const label = getRequiredString(formData, "label");

    const entry = await prisma.journalEntry.findUnique({
      where: { id: journalEntryId },
      select: { isOpeningEntry: true },
    });

    if (!entry) {
      throw new Error("Journal entry not found.");
    }

    if (entry.isOpeningEntry) {
      throw new Error("Opening entries are locked and cannot be edited.");
    }

    const date = new Date(dateRaw);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Date is invalid.");
    }

    const amount = toPositiveAmount(amountRaw);
    const counterparty = String(formData.get("counterparty") ?? "").trim() || null;
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim() || null;
    const costCenterId = String(formData.get("costCenterId") ?? "").trim() || null;

    await prisma.journalEntry.update({
      where: { id: journalEntryId },
      data: {
        departmentId,
        moneyAccountId,
        accountType,
        date,
        amount,
        label,
        counterparty,
        referenceNumber,
        costCenterId,
      },
    });

    revalidatePath("/journal");
    revalidatePath("/");
    revalidatePath("/money-accounts");
    revalidatePath("/cost-centers");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
