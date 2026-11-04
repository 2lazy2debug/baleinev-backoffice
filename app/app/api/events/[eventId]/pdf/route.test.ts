import { beforeEach, describe, expect, it, vi } from "vitest";

// The schedule PDF route: a guest reaches only what /events lists for them
// (default edition, not over). Puppeteer is mocked to fail on launch — the
// tests only care whether the route got past the guard.
const launch = vi.fn();
const getCurrentUserAccess = vi.fn();
const resolveEditionIdOrNull = vi.fn();
const findUnique = vi.fn();

vi.mock("puppeteer", () => ({ default: { launch: (...a: unknown[]) => launch(...a) } }));
vi.mock("@/lib/access", () => ({
  getCurrentUserAccess: (...a: unknown[]) => getCurrentUserAccess(...a),
}));
vi.mock("@/lib/db", () => ({ prisma: { event: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("@/lib/edition-context", () => ({
  resolveEditionIdOrNull: (...a: unknown[]) => resolveEditionIdOrNull(...a),
}));
vi.mock("@/lib/i18n", () => ({
  getLocale: async () => "en",
  getDictionary: () => ({ events: {} }),
}));
vi.mock("@/lib/shift-schedule-pdf", () => ({
  renderShiftSchedulePdf: () => ({ html: "", footerHtml: "" }),
}));

const { GET } = await import("./route");

function eventFixture(date: Date, overrides: Record<string, unknown> = {}) {
  return {
    name: "Spring Fest",
    editionId: "ed_default",
    endDate: date,
    days: [
      {
        id: "day_1",
        date,
        isOff: false,
        shifts: [
          { id: "shift_1", startTime: "18:00", endTime: "22:00", noTime: false, role: "Bar", capacity: 2, assignments: [] },
        ],
      },
    ],
    ...overrides,
  };
}

const FUTURE = new Date("2099-04-12T00:00:00.000Z");
const PAST = new Date("2020-04-12T00:00:00.000Z");

function call() {
  return GET(new Request("http://localhost/api/events/event_1/pdf"), {
    params: Promise.resolve({ eventId: "event_1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  launch.mockRejectedValue(new Error("no browser"));
  resolveEditionIdOrNull.mockResolvedValue("ed_default");
  getCurrentUserAccess.mockResolvedValue({ id: "guest_1", userName: "Gail", role: "GUEST" });
  findUnique.mockResolvedValue(eventFixture(FUTURE));
});

describe("GET /api/events/[eventId]/pdf", () => {
  it("guest: event of another edition is not found", async () => {
    findUnique.mockResolvedValue(eventFixture(FUTURE, { editionId: "ed_old" }));

    const res = await call();

    expect(res.status).toBe(404);
    expect(launch).not.toHaveBeenCalled();
  });

  it("guest: expired event is not found", async () => {
    findUnique.mockResolvedValue(eventFixture(PAST));

    const res = await call();

    expect(res.status).toBe(404);
    expect(launch).not.toHaveBeenCalled();
  });

  it("guest: open event of the default edition renders", async () => {
    const res = await call();

    expect(launch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(400); // the mocked launch failure
  });

  it("member: no edition filter", async () => {
    getCurrentUserAccess.mockResolvedValue({ id: "user_1", userName: "Alex", role: "DEPARTMENT" });
    findUnique.mockResolvedValue(eventFixture(FUTURE, { editionId: "ed_old" }));

    await call();

    expect(launch).toHaveBeenCalledTimes(1);
    expect(resolveEditionIdOrNull).not.toHaveBeenCalled();
  });
});
