"use server";

import { revalidatePath } from "next/cache";
import { AccountType, TaskType } from "@prisma/client";

import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { requireWritableEdition, resolveWritableEditionId } from "@/lib/edition-context";
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
    const editionId = await resolveWritableEditionId();

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
      select: { editionId: true, isOpeningEntry: true, linkedInvoice: { select: { id: true } } },
    });

    if (!entry) {
      throw new Error("Journal entry not found.");
    }

    await requireWritableEdition(entry.editionId);

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
      select: { editionId: true, isOpeningEntry: true },
    });

    if (!entry) {
      throw new Error("Journal entry not found.");
    }

    await requireWritableEdition(entry.editionId);

    if (entry.isOpeningEntry) {
      throw new Error("Opening entries are locked and cannot be edited.");
    }

    const date = new Date(dateRaw);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Date is invalid.");
    }

    const amount = toPositiveAmount(amountRaw);
    const costCenterId = String(formData.get("costCenterId") ?? "").trim() || null;

    // Absent is not the same as blank. The edit form posts these two as named
    // inputs, so clearing one there still clears it; the journal's inline row
    // editor has no such column and must not null what it cannot show.
    const optional = (key: "counterparty" | "referenceNumber") =>
      formData.has(key) ? { [key]: String(formData.get(key) ?? "").trim() || null } : {};

    await prisma.journalEntry.update({
      where: { id: journalEntryId },
      data: {
        departmentId,
        moneyAccountId,
        accountType,
        date,
        amount,
        label,
        costCenterId,
        ...optional("counterparty"),
        ...optional("referenceNumber"),
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

/**
 * Save every row the journal's bulk-edit mode changed, in one transaction.
 *
 * Bulk edit is the same seven fields as the inline row editor, applied to the
 * whole ledger at once, so it reuses that shape rather than inventing a second
 * one: the client sends only the rows it actually touched, as JSON, and either
 * all of them land or none do. `counterparty` and `referenceNumber` are not
 * part of the grid and are deliberately left alone.
 */
export async function bulkUpdateJournalEntriesAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();

    // Read outside the try — a missing field is "entries is required.", not the
    // parse failure below.
    const payload = getRequiredString(formData, "entries");

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new Error("Could not read the edited entries.");
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("There is nothing to save.");
    }

    const updates = parsed.map((raw) => {
      const item = raw as Record<string, unknown>;
      const readRequired = (key: string) => {
        const value = String(item[key] ?? "").trim();
        if (!value) {
          throw new Error(`${key} is required.`);
        }
        return value;
      };

      const date = new Date(readRequired("date"));
      if (Number.isNaN(date.getTime())) {
        throw new Error("Date is invalid.");
      }

      return {
        id: readRequired("journalEntryId"),
        departmentId: readRequired("departmentId"),
        moneyAccountId: readRequired("moneyAccountId"),
        accountType: readRequired("accountType") as AccountType,
        date,
        amount: toPositiveAmount(readRequired("amount")),
        label: readRequired("label"),
        costCenterId: String(item.costCenterId ?? "").trim() || null,
      };
    });

    const stored = await prisma.journalEntry.findMany({
      where: { id: { in: updates.map((update) => update.id) } },
      select: { id: true, editionId: true, isOpeningEntry: true },
    });

    if (stored.length !== updates.length) {
      throw new Error("Journal entry not found.");
    }

    if (stored.some((entry) => entry.isOpeningEntry)) {
      throw new Error("Opening entries are locked and cannot be edited.");
    }

    // One ledger, one edition — a payload spanning two would need two writability
    // checks, and the journal screen never produces one.
    const editionIds = new Set(stored.map((entry) => entry.editionId));
    if (editionIds.size !== 1) {
      throw new Error("Journal entries must belong to the same edition.");
    }

    await requireWritableEdition([...editionIds][0]);

    await prisma.$transaction(
      updates.map(({ id, ...data }) => prisma.journalEntry.update({ where: { id }, data })),
    );

    revalidatePath("/journal");
    revalidatePath("/");
    revalidatePath("/money-accounts");
    revalidatePath("/cost-centers");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
}
