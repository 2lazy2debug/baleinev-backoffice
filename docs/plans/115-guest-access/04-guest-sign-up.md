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
