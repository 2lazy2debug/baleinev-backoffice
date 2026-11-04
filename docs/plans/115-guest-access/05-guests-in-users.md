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
