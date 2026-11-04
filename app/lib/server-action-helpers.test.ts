import { redirect } from "next/navigation";
import { describe, expect, it } from "vitest";

import { toActionErrorMessage } from "./server-action-helpers";

describe("toActionErrorMessage", () => {
  it("rethrows a redirect instead of showing it as a form error", () => {
    let thrown: unknown;
    try {
      redirect("/events");
    } catch (err) {
      thrown = err;
    }
    expect(() => toActionErrorMessage(thrown)).toThrow();
    try {
      toActionErrorMessage(thrown);
    } catch (err) {
      expect(err).toBe(thrown);
    }
  });

  it("returns an Error's message", () => {
    expect(toActionErrorMessage(new Error("Boom."))).toBe("Boom.");
  });

  it("falls back for a non-Error", () => {
    expect(toActionErrorMessage("nope")).toBe("Something went wrong. Please try again.");
  });
});
