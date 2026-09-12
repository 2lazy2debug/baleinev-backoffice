"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";

import { FormError } from "@/components/form-error";
import { IconButton } from "@/components/ui";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

import { updateShiftAction } from "./actions";
import ShiftFields, { type ExistingShift, useShiftOverlap } from "./shift-fields";

type Props = {
  shift: {
    id: string;
    startTime: string | null;
    endTime: string | null;
    noTime: boolean;
    role: string | null;
    capacity: number;
    assignedCount: number;
  };
  /** The day's other shifts — the one being edited never overlaps itself. */
  otherShifts: ExistingShift[];
  onDone: () => void;
  copy: {
    role: string;
    noTime: string;
    shiftOverlapWarning: string;
    save: string;
    cancel: string;
  };
};

/**
 * The shift row's labels turned into fields, the way the journal table edits an
 * entry: same five fields as the add row, prefilled, saved in place. Closing is
 * the caller's business — the row goes back to reading as a row.
 */
export default function EditShiftForm({ shift, otherShifts, onDone, copy }: Props) {
  const [noTime, setNoTime] = useState(shift.noTime);
  const [startTime, setStartTime] = useState(shift.startTime?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(shift.endTime?.slice(0, 5) ?? "");

  const hasOverlap = useShiftOverlap(noTime, startTime, endTime, otherShifts);

  async function save(previous: ActionState, formData: FormData): Promise<ActionState> {
    const result = await updateShiftAction(previous, formData);
    if (!result.error) {
      onDone();
    }
    return result;
  }

  const [state, formAction, isPending] = useActionState(save, initialActionState);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        if (hasOverlap && !window.confirm(copy.shiftOverlapWarning)) {
          event.preventDefault();
        }
      }}
    >
      <FormError message={state.error} className="w-full" />
      <input type="hidden" name="id" value={shift.id} />
      <ShiftFields
        noTime={noTime}
        onNoTimeChange={setNoTime}
        startTime={startTime}
        endTime={endTime}
        onStartTimeChange={setStartTime}
        onEndTimeChange={setEndTime}
        defaultRole={shift.role ?? ""}
        defaultCapacity={shift.capacity}
        minCapacity={Math.max(1, shift.assignedCount)}
        copy={{ role: copy.role, noTime: copy.noTime }}
      />
      <div className="flex items-center gap-2">
        <IconButton type="submit" tone="save" label={copy.save} disabled={isPending}>
          <Check />
        </IconButton>
        <IconButton type="button" tone="neutral" label={copy.cancel} onClick={onDone}>
          <X />
        </IconButton>
      </div>
    </form>
  );
}
