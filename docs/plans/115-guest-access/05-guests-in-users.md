# Step 5 — Guests in /users

## Goal

Admins see guests in `/users`, marked as guests, and can delete them.

## Scope

- `app/(app)/users/client.tsx > UsersPageClient`: a `Guest` badge (tone per design) where the
  role badge is; delete via the existing `<ConfirmDelete>`. Guests listed after members, or in their
  own section — design decides, one list feeding both `<Table desktopOnly>` and `<CardletList>`.
- `create-user-modal.tsx`: the role choice stays ADMIN / DEPARTMENT — admins never create guests.
- `actions.ts > getRoleAndDepartmentIds`: keeps refusing GUEST as a submitted role.
- `deleteUserAction`: works on a guest unchanged (README > Invariants: no Restrict relation can
  block it); add a test.
- i18n: `users.guest` en/fr.
- Docs: `docs/auth.md` — who can delete guests.

## Open question (ask first, record answer in Design)

Editing a guest from `/users`:
- **A (recommended):** no edit on a guest card — delete only. Promoting someone to member is
  "create a member account"; their guest shift history stays under the guest row until deleted.
- **B:** the edit form can promote a guest to DEPARTMENT (picks departments), keeping their
  assignments. `updateUserAction` then accepts GUEST → DEPARTMENT, never anything → GUEST.

## Tests (`app/(app)/users/actions.test.ts`)

- Delete a guest → `user.delete` called.
- Create/update with `role=GUEST` submitted → refused.
- (If B) promote GUEST → DEPARTMENT with a department → updated; DEPARTMENT → GUEST refused.

## Manual pass

1. Admin, `/users` desktop and 390px: the guest from Step 4 shows with the Guest badge.
2. Delete it → gone; their shift sign-ups vanish from `/events` (cascade); `/events/logs` keeps
   the lines with the denormalised name.
3. The create modal offers no Guest role.

## Code map

- `app/(app)/users/page.tsx > UsersPage`
- `app/(app)/users/client.tsx > UsersPageClient`
- `app/(app)/users/create-user-modal.tsx > CreateUserModal`
- `app/(app)/users/actions.ts > getRoleAndDepartmentIds`, `updateUserAction`, `deleteUserAction`,
  `assertAdminCanBeRemoved`
- `app/(app)/users/actions.test.ts`
- `lib/i18n-dictionaries.ts` (`users` block: `admin`, `department`, `twoFactorOn`)
- `components/ui > Badge`, `ConfirmDelete`

## Design

### Open question — answered (user, 2026-11-04)

**B: promote.** The edit form can turn a GUEST into a DEPARTMENT user, keeping their shift
assignments. Pinned around it:

| Transition | Rule |
|---|---|
| GUEST → GUEST | Allowed (admin fixes name / email / password). Departments forced to `[]` |
| GUEST → DEPARTMENT | Allowed; needs ≥ 1 department (existing rule); writes the default edition |
| GUEST → ADMIN | Refused: `"A guest can only become a department user."` (promote to Department first, then Admin) |
| ADMIN / DEPARTMENT → GUEST | Refused: `"Invalid role."` (existing message) |
| `createUserAction` with `role=GUEST` | Refused: `"Invalid role."` (unchanged) |

### Deviations from the spec (evidence)

- `/users` is **not** a `<Table>` + `<CardletList>`: `client.tsx > UsersPageClient` renders one
  `<Card as="article">` per user at every breakpoint. Keep that; no new layout.
- "Guests listed after members" needs no code: `page.tsx` orders by `role: "asc"` and Postgres sorts
  an enum by declaration order (`ADMIN, DEPARTMENT, GUEST`, `prisma/schema.prisma > enum UserRole`).
  `page.tsx` is unchanged; no separate section.
- `create-user-modal.tsx` already offers only `UserRole.ADMIN` / `UserRole.DEPARTMENT`: unchanged.

### Facts the design relies on (scouted)

- `lib/auth.ts` `jwt` callback sets `token.role` only at sign-in → `proxy.ts` keeps treating a promoted
  guest as GUEST **until they sign in again**. `lib/access.ts > getCurrentUserAccess` reads the role
  from the DB, so the authoritative check is immediate. Accepted: no session invalidation; the docs say
  "takes effect at the next sign-in".
