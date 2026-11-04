# Step 1 — Guest role and lockdown

## Goal

A `GUEST` role exists, and a guest session can reach the Events app of the default edition and
nothing else — enforced in `proxy.ts` and in `lib/access.ts`. No UI creates guests yet; the
seed fixture does.

## Scope

- Prisma: add `GUEST` to `enum UserRole`, migration.
- Widen every role literal union to include `"GUEST"` (`types/next-auth.d.ts`, `lib/auth.ts`
  session callback cast, `lib/access.ts > AccessContext`, and whatever `npm run build` flags).
  Where a switch/Record over roles needs a GUEST arm, give it the most restrictive behaviour.
- `lib/access.ts > getCurrentUserAccess`: refuses GUEST by default; an explicit opt-in returns the
  context for a guest. Contract (design pins the exact name/shape): the zero-argument call — every
  existing call site — must refuse a guest without edits at those call sites.
- Opt in exactly: `app/(app)/layout.tsx`, `app/(app)/events/page.tsx`,
  `events/actions.ts > signUpForShiftAction`, `withdrawFromShiftAction`,
  `app/api/events/[eventId]/pdf/route.ts > GET`.
- `proxy.ts`: GUEST allowlist — `/events` exactly (not `/events/settings`, `/events/logs`),
  `/api/events/<id>/pdf`, `/api/preferences/theme`, plus what is already exempt. Anything else
  → redirect to `/events` (pages) / 401 (API, mirror how `preferences/edition` answers a missing
  session).
- `lib/edition-context.ts`: for a GUEST, `resolveEditionIdOrNull` returns the `isDefault` edition's
  id every time and never writes `selectedEditionId`; `ensureUserEdition` is a no-op for GUEST.
  `app/api/preferences/edition/route.ts > POST` refuses GUEST.
- `login-form.tsx`: GUEST lands on `/events` (same branch as DEPARTMENT).
- `prisma/seed.ts > seedDevFixtures`: upsert a GUEST user (e.g. `guest@dev.local`, password from
  the same source as the DEPARTMENT fixture).
- Docs: `docs/auth.md` — role list, session shape, middleware section (GUEST allowlist), access
  helper (refuse-by-default), redirect-after-login line (fix the stale `/budget`).

## Out of scope

Shell changes (Step 2), event filtering / button hiding / no-task (Step 3), registration (Step 4),
`/users` display (Step 5). After this step a guest still sees the full sidebar and every event —
that is expected.

## Tests

- New `lib/access.test.ts` (pattern: `app/(app)/articles/actions.test.ts`, mock
  `next-auth` `getServerSession`, `@/lib/db`, `next/navigation` `redirect`):
  GUEST refused by default; GUEST allowed with opt-in; ADMIN/DEPARTMENT unchanged by both.
- `requireAdmin()` refuses GUEST.
- `lib/edition-context`: GUEST resolves to the default edition even with a stale
  `selectedEditionId`; returns null when no default exists; never calls `user.update`.
- `proxy.ts`: if the design makes it testable (mock `getToken`), table of path → outcome for GUEST:
  `/events` next, `/events/settings` → `/events`, `/` → `/events`, `/tasks` → `/events`,
  `/api/events/x/pdf` next, `/api/preferences/edition` refused, `/api/cities` refused.
- Existing `staffing-actions.test.ts` still passes with the opt-in call shape.

## Evidence to gather in design

- The full inventory of `getCurrentUserAccess` call sites (≈65 in `app/(app)/`, plus API routes) —
  confirm none needs a guest except the five above.
- How an action's `try/catch` + `toActionErrorMessage` (`lib/server-action-helpers.ts`) treats a
  `redirect()` thrown from the helper — decide whether the guest refusal redirects or throws.

## Manual pass

1. `SEED_DEV_FIXTURES=1 npm run db:seed`, sign in as the guest fixture → lands on `/events`, sees
   the default edition's events.
2. Visit `/`, `/tasks`, `/account`, `/budget`, `/users`, `/events/settings`, `/events/logs` → each
   ends on `/events`.
3. Sign up for a shift and withdraw → both work.
4. Sign in as DEPARTMENT and ADMIN fixtures → behaviour unchanged.

## Code map

