"use client";

import { useActionState, useMemo, useState } from "react";

import { FormError } from "@/components/form-error";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { allowedProofMimeTypes } from "@/lib/proof-upload";
import { initialActionState } from "@/lib/server-action-helpers";

import { createExpenseReportAction } from "./actions";

type DepartmentOption = {
  id: string;
  name: string;
};

type Copy = {
  create: string;
  submit: string;
  reportType: string;
  standardExpense: string;
  drivingExpense: string;
  description: string;
  drivingReason: string;
  departure: string;
  arrival: string;
  kilometers: string;
  amount: string;
  calculatedAmount: string;
  ratePerKm: string;
  paymentMethod: string;
  myMoney: string;
  festivalAccount: string;
  drivingRefundFixed: string;
  date: string;
  uploadProof: string;
  noProofRequired: string;
  department: string;
  selectDepartment: string;
};

type Props = {
  departments: DepartmentOption[];
  drivingRatePerKm: number;
  copy: Copy;
};

const EXPENSE_REPORT_TYPE = {
  STANDARD: "STANDARD",
  DRIVING: "DRIVING",
} as const;

const EXPENSE_PAYMENT_METHOD = {
  MY_MONEY: "MY_MONEY",
  FESTIVAL_ACCOUNT: "FESTIVAL_ACCOUNT",
} as const;

type ExpenseReportTypeValue = (typeof EXPENSE_REPORT_TYPE)[keyof typeof EXPENSE_REPORT_TYPE];

export default function CreateExpenseReportForm({ departments, drivingRatePerKm, copy }: Props) {
  const [reportType, setReportType] = useState<ExpenseReportTypeValue>(EXPENSE_REPORT_TYPE.STANDARD);
  const [kilometers, setKilometers] = useState("");
  const [createState, createFormAction, isCreating] = useActionState(createExpenseReportAction, initialActionState);

  const computedAmount = useMemo(() => {
    const km = Number(kilometers.replace(",", "."));
    if (!Number.isFinite(km) || km <= 0) {
      return 0;
    }

    return Number((km * drivingRatePerKm).toFixed(2));
  }, [kilometers, drivingRatePerKm]);

  return (
    <div>
      <Card as="section">
        <h2 className="text-xl font-semibold">{copy.create}</h2>

        <form action={createFormAction} className="mt-6 space-y-4">
          <FormError message={createState.error} />
          <Field label={copy.reportType}>
            <Select
              name="reportType"
              value={reportType}
              onChange={(event) => setReportType(event.target.value as ExpenseReportTypeValue)}
            >
              <option value={EXPENSE_REPORT_TYPE.STANDARD}>{copy.standardExpense}</option>
              <option value={EXPENSE_REPORT_TYPE.DRIVING}>{copy.drivingExpense}</option>
            </Select>
          </Field>

          {reportType === EXPENSE_REPORT_TYPE.STANDARD ? (
            <>
              <Field label={copy.description}>
                <Input type="text" name="description" required />
              </Field>

              <Field label={copy.amount}>
                <Input type="number" step="0.01" min="0.01" name="amount" required />
              </Field>
            </>
          ) : (
            <>
              <Field label={copy.drivingReason}>
                <Input type="text" name="drivingReason" required />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label={copy.departure}>
                  <Input type="text" name="departure" required />
                </Field>

                <Field label={copy.arrival}>
                  <Input type="text" name="arrival" required />
                </Field>
              </div>

              <Field label={copy.kilometers}>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  name="kilometers"
                  required
                  value={kilometers}
                  onChange={(event) => setKilometers(event.target.value)}
                />
              </Field>

              <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)]">
                {copy.ratePerKm}: CHF {drivingRatePerKm.toFixed(2)} / km
                <br />
                <span className="font-semibold text-[var(--ink)]">{copy.calculatedAmount}: CHF {computedAmount.toFixed(2)}</span>
              </p>
            </>
          )}

          {reportType === EXPENSE_REPORT_TYPE.DRIVING ? (
            <>
              <input type="hidden" name="paymentMethod" value={EXPENSE_PAYMENT_METHOD.MY_MONEY} />
              <Field label={copy.paymentMethod}>
                <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)]">
                  {copy.drivingRefundFixed}: <span className="font-semibold text-[var(--ink)]">{copy.myMoney}</span>
                </p>
              </Field>
            </>
          ) : (
            <Field label={copy.paymentMethod}>
              <Select name="paymentMethod" defaultValue={EXPENSE_PAYMENT_METHOD.MY_MONEY}>
                <option value={EXPENSE_PAYMENT_METHOD.MY_MONEY}>{copy.myMoney}</option>
                <option value={EXPENSE_PAYMENT_METHOD.FESTIVAL_ACCOUNT}>{copy.festivalAccount}</option>
              </Select>
            </Field>
          )}

          <Field label={copy.date}>
            <Input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          </Field>

          {reportType === EXPENSE_REPORT_TYPE.DRIVING ? (
            <Field label={copy.uploadProof}>
              <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)]">
                {copy.noProofRequired}
              </p>
            </Field>
          ) : (
            <Field label={copy.uploadProof}>
              <Input
                type="file"
                name="proof"
                required
                accept={allowedProofMimeTypes.join(",")}
                className="file:mr-4 file:rounded-md file:border-0 file:bg-[var(--panel-strong)] file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              />
            </Field>
          )}

          <Field label={copy.department}>
            <Select name="departmentId" required defaultValue="">
              <option value="" disabled>{copy.selectDepartment}</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </Select>
          </Field>

          <Button type="submit" variant="primary" disabled={isCreating}>
            {copy.submit}
          </Button>
        </form>
      </Card>
    </div>
  );
}