- `lib/edition-context.ts > ensureUserEdition(userId)` returns without writing for a GUEST, writes the
  default edition when `selectedEditionId` is null for anyone else. Guests always have it null.
- Guest emails are stored trimmed, not lowercased; `authorize` does an exact `findUnique`.
  `updateUserAction` lowercases today → saving a guest registered as `Jean@X.ch` would silently change
  their sign-in string. Fixed below for every user (members are already lowercase, so no-op for them).
- A guest's existing `StaffAssignment`s have no `STAFF_SHIFT` task (Step 3). Promotion does **not**
  backfill them; sign-ups made after promotion create tasks as usual. Accepted; documented.
- Delete cascades: `StaffAssignment.user` and `ShiftUnavailability.user` Cascade; `EventStaffLog.actor`
  / `.subject` SetNull with denormalised `actorName` / `subjectName`. No Restrict relation touches a guest.

### `components/ui/Badge.tsx`

`type BadgeTone = …` (line 3) → `export type BadgeTone = …`. Nothing else. (`index.ts` already
`export * from "./Badge"`.)

### `app/(app)/users/actions.ts`

1. **New** helper, placed above `assertAdminCanBeRemoved`:
   ```ts
   async function getExistingUser(userId: string) {
     const existingUser = await prisma.user.findUnique({
       where: { id: userId },
       select: { role: true, email: true },
     });
     if (!existingUser) {
       throw new Error("User not found.");
     }
     return existingUser;
   }
   ```
2. `assertAdminCanBeRemoved(userId: string, nextRole?: UserRole)` →
   `assertAdminCanBeRemoved(currentRole: UserRole, nextRole?: UserRole)`, still `async`. Drop its own
   `findUnique` and "User not found." branch; `existingUser.role` → `currentRole`. The
   `removingAdmin` / `deletingAdmin` / `count` logic is unchanged.
3. `getRoleAndDepartmentIds(formData)` → `getRoleAndDepartmentIds(formData: FormData, currentRole?: UserRole)`.
   Replace the `Invalid role` check (lines 29-31) with, in this order:
   ```ts
   const keepsGuest = currentRole === UserRole.GUEST && role === UserRole.GUEST;

   if (!keepsGuest && role !== UserRole.ADMIN && role !== UserRole.DEPARTMENT) {
     throw new Error("Invalid role.");
   }

   if (currentRole === UserRole.GUEST && role === UserRole.ADMIN) {
     throw new Error("A guest can only become a department user.");
   }
   ```
   The department-required check and the return are unchanged (GUEST gets `departmentIds: []`).
   `createUserAction` keeps calling it with no `currentRole` → GUEST stays refused there.
4. `updateUserAction`, body of the `try` in this order:
   ```ts
   await requireAdmin();
   const userId = getRequiredString(formData, "userId");
   const name = getRequiredString(formData, "name");
   const existingUser = await getExistingUser(userId);
   const submittedEmail = getRequiredString(formData, "email");
   // Guests sign in with the email exactly as they registered it; keep the
   // stored spelling unless the admin actually changed the address.
   const email =
     submittedEmail.toLowerCase() === existingUser.email.toLowerCase()
       ? existingUser.email
       : submittedEmail.toLowerCase();
   const newPassword = String(formData.get("newPassword") ?? "").trim();
   const { role, departmentIds } = getRoleAndDepartmentIds(formData, existingUser.role);

   await ensureDepartmentsExist(departmentIds);
   await assertAdminCanBeRemoved(existingUser.role, role);

   await prisma.user.update({ /* unchanged: where id, data name, email, role, departments.set, password */ });

   // A promoted guest has no stored edition (guests resolve the default on
   // every request); give them one as createUserAction does for new members.
   if (existingUser.role === UserRole.GUEST && role !== UserRole.GUEST) {
     await ensureUserEdition(userId);
   }

   revalidatePath("/users");
   return { error: null };
   ```
   Before → after: a submit for a missing user now answers "User not found." before any role /
   department validation error (was: validation first, then "User not found."). Accepted.