- `prisma/schema.prisma > enum UserRole`, `model User`
- `types/next-auth.d.ts` (User, Session.user, JWT augmentations)
- `lib/auth.ts > authOptions` (`authorize`, `jwt`, `session` callbacks)
- `lib/access.ts > AccessContext`, `getCurrentUserAccess`, `requireAdmin`
- `lib/edition-context.ts > ensureUserEdition`, `resolveEditionIdOrNull`
- `app/api/preferences/edition/route.ts > POST`
- `app/api/events/[eventId]/pdf/route.ts > GET`
- `proxy.ts > proxy`
- `app/(app)/layout.tsx > ProtectedLayout`
- `app/(app)/events/page.tsx > EventsPage`
- `app/(app)/events/actions.ts > signUpForShiftAction`, `withdrawFromShiftAction`
- `app/(auth)/login/login-form.tsx > LoginForm` (post-sign-in redirect by role)
- `prisma/seed.ts > seedDevFixtures`
- Role literals to widen (build will confirm): `lib/tasks.ts`, `components/app-shell.tsx`,
  `app/(app)/tasks/{page,client,actions}`, `app/(app)/expense-reports/{page,client,actions}`,
  `app/(app)/calendar/page.tsx`, `app/(app)/budget/page.tsx`, `app/(app)/pos/page.tsx`,
  `app/(app)/account/client.tsx`, `app/(app)/users/{client,create-user-modal,actions}`,
  `app/api/expense-reports/[expenseReportId]/proof/route.ts`
- Test mock pattern: `app/(app)/events/staffing-actions.test.ts`

## Design

Approved in design session 2026-11-04. All paths relative to `app/`. Where this section and the
spec above differ, this section wins.

### Evidence gathered

| Question | Finding | Consequence |
|---|---|---|
| `getCurrentUserAccess` call sites | 63, all zero-arg. Pages, actions, two API routes (`events/[eventId]/pdf`, `expense-reports/[expenseReportId]/proof`), wrappers `requireAdmin` (86 callers), `requireMoneyAccountManager` (5), `cash/actions.ts > requireCashManager` (2) | Nothing outside the five opt-ins needs a guest. Components rendered by `layout.tsx` / `events/page.tsx` (`AppShell`, `EventsPageClient`, `WritableEditionOnly`, `resolveEdition*`) call no access helper |
| Guest-reachable but refused | `events/actions.ts > markUnavailableForShiftAction`, `clearUnavailableForShiftAction` are imported by `events/client.tsx` | Correct: guests get no "unavailable" answer (README). Step 3 hides the buttons; until then a guest click reloads `/events` |
| `toActionErrorMessage` and `redirect()` | `lib/server-action-helpers.ts > toActionErrorMessage` returns `err.message` for any `Error`. A `redirect()` inside an action's `try` (every action, 135 call sites) comes back as `{ error: "NEXT_REDIRECT;…" }` | Decision R below |
| `unstable_rethrow` (Next 16.1.6) | Probe: exported by `next/navigation`; rethrows the `redirect()` error (digest `NEXT_REDIRECT;replace;/events;307;`), lets a plain `Error` through. No test mocks `next/navigation` | Safe to call from `toActionErrorMessage` in every existing test |
| `NextRequest`/`NextResponse` in node | Probe: `new NextRequest(new URL(…))` works; `NextResponse.next()` → header `x-middleware-next: 1`, status 200; `redirect` → 307 + absolute `location`; `json(…, {status:401})` → 401 | `proxy.ts` is testable in vitest (`include: ["**/*.test.ts"]` covers `proxy.test.ts` at `app/`) |
| `preferences/edition` missing session | `401`, body `{ ok: false, error: "Not signed in" }` | Proxy API refusal mirrors the shape |
| `preferences/theme` | No auth at all (cookie only) | Allowlisting it is enough |
| Login redirect | `login-form.tsx`: `getSession()` then `role === "DEPARTMENT" ? "/events" : "/"` | Add GUEST to the `/events` branch |
| `ensureUserEdition` callers | `lib/auth.ts` (authorize, every sign-in), `users/actions.ts` (admin creates a user), `resolveEditionIdOrNull` | Guest branch must live inside `ensureUserEdition` too, or every guest sign-in writes `selectedEditionId` |
| Seed | `prisma/seed.ts > seedDevFixtures`: `devPassword = await hash("devpassword", 12)`, DEPARTMENT upsert on `dev-department@baleinev.local` with string-literal roles | Guest fixture copies it |
| Role literals | Unions in `types/next-auth.d.ts` (3), `lib/access.ts` (`AccessContext.role`), `lib/tasks.ts` (local `AccessContext.role`, `getStandaloneTodoTasksForUser` param), `components/app-shell.tsx` (`role` prop), `tasks/client.tsx`, `expense-reports/client.tsx`, `account/client.tsx`; cast in `lib/auth.ts` session callback. No `Record<UserRole,…>`, no `switch` on role | Widen to Prisma `UserRole`. Every `role === "ADMIN" ? … : …` ternary already gives a guest the non-admin (restrictive) branch |
| Local DB | `prisma migrate status`: 29 migrations, up to date. Tests: 24 files / 279 tests pass | Baseline for the gates |

