"use client";

import { useActionState } from "react";

import { createJournalEntryAction } from "@/app/(app)/journal/actions";
import { FormError } from "@/components/form-error";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
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

const FORM_ID = "add-journal-entry-form";

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

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={copy.addEntry}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.close}
          </Button>
          <Button type="submit" form={FORM_ID} name="submitMode" value="close" variant="primary" disabled={pending}>
            {pending ? copy.saving : copy.saveAndClose}
          </Button>
          <Button type="submit" form={FORM_ID} name="submitMode" value="new" variant="secondary" disabled={pending}>
            {pending ? copy.saving : copy.saveAndNew}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} action={formAction} className="space-y-4">
        <FormError message={state.error} />
        {fromExpenseReportId ? (
          <input type="hidden" name="fromExpenseReportId" value={fromExpenseReportId} />
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Department *">
            <Select name="departmentId" required defaultValue={initialValues?.departmentId ?? ""}>
              <option value="" disabled>
                {copy.selectDepartment}
              </option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={`${copy.type} *`}>
            <Select name="accountType" required defaultValue={initialValues?.accountType ?? "CHARGES"}>
              <option value="CHARGES">{common.charges}</option>
              <option value="PRODUITS">{common.produits}</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${copy.date} *`}>
            <Input type="date" name="date" required defaultValue={initialValues?.date} />
          </Field>

          <Field label={`${copy.amount} *`}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              name="amount"
              required
              defaultValue={initialValues?.amount}
              placeholder="0.00"
            />
          </Field>
        </div>

        <Field label={`${copy.moneyAccount} *`}>
          <Select name="moneyAccountId" required defaultValue="">
            <option value="" disabled>
              {copy.selectAccount}
            </option>
            {moneyAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={`${copy.label} *`}>
          <Input type="text" name="label" required defaultValue={initialValues?.label} placeholder="Description" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.counterparty}>
            <Input type="text" name="counterparty" />
          </Field>

          <Field label={copy.reference}>
            <Input type="text" name="referenceNumber" defaultValue={initialValues?.referenceNumber} />
          </Field>
        </div>

        <Field label={copy.costCenter}>
          <Select name="costCenterId" defaultValue="">
            <option value="">{copy.none}</option>
            {costCenters.map((center) => (
              <option key={center.id} value={center.id}>
                {center.code}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
