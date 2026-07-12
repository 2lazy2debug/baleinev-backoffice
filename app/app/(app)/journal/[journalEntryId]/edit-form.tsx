"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AccountType } from "@prisma/client";

import { FormError } from "@/components/form-error";
import { initialActionState } from "@/lib/server-action-helpers";

import { updateJournalEntryAction } from "../actions";

type Copy = {
  department: string;
  selectDepartment: string;
  type: string;
  date: string;
  amount: string;
  moneyAccount: string;
  label: string;
  counterparty: string;
  reference: string;
  costCenter: string;
  none: string;
};

type ShellCopy = { save: string; cancel: string };

type JournalEntryEditFormProps = {
  copy: Copy;
  commonCopy: { charges: string; produits: string };
  shellCopy: ShellCopy;
  entry: {
    id: string;
    departmentId: string | null;
    accountType: "CHARGES" | "PRODUITS";
    date: string;
    amount: string;
    moneyAccountId: string;
    label: string;
    counterparty: string | null;
    referenceNumber: string | null;
    costCenterId: string | null;
  };
  departments: Array<{ id: string; name: string }>;
  moneyAccounts: Array<{ id: string; name: string }>;
  costCenters: Array<{ id: string; code: string }>;
};

export function JournalEntryEditForm({
  copy,
  commonCopy,
  shellCopy,
  entry,
  departments,
  moneyAccounts,
  costCenters,
}: JournalEntryEditFormProps) {
  const [state, formAction, isPending] = useActionState(updateJournalEntryAction, initialActionState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <input type="hidden" name="journalEntryId" value={entry.id} />

      <label className="block space-y-1">
        <span className="text-xs font-medium text-[var(--muted)]">{copy.department}</span>
        <select
          name="departmentId"
          required
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
          defaultValue={entry.departmentId ?? ""}
        >
          <option value="" disabled>
            {copy.selectDepartment}
          </option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--muted)]">{copy.type}</span>
          <select
            name="accountType"
            required
            defaultValue={entry.accountType}
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
          >
            <option value={AccountType.CHARGES}>{commonCopy.charges}</option>
            <option value={AccountType.PRODUITS}>{commonCopy.produits}</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--muted)]">{copy.date}</span>
          <input
            type="date"
            name="date"
            required
            defaultValue={entry.date}
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-[var(--muted)]">{copy.amount}</span>
        <input
          type="number"
          step="0.01"
          min="0.01"
          name="amount"
          required
          defaultValue={entry.amount}
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-[var(--muted)]">{copy.moneyAccount}</span>
        <select
          name="moneyAccountId"
          required
          defaultValue={entry.moneyAccountId}
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
        >
          {moneyAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-[var(--muted)]">{copy.label}</span>
        <input
          type="text"
          name="label"
          required
          defaultValue={entry.label}
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--muted)]">{copy.counterparty}</span>
          <input
            type="text"
            name="counterparty"
            defaultValue={entry.counterparty ?? ""}
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--muted)]">{copy.reference}</span>
          <input
            type="text"
            name="referenceNumber"
            defaultValue={entry.referenceNumber ?? ""}
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-[var(--muted)]">{copy.costCenter}</span>
        <select
          name="costCenterId"
          defaultValue={entry.costCenterId ?? ""}
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
        >
          <option value="">{copy.none}</option>
          {costCenters.map((costCenter) => (
            <option key={costCenter.id} value={costCenter.id}>
              {costCenter.code}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3">
        <button
          disabled={isPending}
          className="rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
        >
          {shellCopy.save}
        </button>
        <Link href="/journal" className="rounded-md border border-[var(--line)] px-5 py-2 text-sm font-semibold hover:bg-[var(--panel-strong)]">
          {shellCopy.cancel}
        </Link>
      </div>
    </form>
  );
}
