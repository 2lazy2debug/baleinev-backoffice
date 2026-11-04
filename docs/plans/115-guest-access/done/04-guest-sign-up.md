# Step 4 — Guest sign-up

## Goal

A signed-out visitor on `/login` chooses **Sign in** or **Enter as guest**. "Enter as guest" asks
for name, email and password, creates a GUEST account and signs them straight in to `/events`.

## Scope

- `app/(auth)/login/login-form.tsx > LoginForm`: two choices on the card — the existing sign-in
  form, and a guest form. Shape (tabs via `<SegmentedControl>` vs a link that swaps the form) is
  a design decision; reuse `Field`/`Input`/`Button`/`Alert`, no hand-rolled controls.
- New server action `app/(auth)/login/actions.ts > registerGuestAction(prev, formData)`:
  - fields: `name`, `email` (trimmed — README > Invariants), `password` (≥ `MIN_PASSWORD_LENGTH`);
  - email already in use → error "This email already has an account. Sign in instead." (accepted:
    reveals that the address exists);
  - creates `User { role: GUEST }`, bcrypt hash at the cost `users/actions.ts > createUserAction`
    uses; no departments, no edition;
  - returns `{ error: null }`; the client then calls `signIn("credentials", …)` with the same
    email/password and follows the Step 1 redirect.
- `app/(auth)/login/page.tsx`: pass the new copy.
- i18n: `login` block, en and fr (guest choice label, name field, errors).
- Docs: `docs/auth.md` > Login Flow — the guest branch; replace "There is no self-service signup".

## Out of scope

Rate limiting, captcha, email verification (README > Out of scope).

## Tests (`app/(auth)/login/actions.test.ts`)

- Valid input → `user.create` with role GUEST, trimmed email, hashed password (never plaintext).
- Missing name / email / password → error, no create.
- Password of 7 chars → error, no create.
- Existing email → error, no create.
- Unique-constraint race (`P2002` from create) → same "already has an account" error.

## Manual pass

1. Signed out, `/login` → choose guest, register `newguest@test.local` / 8+ chars → lands on
   `/events` with the guest shell.
2. Sign out, sign in with those credentials via "Sign in" → `/events`.
3. Register again with the same email → error, stays on the form.
4. Register with an admin's email → same error; the admin account is untouched.
5. `verifier`: curl smoke test (memory: quality gates > curl-login) of register → sign in → GET
   `/events` 200, GET `/tasks` redirected.

## Code map

- `app/(auth)/login/login-form.tsx > LoginForm`
- `app/(auth)/login/page.tsx > LoginPage`
- `app/(app)/account/actions.ts > MIN_PASSWORD_LENGTH` (module-private `const` today — move it to
  `lib/` and import it from both)
- `app/(app)/users/actions.ts > createUserAction` (hash cost, create shape)
- `lib/server-action-helpers.ts` (`getRequiredString`, `toActionErrorMessage`)
- `lib/auth.ts > authOptions` (`authorize`)
- `lib/i18n-dictionaries.ts` (`login` block, en and fr)
- `components/ui > SegmentedControl`, `Field`, `Input`, `Button`, `Alert`
- `proxy.ts > proxy` (`/login` exemption — server action POSTs land there)

## Design

Paths relative to `app/`. One commit: `feat(auth): guest sign-up (plan 115 Step 4)`.

### Deviations from the spec (Design wins)

| Spec | Design | Why |
|---|---|---|
| `registerGuestAction(prev, formData)` returning `{ error: string \| null }` | `registerGuestAction(formData)` returning `{ error: RegisterGuestError \| null }`, an error **code** the client maps to copy | The client calls it from a handler, not `useActionState`, so `prev` is dead. Codes keep the errors in the i18n `login` block (fr included) instead of English strings from the server |
| Duplicate email detected by the unique constraint only (`P2002`) | Case-insensitive pre-check `findFirst({ email: { equals, mode: "insensitive" } })` **plus** the `P2002` catch for the race | `createUserAction` stores members' emails lowercased and Postgres `@unique` is case-sensitive: `Admin@x` would otherwise create a second account next to `admin@x` (manual pass 4) |
| Email trimmed | Trimmed, stored as typed (not lowercased) | README > Invariants — `authorize` looks up the trimmed input exactly |

