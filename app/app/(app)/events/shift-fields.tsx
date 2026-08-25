"use client";

import { useMemo } from "react";

import { Input } from "@/components/ui";

export type ExistingShift = {
  startTime: string;
  endTime: string;
};

export type ShiftFieldsCopy = {
  role: string;
};

function toMinutes(value: string) {
  const [h, m] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * True once the drafted window lands on top of another shift of the same day.
 * Adding and editing ask the same question, so they ask it here — an editor
 * passes the day's other shifts, never its own row.
 */
export function useShiftOverlap(startTime: string, endTime: string, existingShifts: ExistingShift[]) {
  return useMemo(() => {
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
}

type Props = {
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  defaultRole?: string;
  defaultCapacity?: number;
  /** Editing cannot drop the capacity under the people already on the shift. */
  minCapacity?: number;
  copy: ShiftFieldsCopy;
};

/**
 * The four fields a shift is made of, in one order. The add row and the inline
 * editor both mount this, so a change to the shape of a shift is one edit.
 */
export default function ShiftFields({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  defaultRole,
  defaultCapacity = 1,
  minCapacity = 1,
  copy,
}: Props) {
  return (
    <>
      <div className="w-28">
        <Input
          type="time"
          name="startTime"
          required
          value={startTime}
          onChange={(event) => onStartTimeChange(event.target.value)}
          size="sm"
        />
      </div>
      <div className="w-28">
        <Input
          type="time"
          name="endTime"
          required
          value={endTime}
          onChange={(event) => onEndTimeChange(event.target.value)}
          size="sm"
        />
      </div>
      {/* Grows into whatever the wrapped row leaves it on a phone; fixed again at sm. */}
      <div className="min-w-0 grow sm:w-40 sm:grow-0">
        <Input type="text" name="role" required placeholder={copy.role} defaultValue={defaultRole} size="sm" />
      </div>
      <div className="w-16">
        <Input type="number" name="capacity" min={minCapacity} defaultValue={defaultCapacity} size="sm" />
      </div>
    </>
  );
}
