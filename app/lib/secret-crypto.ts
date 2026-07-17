import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Authenticated encryption for the Passwords vault. Every stored secret
// (password, TOTP seed) is sealed with AES-256-GCM using the server-only master
// key in PASSWORD_VAULT_KEY. The key never reaches the client and must never be
// logged. See docs/passwords.md for rotation.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the standard size for GCM.
const KEY_BYTES = 32; // AES-256.

export type SealedSecret = {
  cipher: string; // base64 ciphertext
  iv: string; // base64 nonce
  tag: string; // base64 GCM auth tag
};

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const raw = process.env.PASSWORD_VAULT_KEY;
  if (!raw) {
    throw new Error(
      "PASSWORD_VAULT_KEY is not set. The Passwords vault cannot operate without a master key.",
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `PASSWORD_VAULT_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). Generate one with: openssl rand -base64 32`,
    );
  }

  cachedKey = key;
  return key;
}

/** True when a valid master key is configured. Use to gate the feature gracefully. */
export function isVaultConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    cipher: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret(sealed: SealedSecret): string {
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(sealed.cipher, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