No migration. No change to `proxy.ts` (`/login` is exempt; the action POSTs to `/login`), `lib/auth.ts` or `lib/access.ts`.

### 1. `lib/passwords.ts` (new)

```ts
/** The shortest password the app accepts — server checks and every client `minLength` read this. */
export const MIN_PASSWORD_LENGTH = 8;
```

- `app/(app)/account/actions.ts`: delete lines 19–20 (comment + `const`), add
  `import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";`. Lines 76–77 unchanged.
- `app/(app)/account/client.tsx`: lines 182 and 192 `minLength={8}` → `minLength={MIN_PASSWORD_LENGTH}`, same import.

### 2. `app/(auth)/login/actions.ts` (new)

```ts
"use server";

import { hash } from "bcrypt";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";

type RegisterGuestError = "missingFields" | "passwordTooShort" | "emailTaken" | "failed";

/**
 * Self-service sign-up from /login: creates a GUEST and nothing else (no
 * departments, no edition — a guest's edition is resolved per request). The
 * client signs in with the same credentials once this returns no error.
 */
export async function registerGuestAction(formData: FormData): Promise<{ error: RegisterGuestError | null }> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? ""); // never trimmed — authorize() compares it as typed

  if (!name || !email || !password) return { error: "missingFields" };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: "passwordTooShort" };

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { error: "emailTaken" };

  try {
    await prisma.user.create({
      data: { name, email, passwordHash: await hash(password, 12), role: "GUEST" },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "emailTaken" };
    }
    return { error: "failed" };
  }

  return { error: null };
}
```

- Order is fixed: parse → missing → length → pre-check → create. No transaction (one write).
- No server-side email format check (the input is `type="email"`); no `revalidatePath`; no `ensureUserEdition` (`authorize` calls it on the sign-in that follows).
- `RegisterGuestError` is **not exported** (a `"use server"` file exports async functions only). The client derives it.
- Cost `12` matches `users/actions.ts > createUserAction`.

| Input | Before | After |
|---|---|---|
| name `"  "`, any email/password | — | `{ error: "missingFields" }`, no query |
| password 7 chars | — | `{ error: "passwordTooShort" }`, no query |
| email `ADMIN@…` where `admin@…` exists | — | `{ error: "emailTaken" }`, no create |
| create throws `P2002` | — | `{ error: "emailTaken" }` |
| create throws anything else | — | `{ error: "failed" }` |
| valid | — | `User { name, email (trimmed), passwordHash, role: GUEST }`, `{ error: null }` |

### 3. `app/(auth)/login/landing.ts` (new) — the Step 1 redirect, shared

Move `login-form.tsx` lines 66–70 (comment included) into:

```ts
import { getSession } from "next-auth/react";

export async function goToLandingPage() {
  // <the moved comment, unchanged>
  const session = await getSession();
  const role = session?.user?.role;
  window.location.href = role === "DEPARTMENT" || role === "GUEST" ? "/events" : "/";
}
```

`login-form.tsx` line 66–70 becomes `await goToLandingPage();`; drop `getSession` from its `next-auth/react` import.

### 4. `app/(auth)/login/login-form.tsx` — the two choices

- `type LoginCopy` → `export type LoginCopy`, add the 10 new keys of §6 (all `string`).
- Add `import { useState } …` (already), `SegmentedControl` to the `@/components/ui` import, `import { GuestForm } from "./guest-form";`, `import { goToLandingPage } from "./landing";`.
- New state: `const [mode, setMode] = useState<"signIn" | "guest">("signIn");`
- Card body (inside `<div className="space-y-5">`, after the logo block at line 92):

```tsx
{pendingCredentials ? null : (
  <SegmentedControl
    options={[
      { value: "signIn", label: copy.signInChoice },
      { value: "guest", label: copy.guestChoice },
    ]}
    value={mode}
    onChange={(next) => {
      setMode(next);
      setError(null);
    }}
  />
)}

{mode === "guest" ? <GuestForm copy={copy} /> : (
  <form action={handleSubmit} …>  {/* existing form, lines 94–130 unchanged */}
)}
```

- The control sits **outside** both forms (it renders `<Button>`s; `type` defaults to `"button"`, but keep it out of the form anyway). It is hidden during the 2FA step, which is sign-in only. Default `size` (`md`).
- Switching mode unmounts the other form, so the guest form's own error/pending state resets with it.