### Decisions

| # | Decision | Reason |
|---|---|---|
| R | Guest refusal in `getCurrentUserAccess` is `redirect("/events")`, mirroring `redirect("/login")` for no session. `toActionErrorMessage` calls `unstable_rethrow(err)` first, so a redirect thrown inside any action's `try` reaches Next instead of the form | A page refusal must land on `/events` (manual pass 2). A thrown `Error` would 500 a page. The rethrow also fixes the existing no-session case, which today shows `NEXT_REDIRECT;…` as a form error |
| O | Opt-in is an options object: `getCurrentUserAccess({ allowGuest: true })`. The zero-arg call refuses | Self-describing at the call site; extensible; existing call sites untouched |
| T | Role types use Prisma's `UserRole` (`import type { UserRole } from "@prisma/client"`), never a new literal union | The next enum value is a schema change only. `import type` is erased, so client components pull nothing from Prisma |
| E | A guest's edition is computed per call (`findFirst({ where: { isDefault: true } })`), in both `resolveEditionIdOrNull` and `ensureUserEdition`. The role is read from the DB in the query that already reads `selectedEditionId`, not from the JWT | No extra round-trip; DB is authoritative (README invariant "two layers") |
| P | Proxy guest refusal: pages → `307 /events`; `/api/*` → `401 { ok: false, error: "Not allowed" }` | Mirrors the edition route's shape; "Not signed in" would be false for a guest |
| S | Edition POST refuses a guest with `403 { ok: false, error: "Not allowed" }`, checked on `session.user.role` right after the session check | The proxy already 401s it; this is the second layer. Even a stale write would be ignored by Decision E |
| K | `lib/auth.ts` session callback keeps its `?? "ADMIN"` fallback; only the cast changes | Every token carries `role` from `authorize`; the server never trusts `session.user.role` for access (helper reads the DB). Out of scope |

### Migration

`prisma/schema.prisma > enum UserRole` becomes `ADMIN`, `DEPARTMENT`, `GUEST` (append, nothing
else in the schema changes; `User.role` default stays `ADMIN`).

New file `prisma/migrations/20261104090000_user_role_guest/migration.sql`, exactly:

```sql
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'GUEST';
```

Apply on the local DB (from `app/`): `npx prisma migrate deploy`, then `npx prisma generate`.

### Code changes, in this order

1. **`lib/server-action-helpers.ts`**
   ```ts
   import { unstable_rethrow } from "next/navigation";

   /**
    * The message a form shows for a failed action. A redirect() thrown inside the action's
    * try (no session, a guest refused by getCurrentUserAccess) is rethrown so Next performs it.
    */
   export function toActionErrorMessage(err: unknown): string {
     unstable_rethrow(err);
     return err instanceof Error ? err.message : "Something went wrong. Please try again.";
   }
   ```
2. **`lib/access.ts`**
   - `import type { UserRole } from "@prisma/client";` — `AccessContext.role: UserRole`.
   - Add, above `getCurrentUserAccess`:
     ```ts
     export type AccessOptions = {
       /**
        * Let a GUEST through. Only the guest surface passes it: app/(app)/layout.tsx,
        * app/(app)/events/page.tsx, events/actions.ts > signUpForShiftAction and
        * withdrawFromShiftAction, app/api/events/[eventId]/pdf/route.ts. Every other caller
        * leaves it out, which is what keeps a new page or action closed to guests.
        */
       allowGuest?: boolean;
     };
     ```
   - Signature: `export async function getCurrentUserAccess(options: AccessOptions = {}): Promise<AccessContext>`.
   - Directly after the existing `if (!user) { redirect("/login"); }`:
     ```ts
     if (user.role === "GUEST" && !options.allowGuest) {
       redirect("/events");
     }
     ```
   - `requireAdmin`, `requireMoneyAccountManager`, `isAdmin`, `canManageMoneyAccounts`,
     `accessibleDepartmentIds`, `canAccessDepartments`: unchanged (the zero-arg call already
     refuses a guest before any role check).
