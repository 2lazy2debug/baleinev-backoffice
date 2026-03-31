"use client";

import { useMemo, useState } from "react";

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

  const computedAmount = useMemo(() => {
    const km = Number(kilometers.replace(",", "."));
    if (!Number.isFinite(km) || km <= 0) {
      return 0;
    }

    return Number((km * drivingRatePerKm).toFixed(2));
  }, [kilometers, drivingRatePerKm]);

  return (
    <section className="rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-6">
      <h2 className="text-xl font-semibold">{copy.create}</h2>

      <form action={createExpenseReportAction} className="mt-6 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">{copy.reportType}</span>
          <select
            name="reportType"
            value={reportType}
            onChange={(event) => setReportType(event.target.value as ExpenseReportTypeValue)}
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
          >
            <option value={EXPENSE_REPORT_TYPE.STANDARD}>{copy.standardExpense}</option>
            <option value={EXPENSE_REPORT_TYPE.DRIVING}>{copy.drivingExpense}</option>
          </select>
        </label>

        {reportType === EXPENSE_REPORT_TYPE.STANDARD ? (
          <>
            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.description}</span>
              <input
                type="text"
                name="description"
                required
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.amount}</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                name="amount"
                required
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              />
            </label>
          </>
        ) : (
          <>
            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.drivingReason}</span>
              <input
                type="text"
                name="drivingReason"
                required
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">{copy.departure}</span>
                <input
                  type="text"
                  name="departure"
                  required
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">{copy.arrival}</span>
                <input
                  type="text"
                  name="arrival"
                  required
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.kilometers}</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                name="kilometers"
                required
                value={kilometers}
                onChange={(event) => setKilometers(event.target.value)}
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              />
            </label>

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
            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.paymentMethod}</span>
              <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)]">
                {copy.drivingRefundFixed}: <span className="font-semibold text-[var(--ink)]">{copy.myMoney}</span>
              </p>
            </label>
          </>
        ) : (
          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.paymentMethod}</span>
            <select
              name="paymentMethod"
              defaultValue={EXPENSE_PAYMENT_METHOD.MY_MONEY}
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            >
              <option value={EXPENSE_PAYMENT_METHOD.MY_MONEY}>{copy.myMoney}</option>
              <option value={EXPENSE_PAYMENT_METHOD.FESTIVAL_ACCOUNT}>{copy.festivalAccount}</option>
            </select>
          </label>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-medium">{copy.date}</span>
          <input
            type="date"
            name="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        {reportType === EXPENSE_REPORT_TYPE.DRIVING ? (
          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.uploadProof}</span>
            <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)]">
              {copy.noProofRequired}
            </p>
          </label>
        ) : (
          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.uploadProof}</span>
            <input
              type="file"
              name="proof"
              required
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm outline-none transition file:mr-4 file:rounded-full file:border-0 file:bg-[var(--panel-strong)] file:px-3 file:py-1.5 file:text-xs file:font-semibold"
            />
          </label>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-medium">{copy.department}</span>
          <select
            name="departmentId"
            required
            defaultValue=""
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
          >
            <option value="" disabled>{copy.selectDepartment}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </label>

        <button className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
          {copy.submit}
        </button>
      </form>
    </section>
  );
}
