# 017 — Budgets and departments become many-to-many (master)

[014-departments-expansion](done/014-departments-expansion.md) left one budget
welded to one department: `DepartmentBudget` is a `(editionId, departmentId)` pair
and a journal entry books against a *department*. That is too tight. What the
association plans is a **budget** — a named envelope inside an edition — and a
department may watch several of them while a budget may be shared by several
departments, or by none at all.

**This file is the shared context: the target model, the rules, the conventions,
the delegation policy and the release protocol.** Read it once, then read *one*
subplan and work from those two only. Do not read the other subplans — that is
what this split exists to avoid.

| Subplan | What it does | Runs after |
|---|---|---|
| [017a — Model and migration](017a-budget-model-migration.md) | `schema.prisma`, the hand-written migration that repoints live financial data, and the server helpers | — |
| [017b — The journal books against a budget](017b-journal-books-budgets.md) | The widest mechanical swap: journal screens, table, modal, actions | 017a |
| [017c — The budget app](017c-budget-app.md) | Create/edit/delete a budget, attach departments, one card per budget | 017a |
| [017d — Rollout and release](017d-rollout-and-release.md) | Dashboard, editions, carry-over, import scripts, departments guard, copy sweep, docs, verification, the tag | 017a–c |

**These are ordered phases, not independent plans.** 017b and 017c may be done in
either order, or in parallel by two agents, once 017a is in.

---

## The target model

```
Department  1 ──n  BudgetDepartment  n ── 1  Budget  ──n  BudgetLine
                                              │
                                              └──n  JournalEntry
```

- A **budget** has a name, belongs to one edition, holds the budget lines, and is
  created by hand in the budget app — "pick a department, or don't".
- **`BudgetDepartment` carries no money.** It exists so a person in a department
  can see the budgets that concern them. Attaching or detaching a department moves
  nothing and destroys nothing.
- **Journal entries book against a budget, not a department.** This is the change
  with the widest reach and it is deliberate: the financial weight sits entirely on
  the budget, and the department is only a lens onto it.
- **A budget with no department is visible to admins only** — it belongs to nobody
  in particular, and a non-admin keeps seeing exactly the budgets of their own
  departments.
- **`Department.hasBudget` survives, with a smaller job**: it is the filter for
  which departments may be *attached* to a budget. It no longer opens or closes
  anything by itself.
- **Expense reports keep their department** (`ExpenseReport.departmentId`) and are
  not touched. Nor are passwords, appointments, tasks or users.

### What it replaces

| Before | After |
|---|---|
| `DepartmentBudget (editionId, departmentId)` | `Budget (editionId, name)` |
| `BudgetLine.departmentBudgetId` | `BudgetLine.budgetId` |
| `JournalEntry.departmentId` | `JournalEntry.budgetId` |
| `Edition.departmentBudgets` | `Edition.budgets` |
| `resolveDepartmentBudgetId()` | gone — budgets are created explicitly |
| `assertDepartmentsBudget()` | `assertBudgetInEdition()` in `lib/budgets.ts` |

---

## Where the old model is wired in

The complete blast radius, measured before the split. Nothing outside this list
reads a department budget or a journal entry's department — cost centres, money
accounts and invoices do not.

| File | Owned by |
|---|---|
| `app/prisma/schema.prisma`, `app/prisma/migrations/` | 017a |
| `app/lib/departments.ts`, `app/lib/budgets.ts` (new) | 017a |
| `app/app/(app)/journal/{page,client,actions}.tsx/.ts` | 017b |
| `app/app/(app)/journal/[journalEntryId]/{page.tsx,edit-form.tsx}` | 017b |
| `app/components/journal-table.tsx`, `app/components/add-journal-entry-modal.tsx` | 017b |
| `app/app/(app)/budget/{page,client,actions}` + new modals | 017c |
| `app/app/(app)/page.tsx` (dashboard) | 017d |
| `app/app/(app)/editions/{page,client}.tsx` | 017d |
| `app/lib/edition-carry-over.ts` | 017d |
| `app/scripts/import-{workbook,budget,bank-statement}.ts` | 017d |
| `app/app/(app)/departments/actions.ts` | 017d |
| `app/lib/i18n-dictionaries.ts` | each phase adds its own keys; 017d sweeps |
| `docs/{database,business-processes,file-structure}.md` | 017d |