5. `deleteUserAction`: replace `await assertAdminCanBeRemoved(userId);` with
   ```ts
   const existingUser = await getExistingUser(userId);
   await assertAdminCanBeRemoved(existingUser.role);
   ```
   Everything else unchanged (self-delete refusal stays first). A guest deletes through it as is.

No transaction: same single `user.update` / `user.delete` as today; `ensureUserEdition` after the
update is idempotent (a retry after a failure in between writes it on the next save or sign-in —
`lib/auth.ts` calls it at login).

### `app/(app)/users/client.tsx`

1. Import `type BadgeTone` from `@/components/ui` (add to the existing import line).
2. Inside `UsersPageClient`, after the `useCloseOnSuccess` line:
   ```ts
   const roleBadges: Record<UserRole, { tone: BadgeTone; label: string }> = {
     [UserRole.ADMIN]: { tone: "info", label: copy.users.admin },
     [UserRole.DEPARTMENT]: { tone: "neutral", label: copy.users.department },
     [UserRole.GUEST]: { tone: "warning", label: copy.users.guest },
   };
   ```
   Guest tone is `warning`: an outside account an admin is expected to review/clean up.
3. Role badge (lines 70-72) →
   `<Badge tone={roleBadges[user.role].tone}>{roleBadges[user.role].label}</Badge>`.
4. Role `<Select>` options (lines 102-103) → for a guest, Guest + Department; otherwise unchanged:
   ```tsx
   {user.role === UserRole.GUEST ? (
     <option value={UserRole.GUEST}>{copy.users.guest}</option>
   ) : (
     <option value={UserRole.ADMIN}>{copy.users.admin}</option>
   )}
   <option value={UserRole.DEPARTMENT}>{copy.users.department}</option>
   ```
   `defaultValue={user.role}` stays, so a guest's form opens on Guest.
5. View mode: a guest card shows no departments row ("No department" on a guest states the obvious).
   The `) : (` before the `/* Departments read as … */` comment becomes
   `) : user.role === UserRole.GUEST ? null : (`.

No other change: same pencil, same `<ConfirmDelete>`, same 2FA reset.

### i18n (`lib/i18n-dictionaries.ts`, `users` block)

Add right after `department`: en `guest: "Guest",` · fr `guest: "Invité",`.

### Tests (`app/(app)/users/actions.test.ts`)

Mock setup changes:
- `prisma` → `{ user: { updateMany, findUnique, update, delete, count, create }, department: { findMany }, task: { deleteMany } }`, each `vi.fn()`.
- `const ensureUserEdition = vi.fn();` and
  `vi.mock("@/lib/edition-context", () => ({ ensureUserEdition: (...a: unknown[]) => ensureUserEdition(...a) }));`
- Import `createUserAction, updateUserAction, deleteUserAction` alongside `resetUserTwoFactorAction`.
- `beforeEach` adds: `prisma.department.findMany.mockResolvedValue([{ id: "dep_1" }])`,
  `prisma.user.update.mockResolvedValue({})`, `prisma.user.delete.mockResolvedValue({})`,
  `prisma.task.deleteMany.mockResolvedValue({ count: 0 })`, `prisma.user.count.mockResolvedValue(2)`.
- Helper `userForm(fields: Record<string, string | string[]>)`: builds FormData, `append`ing each
  array item (for `departmentIds`). Update forms always carry `userId`, `name: "Jean"`, `email`, `role`.