### 5. `app/(auth)/login/guest-form.tsx` (new, `"use client"`)

```tsx
export function GuestForm({ copy }: { copy: LoginCopy }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const { error: code } = await registerGuestAction(formData);
    if (code) {
      setPending(false);
      setError(messages[code]);
      return;
    }

    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      redirect: false,
    });
    if (!result || result.error) {
      setPending(false);
      setError(copy.guestSignInFailed);
      return;
    }

    await goToLandingPage();
  }
  …
}
```

- `messages`: `const messages: Record<NonNullable<Awaited<ReturnType<typeof registerGuestAction>>["error"]>, string>` =
  `missingFields → copy.guestMissingFields`, `passwordTooShort → copy.passwordTooShort.replace("{min}", String(MIN_PASSWORD_LENGTH))`,
  `emailTaken → copy.emailTaken`, `failed → copy.registerFailed`. Declared inside the component.
- The form uses `onSubmit={(event) => { event.preventDefault(); void handleSubmit(new FormData(event.currentTarget)); }}`,
  **not** `action=` — React 19 resets an `action` form after it runs, which would wipe name and email on "email taken" (manual pass 3).
  `className="space-y-5 pt-1"` like the sign-in form.
- Fields, in order, each `<Field required label=…>` + `<Input … required />`:
  `name` (`copy.name`, `autoComplete="name"`), `email` (`copy.email`, `type="email"`, `autoComplete="email"`),
  `password` (`copy.password`, `type="password"`, `autoComplete="new-password"`, `minLength={MIN_PASSWORD_LENGTH}`).
- Then `{error ? <Alert>{error}</Alert> : null}` and
  `<Button type="submit" variant="primary" disabled={pending} className="w-full">{pending ? copy.creatingAccount : copy.guestSubmit}</Button>`.
- Imports: `useState`; `signIn` from `next-auth/react`; `Alert, Button, Field, Input` from `@/components/ui`;
  `MIN_PASSWORD_LENGTH` from `@/lib/passwords`; `registerGuestAction` from `./actions`; `goToLandingPage` from `./landing`;
  `import type { LoginCopy } from "./login-form"` (type-only: no runtime cycle).

`page.tsx` needs no change: it passes the whole `login` block.

### 6. i18n — `lib/i18n-dictionaries.ts`, `login` block (en line 67–77, fr line 1152–1162)

Append after `submit`, same order in both:

| Key | en | fr |
|---|---|---|
| `signInChoice` | Sign in | Se connecter |
| `guestChoice` | Enter as guest | Entrer comme invité |
| `name` | Name | Nom |
| `guestSubmit` | Create guest account | Créer un compte invité |
| `creatingAccount` | Creating account... | Création du compte... |
| `guestMissingFields` | Fill in your name, email and password. | Indiquez votre nom, votre email et un mot de passe. |
| `passwordTooShort` | Use at least {min} characters for the password. | Le mot de passe doit contenir au moins {min} caractères. |
| `emailTaken` | This email already has an account. Sign in instead. | Cet email a déjà un compte. Connectez-vous plutôt. |
| `registerFailed` | Could not create the account. Try again. | Impossible de créer le compte. Réessayez. |
| `guestSignInFailed` | Your account was created. Sign in with your email and password. | Votre compte a été créé. Connectez-vous avec votre email et votre mot de passe. |

### 7. Tests — `app/(auth)/login/actions.test.ts` (new, 11 tests)

Mocks, before `await import("./actions")`:
- `vi.mock("@/lib/db", () => ({ prisma }))` with `prisma = { user: { findFirst: vi.fn(), create: vi.fn() } }`.
- `vi.mock("bcrypt", () => ({ hash: vi.fn(async (pw: string, cost: number) => \`hashed:${cost}:${pw}\`) }))`.
- `beforeEach`: `vi.clearAllMocks()`; `findFirst.mockResolvedValue(null)`; `create.mockResolvedValue({ id: "u1" })`.
- `form(overrides)` helper as in `articles/actions.test.ts`, defaults `name: "Guest One"`, `email: "  guest@test.local  "`, `password: "longenough"`.
- P2002: `new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" })`, `Prisma` imported from the real `@prisma/client`.

