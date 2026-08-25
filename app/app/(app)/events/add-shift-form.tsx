"use client";

import { useActionState, useState } from "react";

import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui";
import { initialActionState } from "@/lib/server-action-helpers";

import { addShiftAction } from "./actions";
import ShiftFields, { type ExistingShift, useShiftOverlap } from "./shift-fields";

type Props = {
  eventDayId: string;
  existingShifts: ExistingShift[];
  copy: {
    role: string;
    addShift: string;
    shiftOverlapWarning: string;
  };
};

export default function AddShiftForm({ eventDayId, existingShifts, copy }: Props) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [state, formAction, isPending] = useActionState(addShiftAction, initialActionState);

  const hasOverlap = useShiftOverlap(startTime, endTime, existingShifts);

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
      <ShiftFields
        startTime={startTime}
        endTime={endTime}
        onStartTimeChange={setStartTime}
        onEndTimeChange={setEndTime}
        copy={{ role: copy.role }}
      />
      <Button type="submit" variant="primary" size="sm" disabled={isPending}>
        {copy.addShift}
      </Button>
    </form>
  );
}
