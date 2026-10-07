import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateTotpCode } from "./totp";

// RFC 6238 test seed ("12345678901234567890" in base32).
const SEED = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("generateTotpCode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the code and the time left at the end of a period", () => {
    vi.setSystemTime(59_000);
    const { code, msRemaining } = generateTotpCode(SEED);
    expect(code).toBe("287082");
    expect(msRemaining).toBe(1000);
  });

  it("starts a new period with a different code and a full window", () => {
    vi.setSystemTime(59_000);
    const before = generateTotpCode(SEED).code;
    vi.setSystemTime(60_000);
    const { code, msRemaining } = generateTotpCode(SEED);
    expect(msRemaining).toBe(30_000);
    expect(code).not.toBe(before);
  });
});
