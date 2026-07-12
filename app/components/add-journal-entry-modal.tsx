"use client";

import { useActionState } from "react";

import { createJournalEntryAction } from "@/app/(app)/journal/actions";
import { FormError } from "@/components/form-error";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

type AddJournalEntryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  departments: Array<{ id: string; name: string }>;
  moneyAccounts: Array<{ id: string; name: string }>;
  costCenters: Array<{ id: string; code: string }>;
  onAfterSubmit?: () => void;
  locale: Locale;
  initialValues?: {
    departmentId?: string;
    accountType?: "CHARGES" | "PRODUITS";
    date?: string;
    amount?: string;
    label?: string;
    referenceNumber?: string;
  };
  fromExpenseReportId?: string | null;
};

export function AddJournalEntryModal({
  isOpen,
  onClose,
  departments,
  moneyAccounts,
  costCenters,
  onAfterSubmit,
  locale,
  initialValues,
  fromExpenseReportId,
}: AddJournalEntryModalProps) {
  const copy = dictionaries[locale].journal;
  const common = dictionaries[locale].common;

  async function handleSubmit(prevState: ActionState, formData: FormData): Promise<ActionState> {
    const result = await createJournalEntryAction(prevState, formData);

    if (result.error) {
      return result;
    }

    const mode = formData.get("submitMode");

    if (onAfterSubmit) {
      onAfterSubmit();
    }

    if (mode === "close") {
      onClose();
    } else if (mode === "new") {
      const form = document.querySelector("form") as HTMLFormElement;
      form?.reset();
    }

    return result;
  }

  const [state, formAction, pending] = useActionState(handleSubmit, initialActionState);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">{copy.addEntry}</h2>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--ink)]"
            aria-label={copy.close}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form action={formAction} className="space-y-4">
          <FormError message={state.error} />
          {fromExpenseReportId ? (
            <input type="hidden" name="fromExpenseReportId" value={fromExpenseReportId} />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">Department *</span>
              <select
                name="departmentId"
                required
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
                defaultValue={initialValues?.departmentId ?? ""}
              >
                <option value="" disabled>
                  {copy.selectDepartment}
                </option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.type} *</span>
              <select
                name="accountType"
                required
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
                defaultValue={initialValues?.accountType ?? "CHARGES"}
              >
                <option value="CHARGES">{common.charges}</option>
                <option value="PRODUITS">{common.produits}</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.date} *</span>
              <input
                type="date"
                name="date"
                required
                defaultValue={initialValues?.date}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.amount} *</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                name="amount"
                required
                defaultValue={initialValues?.amount}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
                placeholder="0.00"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted)]">{copy.moneyAccount} *</span>
            <select
              name="moneyAccountId"
              required
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
              defaultValue=""
            >
              <option value="" disabled>
                  {copy.selectAccount}
              </option>
              {moneyAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted)]">{copy.label} *</span>
            <input
              type="text"
              name="label"
              required
                defaultValue={initialValues?.label}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
              placeholder="Description"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.counterparty}</span>
              <input
                type="text"
                name="counterparty"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{copy.reference}</span>
              <input
                type="text"
                name="referenceNumber"
                defaultValue={initialValues?.referenceNumber}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted)]">{copy.costCenter}</span>
            <select name="costCenterId" className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2" defaultValue="">
              <option value="">{copy.none}</option>
              {costCenters.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.code}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--line)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--line)] px-5 py-2 text-sm font-semibold hover:bg-[var(--panel-strong)]"
            >
              {copy.close}
            </button>

            <button
              type="submit"
              name="submitMode"
              value="close"
              disabled={pending}
              className="rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
            >
              {pending ? copy.saving : copy.saveAndClose}
            </button>

            <button
              type="submit"
              name="submitMode"
              value="new"
              disabled={pending}
              className="rounded-md border border-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-60"
            >
              {pending ? copy.saving : copy.saveAndNew}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