3. **Opt-ins** — replace `getCurrentUserAccess()` with `getCurrentUserAccess({ allowGuest: true })`
   at exactly these five sites, nowhere else:
   `app/(app)/layout.tsx > ProtectedLayout`, `app/(app)/events/page.tsx > EventsPage`,
   `app/(app)/events/actions.ts > signUpForShiftAction`, `> withdrawFromShiftAction`,
   `app/api/events/[eventId]/pdf/route.ts > GET`. Verify with
   `grep -rn "allowGuest: true" app lib components` → exactly 5 lines.
4. **Role types** (Decision T) — replace the `"ADMIN" | "DEPARTMENT"` union with `UserRole`
   (adding `import type { UserRole } from "@prisma/client";` where missing) in:
   `types/next-auth.d.ts` (User, Session.user, JWT — JWT keeps the `?`),
   `lib/tasks.ts` (local `AccessContext.role` and the `getStandaloneTodoTasksForUser` `role` param),
   `components/app-shell.tsx` (`role` prop), `app/(app)/tasks/client.tsx`,
   `app/(app)/expense-reports/client.tsx`, `app/(app)/account/client.tsx`;
   `lib/auth.ts` session callback: `(token.role as UserRole) ?? "ADMIN"`. If `npm run build`
   flags any further site, it is the same type-only widening — never add a GUEST behaviour arm in
   this step. Existing `as UserRole` casts (`lib/tasks.ts`, `layout.tsx`, `users/actions.ts`) stay.
5. **`lib/edition-context.ts`**
   - Private helper below the `EditionContext` type:
     ```ts
     /**
      * A guest is always in the default edition: looked up on every request and never stored,
      * so moving the default moves every guest with it.
      */
     async function defaultEditionId(): Promise<string | null> {
       const edition = await prisma.edition.findFirst({ where: { isDefault: true }, select: { id: true } });
       return edition?.id ?? null;
     }
     ```
   - `ensureUserEdition`: select `{ selectedEditionId: true, role: true }`; after the `!user`
     check add `if (user.role === "GUEST") { return defaultEditionId(); }` (never writes);
     replace the inline `findFirst` with `const defaultId = await defaultEditionId();`, keep the
     null return and the `user.update` write for everyone else.
   - `resolveEditionIdOrNull`: select `{ selectedEditionId: true, role: true }`; before the
     final return add `if (user?.role === "GUEST") { return defaultEditionId(); }`.
   - Top-of-file comment: append one sentence — "Except a GUEST: always the default edition,
     resolved on every request, never written to `selectedEditionId`."
6. **`app/api/preferences/edition/route.ts > POST`** — directly after the `401 Not signed in`
   block:
   ```ts
   if (session.user.role === "GUEST") {
     return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
   }
   ```
7. **`proxy.ts`** — module-level, above `proxy`:
   ```ts
   // A guest gets the Events page, its schedule PDF and the theme toggle — nothing else.
   // `/events` exactly: /events/settings and /events/logs are admin screens.
   const GUEST_EVENT_PDF = /^\/api\/events\/[^/]+\/pdf$/;

   function isGuestPath(pathname: string): boolean {
     return pathname === "/events" || pathname === "/api/preferences/theme" || GUEST_EVENT_PDF.test(pathname);
   }
   ```
   Inside `proxy`, directly after the `if (!token)` block and before the DEPARTMENT block:
   ```ts
   if (token.role === "GUEST") {
     if (isGuestPath(pathname)) {
       return NextResponse.next();
     }

     if (pathname.startsWith("/api/")) {
       return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 401 });
     }

     return NextResponse.redirect(new URL("/events", request.url));
   }
   ```
   Do not export `isGuestPath` (keep `proxy.ts` exporting only `proxy` and `config`). The
   pre-token exemptions (`/login`, `/api/auth`, `/api/preferences/language`, `/logo_blv.png`, …)
   stay first and apply to guests unchanged.
