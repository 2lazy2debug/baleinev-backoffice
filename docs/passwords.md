# Passwords — Shared Password Manager

A department-scoped, shared credential store (the **Passwords** tab). Entries hold
a name, an email/login, a password, an optional 2FA (TOTP) secret, and a website
link. Passwords and 2FA seeds are **encrypted at rest**; everything else is stored
in plaintext so the database can filter by department without decrypting.

---

## Visibility Model

Visibility is keyed on `Department` (what users are actually members of), as a
many-to-many relation on `PasswordEntry`.

```
Admin                → sees every entry
Department user      → sees an entry iff they share ≥1 department with it
```

Create / edit / delete follow the same rule, with one extra guard on writes:

- A department user can only **share** an entry with departments they belong to.
- On edit, any department a non-admin can't see (an entry shared with a foreign
  department) is **preserved**, never silently dropped.
- Admins have full control over an entry's department set.

Enforced in `lib/access.ts` (`isAdmin`, `accessibleDepartmentIds`,
`canAccessDepartments`) and re-checked inside every server action.

---

## Encryption

Secrets are sealed with **AES-256-GCM** (authenticated encryption) — see
[`lib/secret-crypto.ts`](../app/lib/secret-crypto.ts).

```
plaintext ──encryptSecret()──▶ { cipher, iv, tag }   (all base64, stored as columns)
                                    │
                          random 96-bit IV per value
                          GCM auth tag verifies integrity on read
                                    │
{ cipher, iv, tag } ──decryptSecret()──▶ plaintext   (server-side only)
```

- The master key comes from **`PASSWORD_VAULT_KEY`** (32 bytes, base64). It is
  server-only, never bundled to the client, and never logged.
- If the key is missing/invalid the tab renders a "vault not configured" notice
  instead of failing — `isVaultConfigured()` gates it.
- Generate a key with: `openssl rand -base64 32`.

The 2FA seed is treated as a secret and encrypted the same way. Live 6-digit codes
are generated on demand server-side via [`lib/totp.ts`](../app/lib/totp.ts)
(`otpauth`), never stored.

---

## Reveal Flow

Secrets are **never** included in the page payload. The list only carries
metadata (name, login, website, a `has2fa` flag). Plaintext is fetched on demand:

```
Card "reveal" / "show 2FA" click
        │
        ▼
revealPasswordAction(entryId)  /  getTotpCodeAction(entryId)   ← server actions
  1. getCurrentUserAccess()          (who am I)
  2. requireEntryAccess()            (do I share a department with this entry?)
  3. decryptSecret(...)              (server-side)
  4. return plaintext / current TOTP code
        │
        ▼
Client shows the value (and a copy button); nothing is persisted client-side
```

Create/edit/delete use the standard `useActionState` + `FormData` server-action
pattern, consistent with the rest of the app.

---

## Files

| Path | Role |
|---|---|
| `app/app/(app)/passwords/page.tsx` | Server component: loads visible entries (no ciphertext to client), assignable departments |
| `app/app/(app)/passwords/client.tsx` | Cards + create/edit/delete modals, reveal & 2FA on demand |
| `app/app/(app)/passwords/actions.ts` | `create` / `update` / `delete` / `revealPassword` / `getTotpCode`, all authorization-checked |
| `app/lib/secret-crypto.ts` | AES-256-GCM seal/open, key loading |
| `app/lib/totp.ts` | TOTP code generation from a stored seed |
| `app/lib/access.ts` | Department authorization helpers |

---

## Key Rotation

`PASSWORD_VAULT_KEY` encrypts every stored secret. **Changing it makes all existing
entries undecryptable.** To rotate safely: decrypt every entry with the old key,
re-encrypt with the new key, and persist — then swap the env var. There is no
migration script for this yet; rotate deliberately.

**The key is not only this vault's.** Account two-factor seeds (`User.twoFactorCipher/Iv/Tag`)
are sealed with the same key, so a rotation also locks every enrolled user out of their second
factor — their accounts need `twoFactorEnabled` cleared in the database before they can sign in
again. Re-encrypt those rows in the same pass, or clear them. See [auth.md](auth.md).
