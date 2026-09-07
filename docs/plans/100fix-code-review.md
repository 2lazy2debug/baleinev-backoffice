# 100fix — Code review of the cash-manager / POS chain

Review of the implementation of
[100-cash-manager-pos.md](done/100-cash-manager-pos.md) and its seven subplans
(101 → 107, shipped v0.34.0 → v0.40.0). This is a **code** review: schema,
migrations, server actions, data flow and permission story. UI behaviour was not
exercised and no tests were run.

## Verdict

**The chain holds together.** Every subplan landed what it said it would, in the
shape it said it would:

- The seven migrations match `schema.prisma` field for field, index for index,
  including the FK directions each plan argued for (`Restrict` on
  `moneyAccountId` / `templateId` / `cashRegisterId` / template-cell `elementId`,
  `SetNull` on every user and on `JournalEntry.cashRegisterId`).
- Money is integer rappen everywhere in code and `Decimal(10,2)` at the boundary.
  `toRappen`/`fromRappen`/`countTotal`/`makeChange` are the only arithmetic, and
  nothing re-derives them.
- `registerFigures` + `plannedEntries` are a single source for the five figures
  and the two-or-three entries, shared by the preview and the write — exactly the
  drift 106 existed to prevent.
- The journal write copies `createJournalEntryAction`'s advisory-lock discipline
  and allocates all sequence numbers under one lock.
- 107 hooks into the existing sale transaction with **one** `stockElement`
  lookup, filters custom and untracked lines, and never refuses a sale on a short
  shelf — `removeFromPlace` delegates clamping to `applyMovement`.
- Nothing from 101 dangles: no reference to `stock/items`, `ItemFormModal`,
  `CreateItemButton` or `createStockElementAction` survives.
- `npx tsc --noEmit`, `npm run check:design` and `npm run check:i18n` are clean
  (933 keys, en/fr in step). Server-action test coverage is real, not decorative
  — 90+ cases across `cash/actions.test.ts`, `pos/actions.test.ts`,
  `pos/session-actions.test.ts`, plus `lib/cash*.test.ts` and `lib/pos.test.ts`.

Docs (`business-processes.md` §12/§13, `database.md`, `file-structure.md`) were
updated inside the plans, as the ground rules asked.

What follows is what should be fixed. Nothing here is a chain-level design
mistake; they are gaps in individual steps.

---

## Step 1 — `/cash` has no page-level authorization

**Severity: must fix.** This is the only genuine hole found.

[app/app/(app)/cash/page.tsx](../../app/app/(app)/cash/page.tsx) never calls
`requireMoneyAccountManager()`. It calls `getCurrentUserAccess()` only to compute
`isAdmin(access)` for the booking button. `app/(app)/layout.tsx` guards
*authentication*, not role.

So any signed-in `DEPARTMENT` user who types `/cash` gets the whole screen: every
register in the edition, its name and cash account, both denomination sheets, the
float and closing totals, plus the edition's **budget names and cost-centre
codes** — those are loaded unconditionally for the booking modal.

Every neighbour guards its page:

- `app/(app)/money-accounts/page.tsx:16` — `await requireMoneyAccountManager()`
- `app/(app)/articles/page.tsx:19`, `pos/templates/page.tsx:21`,
  `pos/templates/[templateId]/page.tsx:23`, `pos/sessions/page.tsx:23`,
  `pos/sessions/[sessionId]/page.tsx:25` — all `await requireAdmin()`

102's step 9 only asked that `/cash` be absent from the sidebar, and the
implementation did exactly that — but hiding a nav item is not access control,
and 102's own step 7 says "the same rule that gates the action gates the link".

**Fix:** `await requireMoneyAccountManager()` as the first line of `CashPage()`,
replacing the bare `getCurrentUserAccess()` where the role is still needed for
`isAdmin`. Then move the `budgets` / `costCenters` reads behind
`isAdmin(access)` — a cash manager who is not an admin can never open the booking
modal, so there is no reason to ship them the lists.

Add a test in `app/(app)/cash/actions.test.ts`'s neighbourhood or a page-level
one, whichever fits `docs/testing.md`.

Commit.

---

## Step 2 — Stock-movement helpers are published as server actions

**Severity: must fix (low exploitability, wrong by construction).**

107 step 2 said "export both `applyMovement` and the new function so the POS can
call them inside its own transaction", and that is what
[app/app/(app)/stock/actions.ts](../../app/app/(app)/stock/actions.ts) does —
but that file starts with `"use server"`. In Next.js **every export of a
`"use server"` module becomes a callable server-action endpoint**, reachable by
action id with no authentication and no permission check inside it.

Neither is meaningfully exploitable: both take a `Prisma.TransactionClient` as
their first argument, which a remote caller cannot serialize, so a crafted call
throws on `tx.stockItem`. But the app now publishes two endpoints that exist only
so one module can call another.