8. **`app/(auth)/login/login-form.tsx`** — the redirect becomes
   `const role = session?.user?.role;` and
   `window.location.href = role === "DEPARTMENT" || role === "GUEST" ? "/events" : "/";`;
   the comment above it reads: "Send each role straight to its landing page: DEPARTMENT and
   GUEST users land on /events rather than loading "/" only to be bounced by the route gating."
9. **`prisma/seed.ts > seedDevFixtures`** — after the DEPARTMENT upsert, same shape:
   ```ts
   await prisma.user.upsert({
     where: { email: "dev-guest@baleinev.local" },
     update: { role: "GUEST", passwordHash: devPassword },
     create: {
       email: "dev-guest@baleinev.local",
       name: "Dev Guest",
       role: "GUEST",
       passwordHash: devPassword,
     },
   });
   ```

### Tests

Mock pattern for new files: `app/(app)/events/staffing-actions.test.ts` — top-level `vi.fn()`s,
`vi.mock` factories that forward lazily (`(...a: unknown[]) => fn(...a)`), then
`await import(...)` of the module under test. `beforeEach(() => vi.clearAllMocks())` plus the
per-test `mockResolvedValue`.

**`lib/access.test.ts`** (new). Mocks: `next-auth` → `{ getServerSession }`; `@/lib/auth` →
`{ authOptions: {} }`; `@/lib/db` → `{ prisma: { user: { findUnique } } }`; `next/navigation` →
`{ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }`. A user row helper
returns `{ id: "u1", email: "u@x", name: "U", role, refundFirstName: null, refundLastName: null,
refundIban: null, refundZip: null, refundCity: null, departments: [] }`; session
`{ user: { id: "u1" } }`.

| Case | Expected |
|---|---|
| no session, `getCurrentUserAccess()` | rejects `REDIRECT:/login` |
| GUEST, `getCurrentUserAccess()` | rejects `REDIRECT:/events` |
| GUEST, `getCurrentUserAccess({ allowGuest: true })` | resolves, `role: "GUEST"`, `departmentIds: []` |
| ADMIN, with and without `{ allowGuest: true }` | both resolve, `role: "ADMIN"` |
| DEPARTMENT, with and without `{ allowGuest: true }` | both resolve, `role: "DEPARTMENT"` |
| `requireAdmin()` as GUEST | rejects `REDIRECT:/events` |
| `requireAdmin()` as DEPARTMENT | rejects `Unauthorized.` |
| `requireAdmin()` as ADMIN | resolves |

**`lib/edition-context.test.ts`** (new). Mocks: `next-auth` → `{ getServerSession }` (resolves
`{ user: { id: "u1" } }`); `@/lib/auth` → `{ authOptions: {} }`; `@/lib/db` →
`{ prisma: { user: { findUnique, update }, edition: { findFirst } } }`.

| Case | Setup | Expected |
|---|---|---|
| guest, stale pick | user `{ role: "GUEST", selectedEditionId: "old" }`, default `{ id: "def" }` | `resolveEditionIdOrNull()` → `"def"`; `update` not called |
| guest, no default | user `{ role: "GUEST", selectedEditionId: "old" }`, `findFirst` → `null` | → `null`; `update` not called |
| guest via `ensureUserEdition("u1")` | user `{ role: "GUEST", selectedEditionId: null }`, default `"def"` | → `"def"`; `update` not called |
| department keeps its pick | user `{ role: "DEPARTMENT", selectedEditionId: "old" }` | → `"old"`; `findFirst` not called |
| department seeded once | user `{ role: "DEPARTMENT", selectedEditionId: null }`, default `"def"` | → `"def"`; `update` called with `{ where: { id: "u1" }, data: { selectedEditionId: "def" } }` |
| no session | `getServerSession` → `null` | → `null`; `findUnique` not called |

**`proxy.test.ts`** (new, at `app/`). Mock `next-auth/jwt` → `{ getToken }`. Build requests with
`new NextRequest(new URL(path, "http://localhost"))`. Outcomes: *next* = header
`x-middleware-next` is `"1"`; *→ X* = status 307 and `location` `http://localhost` + X;
*401* = status 401 and body `{ ok: false, error: "Not allowed" }`. Table-driven (`it.each`):

