"use client";

import { useMemo, useState } from "react";

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
      action={addShiftAction}
      className="flex flex-wrap items-end gap-2 pt-1"
      onSubmit={(event) => {
        if (hasOverlap && !window.confirm(copy.shiftOverlapWarning)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="eventDayId" value={eventDayId} />
      <input
        type="time"
        name="startTime"
        required
        value={startTime}
        onChange={(event) => setStartTime(event.target.value)}
        className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
      />
      <input
        type="time"
        name="endTime"
        required
        value={endTime}
        onChange={(event) => setEndTime(event.target.value)}
        className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
      />
      <input
        type="text"
        name="role"
        required
        placeholder={copy.role}
        className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
      />
      <input
        type="number"
        name="capacity"
        min="1"
        defaultValue="1"
        className="w-16 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
      />
      <button className="rounded-full border border-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10">
        {copy.addShift}
      </button>
    </form>
  );
}