**Fix:** move `applyMovement`, `addToPlace` and `removeFromPlace` into a plain
module — `app/lib/stock-movements.ts` — and import them from both
`stock/actions.ts` and `pos/session-actions.ts`. Keep the doc comments verbatim;
they are the rule ("taking out more than is there is a miscount, not an error
worth blocking on") and the rule does not move.

Update `docs/file-structure.md`'s `lib/` table with the new file, and the `/stock`
entry that currently says the helpers live in `actions.ts`.

Commit.

---

## Step 3 — Deleting a booked register's journal entry orphans the booking

**Severity: should fix.**

`deleteJournalEntryAction` in
[app/app/(app)/journal/actions.ts:98](../../app/app/(app)/journal/actions.ts)
refuses only opening entries and invoice-linked entries. It knows nothing about
`cashRegisterId`, which 106 added.

An admin can therefore delete one of the three entries a booked register wrote.
`CashRegister.journaledAt` stays set, so:

- `journalCashRegisterAction` refuses to re-book ("This register has already been
  booked."), and there is no un-book action;
- the cash account silently loses that movement, and the identity 106 asserts —
  net effect on the account is exactly `actual - float` — is no longer true;
- nothing on `/cash` shows that anything is missing; the row still says **Booked**.

106 covered "press the button twice" but not "delete what it wrote".

**Fix:** in `deleteJournalEntryAction`, after the existing checks:

```ts
if (entry.cashRegisterId) {
  throw new Error("This entry was written by a cash register closing. It cannot be deleted on its own.");
}
```

(select `cashRegisterId` in the `findUnique`). Refusing is the right call over
clearing `journaledAt`: two of the three entries would still be in the ledger,
and re-booking would double them.

Do the same in `updateJournalEntryAction` for `amount` / `accountType` /
`moneyAccountId` if that turns out to be as cheap — check it before deciding; a
re-worded label is harmless and 106 explicitly wanted `cashRegisterId` to survive
one.

Add a test next to the existing journal action tests.

Commit.

---

## Step 4 — `leavePosSessionAction` is dead code

**Severity: should fix.**

`npm run check:i18n --dead` reports `pos.leaveSession` and `pos.noSessions` as
orphaned, and the reason is real: `leavePosSessionAction`
([session-actions.ts:156](../../app/app/(app)/pos/session-actions.ts)) is
implemented and tested but **no UI calls it**. Once a seller joins, the only ways
back to the picker are joining another running session or having someone close
theirs.

104 step 3 specified the action and step 8 specified the copy; step 5's picker
description did not say where the button goes, and it never landed.

**Fix:** add a `Leave` button to `sessions-modal.tsx`, in the row for the current
session, next to the "You are here" marker — that dialog already holds join,
pause/resume and close, so leaving belongs there and nothing new is invented.
Wire it the same way `join()` is (plain async call, then `router.refresh()`).

While there, either use `pos.noSessions` as the heading above
`session-picker.tsx`'s `noSessionsHint` card, or delete the key from both
locales. A dead key in two dictionaries is how the two drift.

Commit.

---

## Step 5 — Small defects

Each is a couple of lines; one commit for the lot is fine.

1. **The count-sheet total has no label.** `Sheet()` in
   [cash/client.tsx](../../app/app/(app)/cash/client.tsx) closes with a
   `flex justify-between` row containing a *single* `<span>` — the total renders
   flush left with nothing beside it. `denomination-counter.tsx`'s footer does it
   correctly (`{copy.total}` then the amount); copy that shape.

2. **`CashPage` says the same word twice.** `<PageHeader eyebrow={copy.cash.title}
   title={copy.cash.title}>` — every other screen in the chain pairs an app
   eyebrow with a screen title (`copy.pos.title` / `copy.pos.templatesTitle`).
   Either drop the eyebrow or give the screen its own title key.

3. **Modal action state is not reset between rows.** `JournalRegisterModal` and
   `CloseRegisterModal` are rendered once for the whole list and driven by a
   `register` prop, but their `useActionState` is not keyed to it: an error from
   register A is still on screen when the dialog reopens on register B.
   `CloseRegisterModal` already resets its *sheet* with the `sheetFor` /
   render-time-reset pattern — apply the same idea to the error, or key the inner
   form on `register.id`.

4. **Double-tap can fire two joins.** `SessionPicker.join()` awaits the action
   before starting the transition, so `pending` is `false` for the whole
   round-trip and the button stays live. `SessionsModal` gets this right with its
   own `joinPending` state — do the same in the picker.

5. **The session's stock place is invisible on a phone.**
   `pos/sessions/[sessionId]/page.tsx:99` puts it in `<PageHeader description>`,
   which `CLAUDE.md` makes desktop-only. 107 step 4 asked that it show "wherever a
   session is described". Move it into the summary band (a `<Card>` beside the
   per-method ones) or into the client list header.

6. **`leavePosSessionAction` calls `resolveWritableEditionId()`.** Closing an
   edition would leave every seller stuck in their session with no way out.
   Leaving writes only `User.selectedPosSessionId`, which is not edition data —
   drop the call (joining is arguable; leaving is not).

Commit.

---

## Not defects — recorded so the next reader does not re-litigate them

- **A sale's `unitPrice` comes from the client and is never checked against the
  template cell.** This is 104's design, not a slip: the custom-sale tile takes an
  arbitrary amount, so the attack surface is identical either way, and the till is
  operated by trusted staff. Worth one sentence in `docs/business-processes.md`
  §13 "Selling", which currently says only that "the server recomputes the total"
  — true of the *total*, not of the unit prices it is recomputed from.
- **`access.role === "ADMIN"` in `pos/page.tsx` instead of `isAdmin(access)`.**
  The repo does this in a dozen places already; not this chain's problem.
- **`OpenSessionModal` renders a `<Modal>` inside `SessionsModal`'s `<Modal>`.**
  Both portal to `<body>` and the inner one paints on top; nesting is deliberate
  so a seller can spin up a till without leaving the one they are on.
- **`User_selectedPosSessionId_idx` exists in both the migration and
  `schema.prisma:148`.** No drift.
- **`journaledAt` figures are computed at page render and re-read in the action.**
  They cannot diverge: booking refuses unless every session on the register is
  `CLOSED`, so no sale can land in between.

---

## Release

Steps 1–3 are behaviour changes with no schema change; 4 and 5 are UI. One
release at the end covering all of them, directive **`non-breaking`**, per the
release protocol in [100-cash-manager-pos.md](done/100-cash-manager-pos.md).