| # | Case | Expected |
|---|---|---|
| 1 | defaults | `{ error: null }`; `create` called once with `data` **equal** to `{ name: "Guest One", email: "guest@test.local", passwordHash: "hashed:12:longenough", role: "GUEST" }` (no `departments` key); `passwordHash !== "longenough"` |
| 2 | password `"  spaced pass  "` | `create` data `passwordHash` is `"hashed:12:  spaced pass  "` |
| 3–6 | `it.each`: name `""`, name `"   "`, email `""`, password `""` | `{ error: "missingFields" }`; `findFirst` and `create` not called |
| 7 | password `"1234567"` | `{ error: "passwordTooShort" }`; `create` not called |
| 8 | password `"12345678"` | `{ error: null }`; `create` called once |
| 9 | `findFirst` resolves `{ id: "admin" }` | `{ error: "emailTaken" }`; `create` not called; `findFirst` called with `{ where: { email: { equals: "guest@test.local", mode: "insensitive" } }, select: { id: true } }` |
| 10 | `create` rejects the P2002 error | `{ error: "emailTaken" }` |
| 11 | `create` rejects `new Error("db down")` | `{ error: "failed" }` |

### 8. Docs — `docs/auth.md`

- New `### Guest sign-up` right before `### Session object shape` (line 40): "Enter as guest" on `/login` →
  `app/(auth)/login/actions.ts > registerGuestAction` (name/email/password, min `lib/passwords.ts > MIN_PASSWORD_LENGTH`,
  email trimmed and stored as typed, case-insensitive duplicate check + `P2002` → "already has an account", bcrypt 12,
  `role: GUEST`, no departments, no edition, no approval) → the client calls `signIn("credentials")` with the same
  credentials → the normal redirect (GUEST → `/events`). Returning guests use "Sign in". No rate limit or captcha.
- Line 230: replace "There is no self-service signup — all accounts are created by an admin." with
  "Admins create members from `/users`; guests register themselves from `/login` (see Login Flow > Guest sign-up)."

### Gates

- `npm run build`, `npm run lint` (0 errors, the 2 pre-existing warnings), `npm run check:design`, `npm run check:i18n`
  (10 new keys, parity), `npm test` → **30 files / 335 tests** (baseline 29 / 324 + 11).
- `grep -rn "minLength={8}\|MIN_PASSWORD_LENGTH = " app/ components/ lib/` → only `lib/passwords.ts`.

### Verifier smoke test (manual pass 5)

Prod build on the local DB: `npm run build && npm run start` (port 3000), base `http://localhost:3000`.

1. Action id: from `.next/server/server-reference-manifest.json`, the key under `node` whose entry's
   `exportedName` is `registerGuestAction`.
2. Register: `curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/login -H "Next-Action: $ID" -H "Origin: $BASE" -H "Accept: text/x-component" -F '1_name=Smoke Guest' -F '1_email=smoke-guest@test.local' -F '1_password=smokepass1' -F '0=["$K1"]'`
   → `200`; then `psql` on `localhost:5434`: `select role from "User" where email='smoke-guest@test.local'` → `GUEST`.
   Repeat the POST → body contains `emailTaken`, still one row.
   If step 1 or 2 cannot produce the row, stop and report "registration via curl not verified" with the
   status and body — manual pass 1 then covers registration and 2 the sign-in. Do not insert a row by hand.
3. Sign in (memory: curl-login): GET `/api/auth/csrf` → POST `/api/auth/callback/credentials` with
   csrfToken, `smoke-guest@test.local`, `smokepass1`, cookie jar.
4. GET `/events` with the jar → `200`; GET `/tasks` → `307` to `/events`.
5. Cleanup: `delete from "User" where email='smoke-guest@test.local'`.

### Manual pass

As the spec's list (1–4), plus:
5. `/login`: the toggle shows "Sign in" selected; switching to guest and back clears any error. FR locale shows the fr copy.
6. Guest form, password of 7 chars: the browser blocks it (`minLength`); with name only spaces → "Fill in your name…" and the
   email you typed is still in the field.
7. Sign in as an admin with 2FA on: the toggle disappears on the code step.
8. `/account` (admin): changing the password to 7 chars still refused (constant moved, behaviour unchanged).
