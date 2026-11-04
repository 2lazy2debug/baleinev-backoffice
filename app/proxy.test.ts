import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getToken = vi.fn();

vi.mock("next-auth/jwt", () => ({ getToken: (...a: unknown[]) => getToken(...a) }));

const { proxy } = await import("./proxy");

type Outcome = "next" | "401" | string;

async function run(path: string) {
  return proxy(new NextRequest(new URL(path, "http://localhost")));
}

beforeEach(() => {
  vi.clearAllMocks();
});

const guestCases: [string, Outcome][] = [
  ["/events", "next"],
  ["/events/settings", "/events"],
  ["/events/logs", "/events"],
  ["/", "/events"],
  ["/tasks", "/events"],
  ["/account", "/events"],
  ["/users", "/events"],
  ["/api/events/evt_1/pdf", "next"],
  ["/api/events/evt_1/pdf/extra", "401"],
  ["/api/preferences/theme", "next"],
  ["/api/preferences/edition", "401"],
  ["/api/cities", "401"],
];

describe("proxy as GUEST", () => {
  it.each(guestCases)("%s → %s", async (path, expected) => {
    getToken.mockResolvedValue({ role: "GUEST" });
    const res = await run(path);

    if (expected === "next") {
      expect(res.headers.get("x-middleware-next")).toBe("1");
    } else if (expected === "401") {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ ok: false, error: "Not allowed" });
    } else {
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost" + expected);
    }
  });

  it("/login is exempt before the token is read", async () => {
    const res = await run("/login");
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(getToken).not.toHaveBeenCalled();
  });
});

describe("proxy for the other roles", () => {
  it("sends a signed-out visitor to /login", async () => {
    getToken.mockResolvedValue(null);
    const res = await run("/events");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("keeps DEPARTMENT out of /users", async () => {
    getToken.mockResolvedValue({ role: "DEPARTMENT", departmentNames: [] });
    const res = await run("/users");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/budget");
  });

  it("lets DEPARTMENT into /events/settings", async () => {
    getToken.mockResolvedValue({ role: "DEPARTMENT", departmentNames: [] });
    const res = await run("/events/settings");
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets ADMIN into /users", async () => {
    getToken.mockResolvedValue({ role: "ADMIN" });
    const res = await run("/users");
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