| Token | Path | Expected |
|---|---|---|
| GUEST | `/events` | next |
| GUEST | `/events/settings` | → `/events` |
| GUEST | `/events/logs` | → `/events` |
| GUEST | `/` | → `/events` |
| GUEST | `/tasks` | → `/events` |
| GUEST | `/account` | → `/events` |
| GUEST | `/users` | → `/events` |
| GUEST | `/api/events/evt_1/pdf` | next |
| GUEST | `/api/events/evt_1/pdf/extra` | 401 |
| GUEST | `/api/preferences/theme` | next |
| GUEST | `/api/preferences/edition` | 401 |
| GUEST | `/api/cities` | 401 |
| GUEST | `/login` | next (exempt before the token) |
| none (`null`) | `/events` | → `/login` |
| DEPARTMENT (`departmentNames: []`) | `/users` | → `/budget` |
| DEPARTMENT (`departmentNames: []`) | `/events/settings` | next |
| ADMIN | `/users` | next |

For the `/login` row assert `getToken` was not called.

**`lib/server-action-helpers.test.ts`** (new; no mocks — real `next/navigation`):

| Case | Expected |
|---|---|
| error caught from `redirect("/events")` | `toActionErrorMessage(err)` throws that same error (`toBe`) |
| `new Error("Boom.")` | returns `"Boom."` |
| `"nope"` (non-Error) | returns `"Something went wrong. Please try again."` |

**`app/(app)/events/staffing-actions.test.ts`** (edit). Change the `@/lib/access` mock to forward
arguments: `getCurrentUserAccess: (...a: unknown[]) => getCurrentUserAccess(...a)`. Add
`describe("guest opt-in")` with two tests: call `signUpForShiftAction({ error: null }, signUpForm())`
and `withdrawFromShiftAction({ error: null }, withdrawForm())`; each asserts
`expect(getCurrentUserAccess).toHaveBeenCalledWith({ allowGuest: true })`. All existing tests
pass unchanged.

### Docs

| File | Change |
|---|---|
| `docs/auth.md` > Login Flow diagram | last line: `ADMIN → / (dashboard), DEPARTMENT and GUEST → /events` (fixes stale `/budget`) |
| `docs/auth.md` > Session object shape | `role: "ADMIN" \| "DEPARTMENT" \| "GUEST"` |
| `docs/auth.md` > Middleware | new check before the DEPARTMENT one: "**Is the user a `GUEST`?** Allowlist: `/events` exactly, `/api/events/<id>/pdf`, `/api/preferences/theme` (plus the pre-token exemptions). Any other page → `/events`; any other `/api/*` → `401 { ok: false, error: "Not allowed" }`." Add the GUEST branch to the simplified snippet |
| `docs/auth.md` > `getCurrentUserAccess()` | signature `getCurrentUserAccess(options?: { allowGuest?: boolean })`; "Redirects to `/login` without a session (it never returns `null`). **Refuses GUEST by default**: redirects to `/events` unless the caller passes `{ allowGuest: true }`. Only the five guest surfaces do (list them). `toActionErrorMessage` rethrows the redirect, so a refused action redirects instead of showing an error." Role line → `UserRole` |
| `docs/auth.md` > `requireAdmin()` | add: "A GUEST is redirected to `/events` by `getCurrentUserAccess()` before the role check." |
| `docs/auth.md` > Why two layers | Middleware row: "DEPARTMENT users navigating to admin URLs; GUEST users reaching anything but `/events`"; second row names `getCurrentUserAccess()` (refuse-by-default) alongside `requireAdmin()` |
| `docs/database.md` > User `role` row | `ADMIN`, `DEPARTMENT` or `GUEST` |
| `docs/summary.md` > roles list | add after DEPARTMENT: "**GUEST** — someone outside the association. Signs up for event shifts of the default edition and nothing else." |
| `docs/business-processes.md` > `Edition.isDefault` bullet | add: "A GUEST is the exception: always in the default edition, resolved on every request and never written to `selectedEditionId`." |
| `docs/overview.md` > Middleware bullet | "…redirects `DEPARTMENT` users away from admin-only routes and holds `GUEST` users to `/events`." |
| `docs/file-structure.md` > `edition-context.ts` row | append "; a GUEST always resolves to the `isDefault` edition and is never written" |
| `docs/file-structure.md` > `seed.ts` row | fixtures list gains `dev-guest@baleinev.local` (GUEST / `devpassword`) |

