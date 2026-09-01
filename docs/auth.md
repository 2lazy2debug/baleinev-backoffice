# Authentication & Authorization

This app uses **NextAuth v4** with a custom credentials provider, JWT sessions, and two layers of access control.

---

## Login Flow

```
User submits login form
        │
        ▼
signIn("credentials", { email, password, totp })   ← next-auth client call
        │
        ▼
NextAuth CredentialsProvider.authorize()     ← lib/auth.ts
  1. prisma.user.findUnique({ where: { email } })
  2. bcrypt.compare(password, user.passwordHash)
  3. If invalid → return null (NextAuth shows "Invalid email or password")
  4. If user.twoFactorEnabled:
       no totp     → throw "2FA_REQUIRED"  ← the form swaps to a code field
       wrong totp  → throw "2FA_INVALID"   ← the form says the code is wrong
  5. ensureUserEdition(user.id)             ← lib/edition-context.ts
       Seeds User.selectedEditionId from the default edition on first login.
       No-op once the account has an edition; no-op if no default exists.
  6. return { id, email, name, role, departmentRoleIds, departmentRoleNames }
        │
        ▼
jwt() callback                               ← lib/auth.ts
  Encodes id, role, departmentRoleIds, departmentRoleNames into the JWT token
        │
        ▼
session() callback                           ← lib/auth.ts
  Copies token fields onto session.user so client components can read them
        │
        ▼
Client reads session role and redirects: ADMIN → /  (dashboard), DEPARTMENT → /budget
```

### Session object shape
After login, `session.user` contains:
```ts
{
  id: string              // User.id from database
  email: string
  name: string
  role: "ADMIN" | "DEPARTMENT"
  departmentRoleIds: string[]    // DepartmentRole IDs this user belongs to
  departmentRoleNames: string[]  // corresponding department names
}
```

These fields are added by the module augmentation in [`types/next-auth.d.ts`](../types/next-auth.d.ts).

### Two-factor sign-in (TOTP)

Optional, per account, turned on by the user from the 2FA card on `/account`
([`two-factor-card.tsx`](../app/(app)/account/two-factor-card.tsx)). Standard TOTP —
6 digits, 30-second period, SHA-1 — so any authenticator app works.

**Enrolment is two steps, and the order is the point:**

| Step | Action | What changes on `User` |
|---|---|---|
| 1. Turn on | `startTwoFactorEnrolmentAction()` mints a 160-bit base32 secret, seals it, and returns the `otpauth://` QR plus the key to type by hand | `twoFactorCipher/Iv/Tag` set, `twoFactorEnabled` stays **false** |
| 2. Confirm | `enableTwoFactorAction()` checks a code against that seed | `twoFactorEnabled` → **true** |
| Cancel | `cancelTwoFactorEnrolmentAction()` drops a pending seed (never an active one) | the three cipher columns cleared |
| Turn off | `disableTwoFactorAction()` — **costs the account password**, the same proof changing the password costs, so an open session on a borrowed laptop is not enough | all four columns cleared |

Between the two steps the account still signs in on its password alone: a seed with
`twoFactorEnabled = false` is a pending enrolment that `authorize()` ignores, so backing out
half-way — or closing the tab — can never lock anyone out. Re-enrolling while 2FA is on is
refused; it would silently replace the seed the user's phone already holds, so it goes through
"turn it off" first.

**The secret is on screen exactly once**, during step 1. After that the server only ever
unseals it to check a code — there is no "show me my key again". The way back is to turn 2FA
off and enrol again.

**Order of checks matters.** The code is only asked for *after* `bcrypt.compare` succeeds, so
a wrong password never reveals whether an account carries a second factor.

**The seed shares the Passwords vault key.** `lib/two-factor.ts` seals it through
`lib/secret-crypto.ts` with `PASSWORD_VAULT_KEY`. Two consequences:
- No key configured → the 2FA card says so and offers no button, rather than a button that
  can only fail.
- **Rotating that key locks every enrolled user out of their second factor**, exactly as it
  makes vault entries unreadable. `verifyUserTwoFactorCode()` answers `false` on a seed it
  cannot open, so those accounts need `twoFactorEnabled` cleared in the database before they
  can sign in again. See [passwords.md](passwords.md).

**There are no recovery codes and no admin reset.** A user who loses their authenticator has
to have `twoFactorEnabled` cleared directly in the database.

---

## Middleware — Route Guard

File: [`proxy.ts`](../proxy.ts) (Next.js middleware, runs on the Edge).

The middleware protects the entire `(app)` route group. It checks two things:

