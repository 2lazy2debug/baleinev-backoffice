# Handoff: Unified Create Pattern

Standardizes how every app triggers and contains its "create" action. This does not touch the mobile-responsive layout work (already implemented) — it only changes where create buttons live and what they open.

## The rule

1. **Desktop:** every create action opens the existing `Modal` from a button in `PageHeader`'s `actions` slot (top-right, next to the title). No inline form beside/above/below a list, no sidebar create column.
2. **Mobile:** the same button sits in the mobile top bar next to the title (`PageHeader` already renders `actions` there below `lg`) and opens the same `Modal`, which already goes full-screen below `sm` via `mobileFullScreen`. No separate Create/History tab strip — once creating is a modal there is nothing to switch to.
3. **Permission gating** (`WritableEditionOnly`, `canManageEvents`, `isAdmin`, `isReadOnly`, etc.) keeps deciding who sees the button — same logic, same place, on both breakpoints.

## Reference implementation

`components/tasks-create-modal.tsx` + `app/(app)/tasks/page.tsx` already do exactly this — a client component holding a `Button` + `Modal` pair, passed into `PageHeader actions`. Match that file's shape, not prose descriptions, whenever the two disagree.

## Scope

| Action | Apps |
|---|---|
| Convert (inline/sidebar form → modal) | Expense Reports, Events, Calendar, Money Accounts, Cost Centers, Users |
| Reposition only (already a modal, wrong trigger placement) | Invoices, Passwords, Budget |
| Already correct — no change | Tasks |
| Excluded from this pass | Journal (kept as-is, more internal complexity than this pass should touch), Dashboard (no create action) |

## Files in this handoff

- `proposal.md` — full rationale: current-state audit of every app, the rule, and a before/after table for every app in scope.
- `example-implementation.md` — Expense Reports converted end-to-end (the highest-complexity case: side-by-side desktop form + mobile Create/History tabs). Copy this shape for the rest of the apps in scope.
- `CLAUDE.md` — merge into the repo's root `CLAUDE.md` (or drop in if none exists) so the rule holds for apps built after this pass.
