import * as OTPAuth from "otpauth";

// Turns a stored 2FA seed into a live 6-digit code. The seed is either a raw
// base32 secret or a full otpauth:// URI (what most authenticator QR codes
// encode). Kept server-side only — codes are generated on demand, never stored.

export type TotpCode = {
  code: string;
  /** Seconds until the current code expires. */
  secondsRemaining: number;
  /** Length of the rotation window in seconds (usually 30). */
  period: number;
};

function buildTotp(seed: string): OTPAuth.TOTP {
  const trimmed = seed.trim();

  if (trimmed.toLowerCase().startsWith("otpauth://")) {
    const parsed = OTPAuth.URI.parse(trimmed);
    if (parsed instanceof OTPAuth.TOTP) {
      return parsed;
    }
    throw new Error("Only TOTP 2FA is supported.");
  }

  // Bare secret: strip spaces (authenticator apps display them grouped).
  const secret = OTPAuth.Secret.fromBase32(trimmed.replace(/\s+/g, "").toUpperCase());
  return new OTPAuth.TOTP({ secret });
}

/**
 * A fresh 160-bit base32 secret, the size every authenticator app expects.
 * Only ever handed to the user once, while they are enrolling.
 */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/**
 * The `otpauth://` URI an authenticator app scans. `label` is what the app
 * lists the entry under, so it carries the account it belongs to.
 */
export function buildTotpUri(issuer: string, label: string, secret: string): string {
  return new OTPAuth.TOTP({
    issuer,
    label,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).toString();
}

/**
 * True when `code` is the code this seed produces right now. The one-step window
 * accepts the neighbouring 30s slots, which is what makes a phone whose clock
 * drifts by a few seconds still able to sign in.
 */
export function verifyTotpCode(seed: string, code: string): boolean {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) {
    return false;
  }

  try {
    return buildTotp(seed).validate({ token, window: 1 }) !== null;
  } catch {
    return false;
  }
}

/** Validate a 2FA seed without exposing a code. Throws if it can't be parsed. */
export function assertValidTotpSeed(seed: string): void {
  const totp = buildTotp(seed);
  totp.generate();
}

export function generateTotpCode(seed: string): TotpCode {
  const totp = buildTotp(seed);
  const period = totp.period;
  const nowSeconds = Date.now() / 1000;
  const secondsRemaining = Math.max(1, Math.ceil(period - (nowSeconds % period)));

  return {
    code: totp.generate(),
    secondsRemaining,
    period,
  };
}