**The build is red between 017a and 017d. That is expected.** The renames land in
017a and their call sites are fixed across 017b–017d. Commits in between are
checkpoints; nothing deploys until a tag is pushed, and the only tag in this plan
is in 017d.

---

## Ground rules — every subplan

- **Read `CLAUDE.md` first and obey it literally.** In particular: every "create X"
  is a header button plus a modal — there is now a *create budget* flow and it
  takes that shape, on both breakpoints, with the permission check wrapped around
  the button. `npm run check:design` must pass.
- **Reuse before you write.** `Chip`, `MultiSelect`, `Modal`, `Card`, `Table`,
  `CardletList`, `Field` all exist in `app/components/ui/`.
  `app/app/(app)/departments/` is the closest working model for a
  create/edit/delete trio — read it before writing the budget one.
- **One commit per step**, `git add . && git commit -am "<what you did>"`. No
  branches.
- **Server actions throw English sentences.** Only UI copy goes through
  `app/lib/i18n-dictionaries.ts`, and it goes into **both** `en` and `fr`.
- Work against the local database — `CLAUDE.md` says it holds no production data.
- Migrations in this repo are **hand-written SQL**, never `prisma migrate dev`.
  `app/prisma/migrations/20260903090000_departments_expansion/migration.sql` is
  the house style and the closest precedent.

---

## Delegating to subagents

This refactor is big, and most of the *checking* needs none of the reasoning
above. Hand a subagent anything verifiable from its own instructions alone, and
keep the reply small — ask for a verdict and a `file:line` list, never a file
dump. Run independent checks in parallel in one message.

**Delegate:**

- Build and lint runs: `npm run lint`, `npm run check:design`, `npm run build`
  from `app/`, reporting each failure verbatim with `file:line`.
- Stale-identifier sweeps: "list every `file:line` under `app/` still referencing
  `departmentBudget`, `DepartmentBudget` or `departmentBudgetId`".
- Call-site inventories before a rename: "read
  `app/components/journal-table.tsx` and list every `file:line` referencing
  `department`, `departmentId`, `departmentName` or `uniqueDepartments`, with the
  one-line context of each. Change nothing."
- SQL invariant checks against the local database, given the exact queries.
- Dictionary parity: "list keys present in the `en` `budget` block and missing
  from the `fr` one, and vice versa".
- A docs contradiction sweep: "grep `docs/` for sentences claiming a journal entry
  carries a department, and list them with `file:line`".

**Never delegate:** the migration SQL, the visibility rule, the screen and modal
shapes, anything that has to honour `CLAUDE.md`'s design system, or the release
step. A subagent starts cold and has not read any of it.

A subagent's report is not shown to the user — relay what matters yourself.

A shape that works:

```
Agent(subagent_type: "general-purpose", run_in_background: false):
  "In /home/mcabras/Developer/baleinev-backoffice/app run, in order:
   npm run lint, npm run check:design, npm run build.
   Report for each: pass/fail, and on failure the exact error lines with
   file:line. Do not fix anything. Do not read files unless an error names one."
```

---

## Release protocol — 017d only

017a, 017b and 017c **do not tag and do not push**. They commit locally and stop.

Never hardcode a version. Read the latest tag and go one **minor** step up:

```bash
cd /home/mcabras/Developer/baleinev-backoffice
git tag --sort=-v:refname | head -1        # e.g. v0.28.4  ->  NEXT = v0.29.0
```

1. Set `app/package.json` `"version"` to `NEXT` without the leading `v`.
2. `git commit -am "chore(release): bump version to <NEXT without v>"`
3. `git tag -a <NEXT> -m "requires-migration"` — **mandatory.** The tag message is
   the only place the box learns a migration has to run; `non-breaking` would
   deploy this code against the old schema and the app would throw at runtime, not
   at build time.
4. `git push origin main --follow-tags`

**Do not monitor the deployment.** The updater timer picks the tag up within about
two minutes, snapshots the database first, runs `prisma migrate deploy`,
health-checks, and restores the snapshot if the deploy fails. Do not poll
`journalctl`, do not ssh to the box, do not loop on `/api/health`. Push the tag and
report what you shipped.

The tag vocabulary and what the pipeline guarantees are in `docs/production.md`.

---

## When all four are done

Move this file and the four subplans to `docs/plans/done/`, keeping the names.
