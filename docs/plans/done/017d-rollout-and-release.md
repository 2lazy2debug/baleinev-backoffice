# 017d — Rollout and release

**Read [017-budget-department-improvement.md](017-budget-department-improvement.md)
first** — the target model, the rules, the conventions, the delegation policy and
the release protocol live there. Then work from that file and this one only. Do
not read 017a–017c; their context is not yours. What they left behind is
compile errors in the files listed below, and this phase is the list.

**Runs last.** If `npm run build` still fails inside `app/(app)/journal/` or
`app/(app)/budget/`, 017b or 017c is not done — stop and say which.

## What this phase does

Fixes every remaining reader of the old model, updates the departments guard and
the docs, verifies the whole thing end to end, and **ships it**. This is the only
phase in 017 that tags.

---

## Step 1 — Find what is left

**Delegate the sweep** (see the master's delegation section):

```
Agent(subagent_type: "Explore"):
  "In /home/mcabras/Developer/baleinev-backoffice/app, list every file:line
   referencing any of: departmentBudget, DepartmentBudget, departmentBudgetId,
   assertDepartmentsBudget, resolveDepartmentBudgetId. Also list every file:line
   where a journalEntry query, type or object literal still uses departmentId or a
   department relation. Exclude node_modules and prisma/migrations. Report the
   list grouped by file. Change nothing."
```

It should come back with the five areas in steps 2 and 3 and nothing else. If it
names a file neither this plan nor 017b/017c owns, say so before touching it.

---

## Step 2 — The readers

- **`app/app/(app)/page.tsx` (dashboard)** — `activeEdition.departmentBudgets` →
  `budgets`; each row named by `budget.name` instead of `budget.department.name`.
  Actuals come from `budget.journalEntries` directly, so the two `filter` passes
  over `activeEdition.journalEntries` collapse into one sum over the budget's own
  entries. The totals row and the `TFoot` are unchanged.
- **`app/app/(app)/editions/page.tsx` and `client.tsx`** —
  `_count.departmentBudgets` → `_count.budgets`, and the label beside it says
  budgets, not departments (`copy.editions.budgets`, a new key in `en` and `fr`).
- **`app/lib/edition-carry-over.ts`** — carries `budgets` instead of
  `departmentBudgets`. It must copy the **name** and re-create the
  `BudgetDepartment` attachments in the new edition, then the lines with their
  `createdAt` preserved — the existing comment explains why that ordering matters.
  A budget with no lines is still skipped, as today.

Commit.

---

## Step 3 — The import scripts

- **`app/scripts/import-workbook.ts`** — creates a `Budget` per department name in
  the edition, attaches the department, and points the imported journal entries at
  the budget instead of the department. Its reset step deletes `budgetLine` by
  `{ budget: { editionId } }` and then `budget` by `{ editionId }`.
- **`app/scripts/import-budget.ts`** — upserts the budget by `(editionId, name)`
  rather than `(editionId, departmentId)`.
- **`app/scripts/import-bank-statement.ts`** — `departmentId: null` → `budgetId:
  null` in both places, and its comment about "both update actions require a
  department" becomes "require a budget".

These are not run by the app and are not covered by the type-check the same way
screens are — read each one's surrounding logic before editing, and do not
"simplify" an importer while you are in there.

Commit.

---

## Step 4 — The departments screen

File: `app/app/(app)/departments/actions.ts`

- `updateDepartmentAction`: turning `hasBudget` off no longer deletes anything. It
  is still **refused** while `departmentBudgetUsage` says the department is
  attached to a budget holding lines or journal entries — hiding live money from a
  team is what that rule always protected against — and otherwise it detaches the
  department from every budget
  (`prisma.budgetDepartment.deleteMany({ where: { departmentId } })`).
- `deleteDepartmentAction`: unchanged in shape; it reads the rewritten
  `departmentBudgetUsage`.
- `copy.departments.hasBudgetHint` in `en` and `fr` now says what the flag means:
  the department can be attached to budgets.

The screen itself, its table, its cardlets and its modals do not change.

Commit.

---

## Step 5 — Copy sweep

**Delegate** two checks in one message:

- keys present in the `en` `budget` / `journal` / `editions` / `departments` blocks
  and missing from the `fr` ones, and vice versa;
- every `file:line` under `app/` still reading `copy.journal.department` or
  `copy.journal.selectDepartment`.

Fix what they find. The second must come back empty — those keys were renamed, not
kept.

Commit.

---

## Step 6 — Docs

`CLAUDE.md`: *"Never let docs diverge from the actual implementation."*

- **`docs/database.md`** — the ER overview and the Models section: `Budget`,
  `BudgetDepartment`, `BudgetLine.budgetId`, `JournalEntry.budgetId`, and the
  reduced role of `Department.hasBudget`. Delete `DepartmentBudget`.
- **`docs/business-processes.md` §2 Budget Management** — rewritten: budgets are
  created by hand, named, attached to zero or more departments, and the attachment
  is visibility only. Say that a budget with no department is admin-only.
- **`docs/business-processes.md` §3 Journal Entries** — an entry books against a
  budget and no longer carries a department; expense reports still do.
- **`docs/file-structure.md`** — the new files under `/budget` and `lib/budgets.ts`.

A useful delegation before you write:

```
Agent(subagent_type: "Explore"):
  "In /home/mcabras/Developer/baleinev-backoffice/docs, list every file:line whose
   sentence claims a journal entry carries a department, or that a department owns
   a budget, or that names DepartmentBudget. Report the list with the sentence.
   Change nothing."
```

Commit.

---

## Step 7 — Verify the whole thing

**Delegate** the build and the sweeps, in one message, in parallel:

- `npm run lint`, `npm run check:design`, `npm run build` from `app/` — all three
  must now pass, with **no** expected failures left;
- the stale-identifier sweep from step 1, which must come back empty.

Relay both results yourself, faithfully. If something fails, say so with the
output — do not report a green build you did not see.

Then, against the local database, do the pass that needs the whole picture:

- **The numbers are unchanged.** Compare the dashboard's budgeted and actual
  totals against the figures captured before the migration. They must match. A
  difference is data lost in the migration, not a rounding artefact.
- Every pre-migration journal entry still shows a budget.
- Book a journal entry against a budget → it lands in that budget's actuals and
  nowhere else.
- A department attached to two budgets sees two cards and no double-counted total.
- Convert an approved expense report: one budget prefills, two leaves the picker
  empty and required.
- Delete a budget holding a line → refused. Empty it → it goes.
- Turn `hasBudget` off on a department attached to a budget with lines → refused.
- Carry an edition over → the budgets arrive with their names, their attachments
  and their lines in the order they were planned.
- 390px viewport: the create button in the top bar, the modal full-screen, the
  cards reading as roll-ups and cardlets.

Commit anything this changed.

---

## Step 8 — Release

Follow **Release protocol** in
[017-budget-department-improvement.md](017-budget-department-improvement.md).

Directive: **`requires-migration`** — mandatory. The tag message is the only place
the box learns a migration has to run; `non-breaking` would deploy this code
against the old schema and the app would throw at runtime, not at build time.

**Do not monitor the deployment.** Push the tag and report what you shipped.

Then move `017-budget-department-improvement.md` and all four subplans to
`docs/plans/done/`, keeping their names.