1. **Is the user authenticated?** If not, redirect to `/login`.
2. **Is the user a `DEPARTMENT` role trying to access an admin route?**
   - Blocked routes for `DEPARTMENT`: `/`, `/editions`, `/journal`, `/cost-centers`,
     `/invoices`, `/templates`, `/departments`, `/users` — these redirect to `/budget`.
   - `/money-accounts` is a special case: blocked for `DEPARTMENT` users **unless** their
     `departmentRoleNames` includes `"Comptabilité"` (the accounting department name is read
     straight off the JWT, no DB round-trip — see `lib/money-account-roles.ts`).
   - Everything else (`/budget`, `/tasks`, `/calendar`, `/events`, `/expense-reports`, etc.) is allowed.
   - `/addresses` is deliberately in that "everything else": the address book is open to every
     signed-in user, and only its *delete* action is admin-gated — in the server action, where it
     belongs, not in the route guard.

The middleware reads the role from the **JWT token** (no database round-trip).

```ts
// proxy.ts — simplified logic
const token = await getToken({ req })
if (!token) return redirect("/login")
if (token.role === "DEPARTMENT") {
  if (pathname.startsWith("/money-accounts")) {
    if (!token.departmentRoleNames?.includes(MONEY_ACCOUNT_MANAGER_DEPARTMENT)) return redirect("/budget")
  } else if (BLOCKED_DEPARTMENT_PATHS.some((p) => pathname.startsWith(p))) {
    return redirect("/budget")
  }
}
```

---

## Server-side Access Control

File: [`lib/access.ts`](../lib/access.ts).

Every protected page and server action calls one of these two helpers:

### `getCurrentUserAccess()`
Fetches the full `AccessContext` for the authenticated user:
- Reads the NextAuth session (server-side via `getServerSession`).
- Queries the database for the user record including `departmentRoles`.
- Returns an `AccessContext` object (or `null` if unauthenticated).

```ts
type AccessContext = {
  userId: string
  role: "ADMIN" | "DEPARTMENT"
  departmentRoles: { id: string; departmentId: string; name: string }[]
  // + all refund profile fields
}
```

### `requireAdmin()`
Calls `getCurrentUserAccess()` and throws (or redirects) if the user is not `ADMIN`. Used at the top of every admin-only page and server action:

```ts
// pattern used in admin pages / actions:
const access = await requireAdmin()  // throws if not ADMIN
```

### `requireMoneyAccountManager()` / `canManageMoneyAccounts()`
A narrower alternative to `requireAdmin()`, used only by the money-accounts page and its
server actions (`app/(app)/money-accounts/`). Grants access to `ADMIN` **and** to `DEPARTMENT`
users who belong to the `"Comptabilité"` department — everyone else gets the same
`Unauthorized.` throw as `requireAdmin()`.

```ts
const access = await requireMoneyAccountManager()  // throws unless ADMIN or Comptabilité
```

### Why two layers?

| Layer | Where | Protects against |
|---|---|---|
| Middleware (`proxy.ts`) | Edge, before page loads | DEPARTMENT users navigating to admin URLs directly |
| `requireAdmin()` | Server component / server action | Direct API calls, fetch-based attacks, accidental omissions in UI gating |

The middleware is the fast path (no DB). `requireAdmin()` is the authoritative check that cannot be bypassed.

---

## Department-role Filtering

When a `DEPARTMENT` user views the budget or expense reports, data is filtered to only show their departments:

```ts
// Example from budget/page.tsx
const access = await getCurrentUserAccess()
const myDeptIds = access.departmentRoles.map(r => r.departmentId)
const departments = await prisma.department.findMany({
  where: {
    id: { in: myDeptIds },
    editionId: await resolveEditionId()
  }
})
```

This means a DEPARTMENT user only sees their own department's budget lines and nothing else — even if they somehow bypass the UI.

---

## Password Management

Passwords are stored as **bcrypt** hashes.

- **Seed:** `prisma/seed.ts` reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from env vars, hashes with `bcrypt.hash(password, 10)`, and creates the first admin user.
- **User creation/update:** `app/(app)/users/actions.ts` likewise hashes new passwords before storing.
- **Login:** `lib/auth.ts` uses `bcrypt.compare(plaintext, hash)`.

There is no self-service signup — all accounts are created by an admin.

---

## Environment Variables

| Variable | Used by |
|---|---|
| `DATABASE_URL` | Prisma (PostgreSQL connection string) |
| `NEXTAUTH_SECRET` | NextAuth JWT signing key |
| `NEXTAUTH_URL` | NextAuth (base URL of the app) |
| `ADMIN_EMAIL` | Seed script initial admin email |
| `ADMIN_PASSWORD` | Seed script initial admin password |
| `PASSWORD_VAULT_KEY` | AES-256-GCM master key for the Passwords vault **and for account 2FA seeds** (32 bytes, base64). See [passwords.md](passwords.md) |
