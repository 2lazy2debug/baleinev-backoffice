"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { AccountType } from "@prisma/client";

import { FormError } from "@/components/form-error";
import { Button, Field, Input, Select, buttonClasses } from "@/components/ui";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

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
  const router = useRouter();

  // This page is where a phone edits an entry — the table's inline editor is
  // desktop-only. A save has to land the user back on the list, the same way
  // closing the inline editor does; staying on the form reads as "nothing happened".
  async function save(previous: ActionState, formData: FormData): Promise<ActionState> {
    const result = await updateJournalEntryAction(previous, formData);
    if (!result.error) {
      router.push("/journal");
    }
    return result;
  }

  const [state, formAction, isPending] = useActionState(save, initialActionState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <input type="hidden" name="journalEntryId" value={entry.id} />

      <Field label={copy.department}>
        <Select name="departmentId" required defaultValue={entry.departmentId ?? ""}>
          <option value="" disabled>
            {copy.selectDepartment}
          </option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.type}>
          <Select name="accountType" required defaultValue={entry.accountType}>
            <option value={AccountType.CHARGES}>{commonCopy.charges}</option>
            <option value={AccountType.PRODUITS}>{commonCopy.produits}</option>
          </Select>
        </Field>

        <Field label={copy.date}>
          <Input type="date" name="date" required defaultValue={entry.date} />
        </Field>
      </div>

      <Field label={copy.amount}>
        <Input type="number" step="0.01" min="0.01" name="amount" required defaultValue={entry.amount} />
      </Field>

      <Field label={copy.moneyAccount}>
        <Select name="moneyAccountId" required defaultValue={entry.moneyAccountId}>
          {moneyAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={copy.label}>
        <Input type="text" name="label" required defaultValue={entry.label} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.counterparty}>
          <Input type="text" name="counterparty" defaultValue={entry.counterparty ?? ""} />
        </Field>

        <Field label={copy.reference}>
          <Input type="text" name="referenceNumber" defaultValue={entry.referenceNumber ?? ""} />
        </Field>
      </div>

      <Field label={copy.costCenter}>
        <Select name="costCenterId" defaultValue={entry.costCenterId ?? ""}>
          <option value="">{copy.none}</option>
          {costCenters.map((costCenter) => (
            <option key={costCenter.id} value={costCenter.id}>
              {costCenter.code}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={isPending}>
          {shellCopy.save}
        </Button>
        <Link href="/journal" className={buttonClasses()}>
          {shellCopy.cancel}
        </Link>
      </div>
    </form>
  );
}
