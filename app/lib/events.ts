/**
 * An event is expired once its last shift has finished — derived on every
 * read, never stored, so there is no cron to keep a flag honest.
 *
 * All of this compares in UTC: `EventDay.date` is `@db.Date`, so building the
 * instant from its UTC year/month/date (rather than a local-time read) is
 * what keeps the app's timezone-agnostic day-stamps meaningful. See
 * `lib/stock.ts:46` for the same convention on the read side.
 */

export type ShiftForExpiry = {
  startTime: string | null;
  endTime: string | null;
  noTime: boolean;
};

export type EventDayForExpiry = {
  date: Date;
  isOff: boolean;
  shifts: ShiftForExpiry[];
};

export type EventForExpiry = {
  endDate: Date;
  days: EventDayForExpiry[];
};

function endOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999);
}

/**
 * A timeless shift ("renfort", "surplus") has no hours to end at, so it holds
 * the day open until midnight rather than pretending to a specific instant.
 */
function shiftEndsAt(day: EventDayForExpiry, shift: ShiftForExpiry): number {
  if (shift.noTime || !shift.startTime || !shift.endTime) {
    return endOfUtcDay(day.date);
  }

  const [startHour, startMinute] = shift.startTime.split(":").map(Number);
  const [endHour, endMinute] = shift.endTime.split(":").map(Number);
  // endTime <= startTime means the shift crosses midnight into the next day.
  const crossesMidnight = endHour < startHour || (endHour === startHour && endMinute <= startMinute);

  return Date.UTC(
    day.date.getUTCFullYear(),
    day.date.getUTCMonth(),
    day.date.getUTCDate() + (crossesMidnight ? 1 : 0),
    endHour,
    endMinute,
  );
}

/** The instant the event's last shift finishes — or end of `endDate` for an event with no shifts. */
export function eventEndsAt(event: EventForExpiry): Date {
  const instants: number[] = [];

  for (const day of event.days) {
    if (day.isOff) continue;
    for (const shift of day.shifts) {
      instants.push(shiftEndsAt(day, shift));
    }
  }

  if (instants.length === 0) {
    return new Date(endOfUtcDay(event.endDate));
  }

  return new Date(Math.max(...instants));
}

export function isEventExpired(event: EventForExpiry, now: Date = new Date()): boolean {
  return eventEndsAt(event).getTime() < now.getTime();
}
