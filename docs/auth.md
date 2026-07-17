# Authentication & Authorization

This app uses **NextAuth v4** with a custom credentials provider, JWT sessions, and two layers of access control.

---

## Login Flow

```
User submits login form
        │
        ▼
signIn("credentials", { email, password })   ← next-auth client call
        │
        ▼
NextAuth CredentialsProvider.authorize()     ← lib/auth.ts
  1. prisma.user.findUnique({ where: { email } })
  2. bcrypt.compare(password, user.passwordHash)
  3. If valid → return { id, email, name, role, departmentRoleIds, departmentRoleNames }
  4. If invalid → return null (NextAuth shows error)
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

---

## Middleware — Route Guard

File: [`proxy.ts`](../proxy.ts) (Next.js middleware, runs on the Edge).

The middleware protects the entire `(app)` route group. It checks two things:

1. **Is the user authenticated?** If not, redirect to `/login`.
2. **Is the user a `DEPARTMENT` role trying to access an admin route?**
   - Blocked routes for `DEPARTMENT`: `/`, `/editions`, `/journal`, `/money-accounts`, `/cost-centers`,
     `/invoices`, `/templates`, `/departments`, `/users` — these redirect to `/budget`.
   - Everything else (`/budget`, `/tasks`, `/calendar`, `/events`, `/expense-reports`, etc.) is allowed.

The middleware reads the role from the **JWT token** (no database round-trip).

```ts
// proxy.ts — simplified logic
const token = await getToken({ req })
if (!token) return redirect("/login")
if (token.role === "DEPARTMENT" && BLOCKED_DEPARTMENT_PATHS.some((p) => pathname.startsWith(p))) {
  return redirect("/budget")
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
    edition: { isActive: true }
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
| `PASSWORD_VAULT_KEY` | AES-256-GCM master key for the Passwords vault (32 bytes, base64). See [passwords.md](passwords.md) |
