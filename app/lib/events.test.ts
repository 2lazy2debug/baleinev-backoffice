import { describe, expect, it } from "vitest";

import { eventEndsAt, isEventExpired } from "./events";

function day(dateIso: string, shifts: { startTime: string | null; endTime: string | null; noTime: boolean }[], isOff = false) {
  return { date: new Date(dateIso), isOff, shifts };
}

function shift(startTime: string, endTime: string) {
  return { startTime, endTime, noTime: false };
}

describe("eventEndsAt", () => {
  it("ends at the last shift's end time on its day", () => {
    const event = {
      endDate: new Date("2026-05-10T00:00:00.000Z"),
      days: [day("2026-05-10", [shift("09:00", "17:00"), shift("10:00", "22:00")])],
    };

    expect(eventEndsAt(event)).toEqual(new Date("2026-05-10T22:00:00.000Z"));
  });

  it("rolls a midnight-crossing shift into the next UTC day", () => {
    const event = {
      endDate: new Date("2026-05-10T00:00:00.000Z"),
      days: [day("2026-05-10", [shift("22:00", "02:00")])],
    };

    expect(eventEndsAt(event)).toEqual(new Date("2026-05-11T02:00:00.000Z"));
  });

  it("holds a timeless shift open until end of its day", () => {
    const event = {
      endDate: new Date("2026-05-10T00:00:00.000Z"),
      days: [day("2026-05-10", [{ startTime: null, endTime: null, noTime: true }])],
    };

    expect(eventEndsAt(event)).toEqual(new Date("2026-05-10T23:59:59.999Z"));
  });

  it("falls back to end of endDate when the event has no shifts at all", () => {
    const event = {
      endDate: new Date("2026-05-12T00:00:00.000Z"),
      days: [day("2026-05-10", []), day("2026-05-11", [])],
    };

    expect(eventEndsAt(event)).toEqual(new Date("2026-05-12T23:59:59.999Z"));
  });

  it("falls back to endDate when the only day with shifts is off", () => {
    const event = {
      endDate: new Date("2026-05-11T00:00:00.000Z"),
      days: [day("2026-05-10", [shift("09:00", "17:00")], true), day("2026-05-11", [])],
    };

    expect(eventEndsAt(event)).toEqual(new Date("2026-05-11T23:59:59.999Z"));
  });
});

describe("isEventExpired", () => {
  const event = {
    endDate: new Date("2026-05-10T00:00:00.000Z"),
    days: [day("2026-05-10", [shift("09:00", "17:00")])],
  };

  it("is expired once now is after the end", () => {
    expect(isEventExpired(event, new Date("2026-05-10T17:00:01.000Z"))).toBe(true);
  });

  it("is not expired while now is before the end", () => {
    expect(isEventExpired(event, new Date("2026-05-10T16:59:59.000Z"))).toBe(false);
  });
});
