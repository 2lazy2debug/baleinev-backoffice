# Design system rule: create actions

Every "create X" action in this app follows one pattern. Do not add a new inline create form, sidebar create column, or per-app tab strip for creating — even for a brand-new app.

1. **Desktop:** the create form lives inside the existing `Modal` component, opened by a button placed in `PageHeader`'s `actions` prop (top-right, next to the title).
2. **Mobile:** the same button and the same `Modal` are reused as-is — `PageHeader actions` already renders in the mobile top bar, and `Modal` already goes full-screen below `sm` via `mobileFullScreen`. Never build a separate mobile Create/History tab or a mobile-only create screen.
3. **Permission gating:** whatever already decides who can create (`WritableEditionOnly`, a `canManageX` check, `isReadOnly`) hides the button — identically on both breakpoints. Never show the button on one breakpoint and hide it on the other.

Reference implementation: `components/tasks-create-modal.tsx` used from `app/(app)/tasks/page.tsx`. A new app's create flow should be a client component shaped exactly like `TasksCreateModal` (a `Button` + `Modal` pair reading its own `useActionState`), passed into `PageHeader actions`.

Full rationale and the per-app before/after: see `proposal.md` next to this file.

**Landed.** The rule now lives in the repo's root `CLAUDE.md`; this folder is the record of how it got there.