### Gates (from `app/`)

| Gate | Expected |
|---|---|
| `npx prisma migrate deploy` | applies `20261104090000_user_role_guest`; `npx prisma migrate status` → 30 migrations, up to date |
| `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` (URL from `app/.env`) | exit 0, no diff |
| `grep -rn "allowGuest: true" app lib components` | exactly 5 lines, the five opt-ins |
| Old role union gone: command (a) below | 0 lines |
| `npm test` | 28 files (24 + 4 new), 279 + new cases, 0 failures |
| `npm run build`, `npm run lint`, `npm run check:design`, `npm run check:i18n` | pass (no UI copy added, no i18n keys) |
| `SEED_DEV_FIXTURES=1 npm run db:seed` | succeeds twice in a row (upsert) |
| Default edition exists: `npx tsx -e "import {PrismaClient} from '@prisma/client'; const p = new PrismaClient(); p.edition.findFirst({ where: { isDefault: true }, select: { name: true } }).then((e) => { console.log(e?.name ?? 'NONE'); return p.\$disconnect(); })"` | an edition name. `NONE` → stop and ask the user to flag one in `/editions` before the manual pass |

Command (a), from `app/` — fixed-string search, the pipe is literal:

```sh
grep -rnF '"ADMIN" | "DEPARTMENT"' app lib components types --include='*.ts' --include='*.tsx'
```

### Manual pass (dev server, local DB)

1. Seed fixtures; sign in as `dev-guest@baleinev.local` / `devpassword` → lands on `/events`
   showing the default edition's events (full sidebar still visible — Step 2).
2. Type each URL: `/`, `/tasks`, `/account`, `/budget`, `/users`, `/events/settings`,
   `/events/logs` → each ends on `/events`.
3. Open `/api/preferences/edition` and `/api/cities` in the address bar → `401`
   `{"ok":false,"error":"Not allowed"}`.
4. On `/events`: sign up for a shift on a non-expired event → listed as signed up; withdraw →
   removed. Download a schedule PDF → file downloads.
5. Click "unavailable" on a shift (still visible until Step 3) → page reloads on `/events`, no
   error text shown, no unavailability recorded.
6. Sign in as `dev-department@baleinev.local` → lands on `/events`; `/users` → `/budget`; edition
   picker still switches editions. Sign in as admin → lands on `/`; `/events/settings` and
   `/users` render.

### Not in this step (later steps own them)

- `/users` shows a GUEST as "Department" and its edit `<Select>` offers only ADMIN/DEPARTMENT, so
  saving a guest's card would promote it; `users/actions.ts > getRoleAndDepartmentIds` rejects
  `GUEST` ("Invalid role.") — Step 5.
- The PDF route serves any event id to a guest (no edition / expiry filter) — Step 3, with the
  events filtering.
- Shell, nav, bottom bar, edition picker for guests — Step 2.

## Verify results (2026-11-04)

Closed on the user's go, committed, not tagged or pushed.

| Gate | Result |
|---|---|
| `npx prisma migrate status` | 30 migrations, up to date |
| `prisma migrate diff … --exit-code` | exit 0, no difference |
| `grep -rn "allowGuest: true" app lib components` | 9 lines: the 5 opt-ins (`layout.tsx`, `events/page.tsx`, `events/actions.ts` ×2, `api/events/[eventId]/pdf/route.ts`) + 4 in tests (`staffing-actions.test.ts` ×2, `lib/access.test.ts` ×2). The "exactly 5" in the gate counted production code only |
| Old role union grep (a) | 0 lines |
| `npm test` | 28 files, 315 tests, 0 failures |
| `npm run build` / `lint` / `check:design` / `check:i18n` | pass. Lint: 0 errors, 2 pre-existing warnings (`lib/proof-upload.ts:57`, `types/next-auth.d.ts` unused `JWT` import) |
| `SEED_DEV_FIXTURES=1 npm run db:seed` ×2 | both succeed |
| Default edition (local) | `2026-2027` |
