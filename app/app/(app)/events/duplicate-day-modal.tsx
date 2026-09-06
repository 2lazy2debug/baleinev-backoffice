"use client";

import { useActionState, useState } from "react";
import { Copy } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Button, Checkbox, IconButton, Modal } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import { duplicateEventDayShiftsAction } from "./actions";

type CandidateDay = {
  id: string;
  date: Date | string;
  isOff: boolean;
  shiftCount: number;
};

type Props = {
  sourceDayId: string;
  sourceDate: Date | string;
  sourceShiftCount: number;
  days: CandidateDay[];
  copy: {
    duplicateDay: string;
    duplicateDayTitle: string;
    duplicateDayDescription: string;
    duplicateDayEmpty: string;
    duplicateDayHasShifts: string;
    cancel: string;
  };
};

function formatDate(d: Date | string) {
  return new Date(d).toISOString().slice(0, 10);
}

export default function DuplicateDayModal({
  sourceDayId,
  sourceDate,
  sourceShiftCount,
  days,
  copy,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [state, formAction, isPending] = useActionState(duplicateEventDayShiftsAction, initialActionState);
  const markSubmitted = useCloseOnSuccess(state, isPending, () => {
    setOpen(false);
    setSelected(new Set());
  });

  const candidates = days.filter((day) => day.id !== sourceDayId && !day.isOff);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <>
      <IconButton
        size="sm"
        tone="neutral"
        label={copy.duplicateDay}
        onClick={() => setOpen(true)}
      >
        <Copy />
      </IconButton>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.duplicateDayTitle}
        size="md"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            {candidates.length > 0 ? (
              <Button
                type="submit"
                form="duplicate-day-form"
                variant="primary"
                disabled={isPending || selected.size === 0}
              >
                {copy.duplicateDay}
              </Button>
            ) : null}
          </>
        }
      >
        <form id="duplicate-day-form" action={formAction} onSubmit={markSubmitted} className="space-y-3">
          <FormError message={state.error} />
          <input type="hidden" name="sourceDayId" value={sourceDayId} />
          <p className="text-sm text-[var(--muted)]">
            {copy.duplicateDayDescription.replace("{count}", String(sourceShiftCount)).replace("{date}", formatDate(sourceDate))}
          </p>

          {candidates.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{copy.duplicateDayEmpty}</p>
          ) : (
            <div className="space-y-1">
              {candidates.map((day) => (
                <label
                  key={day.id}
                  className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
                >
                  <Checkbox
                    name="targetDayIds"
                    value={day.id}
                    checked={selected.has(day.id)}
                    onChange={() => toggle(day.id)}
                  />
                  <span className="font-medium text-[var(--ink)]">{formatDate(day.date)}</span>
                  {day.shiftCount > 0 ? (
                    <span className="text-xs text-[var(--muted)]">{copy.duplicateDayHasShifts}</span>
                  ) : null}
                </label>
              ))}
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}
