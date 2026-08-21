import QRCode from "qrcode";

import { decryptSecret, encryptSecret, isVaultConfigured, type SealedSecret } from "@/lib/secret-crypto";
import { buildTotpUri, verifyTotpCode } from "@/lib/totp";

// Two-factor sign-in for a user account: the enrolment material handed to the
// authenticator app, and the check the login path runs against a typed code.
//
// The seed is sealed with the same AES-256-GCM master key as the Passwords
// vault (PASSWORD_VAULT_KEY) and lives in User.twoFactorCipher/Iv/Tag. It is
// unsealed server-side only, to verify a code — it never reaches the browser
// again after enrolment. See docs/auth.md.

/** What an authenticator app lists the entry under. */
export const TWO_FACTOR_ISSUER = "Baleinev";

/** The three columns on User that hold the sealed seed. */
export type TwoFactorColumns = {
  twoFactorCipher: string | null;
  twoFactorIv: string | null;
  twoFactorTag: string | null;
};

export { isVaultConfigured as isTwoFactorConfigured };

export function sealTwoFactorSecret(secret: string): SealedSecret {
  return encryptSecret(secret);
}

function unsealTwoFactorSecret(user: TwoFactorColumns): string | null {
  if (!user.twoFactorCipher || !user.twoFactorIv || !user.twoFactorTag) {
    return null;
  }

  return decryptSecret({
    cipher: user.twoFactorCipher,
    iv: user.twoFactorIv,
    tag: user.twoFactorTag,
  });
}

/**
 * True when `code` matches the seed stored on this user. A user with no seed,
 * an unreadable seed (rotated master key) or a wrong code all answer false —
 * the caller decides what that means, and never gets to see the seed itself.
 */
export function verifyUserTwoFactorCode(user: TwoFactorColumns, code: string): boolean {
  let seed: string | null;

  try {
    seed = unsealTwoFactorSecret(user);
  } catch {
    return false;
  }

  return seed ? verifyTotpCode(seed, code) : false;
}

/** Everything the enrolment screen shows: the QR to scan and the secret to type instead. */
export type TwoFactorEnrolment = {
  secret: string;
  qrDataUrl: string;
};

export async function buildTwoFactorEnrolment(email: string, secret: string): Promise<TwoFactorEnrolment> {
  const uri = buildTotpUri(TWO_FACTOR_ISSUER, email, secret);

  // Black on white regardless of the app's dark theme: a camera reads contrast,
  // not tokens, so the QR carries its own light background.
  const svg = await QRCode.toString(uri, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  return {
    secret,
    qrDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  };
}
