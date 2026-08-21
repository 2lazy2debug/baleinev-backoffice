# Unified Create Pattern — Design Rationale

## Current state audit

| App | Where the button sits today | What creating opens | What changes |
|---|---|---|---|
| Tasks (todo) | Header, top-right | Modal | Nothing — this is the model |
| Expense Reports | No button — form always sits beside the history | Inline form | Both |
| Events | No button — form always sits above the list | Inline form | Both |
| Calendar | No button — form always sits below the month view | Inline form | Both |
| Money Accounts | No button — form always sits in a side column | Sidebar form | Both |
| Cost Centers | No button — form always sits in a side column | Sidebar form | Both |
| Users | No button — form always sits in a side column | Sidebar form | Both |
| Invoices | Below the header, left-aligned | Modal | Position only |
| Passwords | Next to the search field | Modal | Position only |
| Budget (add department) | Header, top-right — hidden on mobile | Modal | Show it on mobile too |
| Journal | Above the table, left-aligned | Modal | Excluded from this pass |
| Dashboard | — | — | Excluded — no create action |

## The rule

**1. Desktop create is always a modal, opened from the header's top-right.**
Every "create X" opens the existing `Modal`, triggered by a button in `PageHeader`'s `actions` slot — the exact slot Tasks and Budget's "Add department" already use. Inline create forms (Expense Reports, Events, Calendar) and sidebar create columns (Money Accounts, Cost Centers, Users) move their fields into that same modal. The page body is left with one thing: the list.

**2. Mobile reuses the same trigger and the same modal — no separate tab.**
The header button moves into the mobile top bar next to the title. Tapping it opens the same `Modal`, which already renders full-screen below `sm` via `mobileFullScreen`. Expense Reports' mobile-only Create/History tab strip is removed entirely: once creating is a modal, there's nothing left to switch to.

**3. Permission gating still hides the button — the same way, on both breakpoints.**
Whatever already decides who can create (`WritableEditionOnly`, `canManageEvents`, `isReadOnly`) keeps deciding it — the button just isn't in the header when they can't. A department user on Events, or anyone in a closed edition, sees the same header on a phone as on a laptop: title, no button, list.

## Applying it app by app

| App | Before | After |
|---|---|---|
| Tasks | Header button → modal | Unchanged |
| Expense Reports | Form beside history; mobile Create/History tabs | Header button → modal; tabs removed |
| Events | Full-width create card above the list (admin only) | Header button → modal, same `canManageEvents` gate |
| Calendar | Full-width create card below the month/day view (admin only) | Header button → modal, next to "Calendar" |
| Money Accounts | Form in a permanent side column | Header button → modal; page body is just the account cards |
| Cost Centers | Form in a permanent side column | Header button → modal |
| Users | Form in a permanent side column | Header button → modal |
| Invoices | Already a modal, button below the header | Move the button into the header's `actions` slot — no other change |
| Passwords | Already a modal, button beside search | Add a `PageHeader`, button in `actions`, search moves to `controls` |
| Budget | Already a modal, header button hidden below `sm` | Drop the mobile hide — same button, every breakpoint |
| Journal | Excluded — kept as-is | — |
| Dashboard | Excluded — no create action exists | — |

See `example-implementation.md` for Expense Reports converted end-to-end.
