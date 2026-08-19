"use client";

import { useActionState, useMemo, useState } from "react";

import { FormError } from "@/components/form-error";
import { Button, Input } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import { addShiftAction } from "./actions";

type ExistingShift = {
  startTime: string;
  endTime: string;
};

type Props = {
  eventDayId: string;
  existingShifts: ExistingShift[];
  copy: {
    role: string;
    addShift: string;
    shiftOverlapWarning: string;
  };
};

function toMinutes(value: string) {
  const [h, m] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export default function AddShiftForm({ eventDayId, existingShifts, copy }: Props) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [state, formAction, isPending] = useActionState(addShiftAction, initialActionState);

  const hasOverlap = useMemo(() => {
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start == null || end == null || end <= start) return false;

    return existingShifts.some((shift) => {
      const s = toMinutes(shift.startTime);
      const e = toMinutes(shift.endTime);
      if (s == null || e == null || e <= s) return false;
      return start < e && s < end;
    });
  }, [endTime, existingShifts, startTime]);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 pt-1"
      onSubmit={(event) => {
        if (hasOverlap && !window.confirm(copy.shiftOverlapWarning)) {
          event.preventDefault();
        }
      }}
    >
      <FormError message={state.error} className="w-full" />
      <input type="hidden" name="eventDayId" value={eventDayId} />
      <div className="w-28">
        <Input
          type="time"
          name="startTime"
          required
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          size="sm"
        />
      </div>
      <div className="w-28">
        <Input
          type="time"
          name="endTime"
          required
          value={endTime}
          onChange={(event) => setEndTime(event.target.value)}
          size="sm"
        />
      </div>
      <div className="w-40">
        <Input type="text" name="role" required placeholder={copy.role} size="sm" />
      </div>
      <div className="w-16">
        <Input type="number" name="capacity" min="1" defaultValue="1" size="sm" />
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={isPending}>
        {copy.addShift}
      </Button>
    </form>
  );
}