| # | describe / it | Setup | Expected |
|---|---|---|---|
| 1 | createUserAction — refuses a GUEST role | `name, email, password, role=GUEST` | `{ error: "Invalid role." }`; `user.create` not called |
| 2 | updateUserAction — refuses turning a member into a guest | `findUnique` → `{ role: "DEPARTMENT", email: "a@x.ch" }`; `role=GUEST` | `{ error: "Invalid role." }`; `user.update` not called |
| 3 | promotes a guest to department | `findUnique` → `{ role: "GUEST", email: "g@x.ch" }`; `role=DEPARTMENT`, `departmentIds=["dep_1"]` | `{ error: null }`; `user.update` data has `role: "DEPARTMENT"`, `departments: { set: [{ id: "dep_1" }] }`; `ensureUserEdition` called with `"guest_1"` |
| 4 | refuses promoting a guest without a department | as 3, no `departmentIds` | `{ error: "At least one department is required for department users." }`; no update |
| 5 | refuses promoting a guest straight to admin | guest; `role=ADMIN` | `{ error: "A guest can only become a department user." }`; no update |
| 6 | keeps a guest a guest | guest; `role=GUEST`, `departmentIds=["dep_1"]` | `{ error: null }`; data `role: "GUEST"`, `departments: { set: [] }`; `ensureUserEdition` not called |
| 7 | keeps the stored email spelling when unchanged | guest, stored `"Jean@X.ch"`; submitted `" jean@x.ch "` | update data `email: "Jean@X.ch"` |
| 8 | lowercases a changed email | guest, stored `"Jean@X.ch"`; submitted `"New@X.ch"` | update data `email: "new@x.ch"` |
| 9 | says so when the user no longer exists | `findUnique` → `null` | `{ error: "User not found." }`; no update |
| 10 | still refuses demoting the last admin | `findUnique` → `{ role: "ADMIN", email: "a@x.ch" }`, `count` → 1; `role=DEPARTMENT`, `departmentIds=["dep_1"]` | `{ error: "At least one admin account must remain." }`; no update |
| 11 | deleteUserAction — deletes a guest | `findUnique` → `{ role: "GUEST", email: "g@x.ch" }`; `userId=guest_1` | `{ error: null }`; `task.deleteMany` called; `user.delete` called with `{ where: { id: "guest_1" } }`; `user.count` not called |
| 12 | still refuses deleting the last admin | `findUnique` → ADMIN, `count` → 1 | `{ error: "At least one admin account must remain." }`; `user.delete` not called |

The five existing `resetUserTwoFactorAction` tests stay green unchanged.

### Docs

- `docs/auth.md`: new `### Guests in /users` right after `### Guest sign-up`: admins see guests
  (Guest badge, listed last); delete cascades their sign-ups and unavailabilities, `/events/logs` keeps
  the names; the edit form keeps a guest a guest or promotes to Department (departments required,
  default edition written), never straight to Admin; nothing ever becomes GUEST and the create modal
  never offers it; the proxy sees the new role at the guest's next sign-in (JWT role is set at sign-in;
  `getCurrentUserAccess` reads the DB); an unchanged email keeps its stored spelling; earlier guest
  sign-ups get no `STAFF_SHIFT` task on promotion.
- `docs/business-processes.md` (`/users` section): "All user accounts are created by an **admin** —
  there is no self-service signup." → members are created by an admin; guests sign up themselves from
  `/login` (link `docs/auth.md` > Guest sign-up). "an admin/department badge" →
  "an admin/department/guest badge". Add a bullet: admins can promote a guest to a department user or
  delete them (link `docs/auth.md` > Guests in /users).

### Gates

- Build, lint (0 errors, 2 pre-existing warnings), `check:design`, `check:i18n` pass.
- `npm test`: **30 files / 347 tests** (335 + 12).

### Manual pass (local DB, `SEED_DEV_FIXTURES=1 npm run db:seed`)

1. Admin, `/users` desktop: `dev-guest@baleinev.local` (and any Step 4 guest) is listed after every
   member, with a warning-tone "Guest" badge and no departments row. Same at 390px.
2. Pencil on the guest: Role offers Guest and Department, no Admin. Change the name, keep Guest, save →
   card closes, still Guest.
3. Pencil again, Role = Department, no department → "At least one department is required…". Pick one →
   Department badge + the department pill.
4. In another browser still signed in as that guest: still confined to `/events` (stale JWT). Sign out,
   sign in → member shell, `/tasks` renders, an edition is selected.
5. Register a new guest from `/login`, sign up to a shift. As admin, delete them via the pencil →
   card gone; the sign-up is gone from `/events`; `/events/logs` still shows the lines with their name.
6. Create modal: Role offers Admin and Department only.
7. Pencil on a DEPARTMENT member: Role offers Admin and Department, no Guest.
