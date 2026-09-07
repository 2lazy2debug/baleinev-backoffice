"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Field, Input, Modal, Panel, Select } from "@/components/ui";
import { fromRappen } from "@/lib/cash";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatCurrency } from "@/lib/utils";

import { journalCashRegisterAction } from "./actions";
import type { CashRegisterRow } from "./client";

/** What the page hands down for a closed, unbooked register. All figures are rappen. */
export type RegisterBooking = {
  figures: {
    float: number;
    cashTaken: number;
    expected: number;
    actual: number;
    gap: number;
    sessionCount: number;
  };
  entries: Array<{
    kind: "float" | "return" | "correction";
    accountType: "CHARGES" | "PRODUITS";
    /** Positive rappen. */
    amount: number;
  }>;
};

const FORM_ID = "journal-register";

type Props = {
  locale: Locale;
  register: CashRegisterRow | null;
  budgets: Array<{ id: string; name: string }>;
  costCenters: Array<{ id: string; code: string }>;
  onClose: () => void;
};

/**
 * Booking a closed register into the journal. A one-press irreversible write, so
 * it shows exactly what it is about to do: the five figures it read, then the
 * two or three entries it will write, and only then the fields it needs.
 */
export default function JournalRegisterModal({ locale, register, budgets, costCenters, onClose }: Props) {
  const copy = dictionaries[locale];
  const cash = copy.cash;
  const common = copy.common;
  const router = useRouter();
  const [state, formAction, pending] = useActionState(journalCashRegisterAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, pending, () => {
    onClose();
    router.refresh();
  });

  const booking = register?.booking ?? null;

  const figureRows = booking
    ? [
        { label: cash.figureFloat, value: booking.figures.float },
        { label: cash.figureTaken, value: booking.figures.cashTaken },
        { label: cash.figureExpected, value: booking.figures.expected },
        { label: cash.figureActual, value: booking.figures.actual },
      ]
    : [];

  const previewLabel: Record<RegisterBooking["entries"][number]["kind"], string> = {
    float: cash.labelFloat,
    return: cash.labelReturn,
    correction: cash.labelCorrection,
  };

  const gap = booking?.figures.gap ?? 0;

  return (
    <Modal
      open={register !== null}
      onClose={onClose}
      title={cash.bookTitle}
      size="lg"
      mobileFullScreen
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.shell.cancel}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={pending}>
            {cash.bookEntries}
          </Button>
        </>
      }
    >
      {register && booking ? (
        <form id={FORM_ID} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />
          <input type="hidden" name="registerId" value={register.id} />

          <p className="text-sm text-[var(--muted)]">
            <span className="font-medium text-[var(--ink)]">{register.name}</span>
            {booking.figures.sessionCount > 0
              ? ` · ${booking.figures.sessionCount} ${
                  booking.figures.sessionCount === 1 ? cash.session : cash.sessions
                }`
              : ""}
          </p>

          <Panel nested className="space-y-1 p-3">
            {figureRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[var(--muted)]">{row.label}</span>
                <span>{formatCurrency(fromRappen(row.value))}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-1 text-sm font-semibold">
              <span className={gap !== 0 ? "text-rose-200" : undefined}>{cash.figureGap}</span>
              <span className={gap !== 0 ? "text-rose-200" : undefined}>
                {formatCurrency(fromRappen(gap))}
                {gap > 0 ? ` · ${cash.gapShort}` : gap < 0 ? ` · ${cash.gapOver}` : ""}
              </span>
            </div>
          </Panel>

          <div className="space-y-1">
            <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{cash.preview}</p>
            <Panel nested className="space-y-1 p-3">
              {booking.entries.map((entry, index) => (
                <div
                  key={`${entry.kind}-${index}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-[var(--muted)]">
                    {entry.accountType === "CHARGES" ? common.charges : common.produits} ·{" "}
                    {previewLabel[entry.kind]} — {register.name}
                  </span>
                  <span className="shrink-0">{formatCurrency(fromRappen(entry.amount))}</span>
                </div>
              ))}
            </Panel>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={cash.budget}>
              <Select name="budgetId" required defaultValue="">
                <option value="" disabled>
                  {copy.journal.selectBudget}
                </option>
                {budgets.map((budget) => (
                  <option key={budget.id} value={budget.id}>
                    {budget.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={cash.costCenter}>
              <Select name="costCenterId" defaultValue="">
                <option value="">—</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={cash.date}>
            <Input type="date" name="date" defaultValue={register.closedAt ?? undefined} />
          </Field>
        </form>
      ) : null}
    </Modal>
  );
}
