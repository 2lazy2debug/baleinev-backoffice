# 017b — The journal books against a budget

**Read [017-budget-department-improvement.md](017-budget-department-improvement.md)
first** — the target model, the rules, the conventions, the delegation policy and
the release protocol live there. Then work from that file and this one only. Do
not read 017a, 017c or 017d; their context is not yours.

**Runs after 017a**, which has already renamed `JournalEntry.departmentId` to
`budgetId` in the schema and applied the migration. If
`app/lib/budgets.ts` does not exist yet, 017a is not done — stop.

## What this phase does

A journal entry no longer carries a department. It carries a **budget**. This is
the widest mechanical swap in the plan and it is exactly that: a swap. **No screen
changes shape** — same table, same columns, same modal, same filters. One concept
replaces another.

Expense reports keep their department. Do not touch them.

**Do not tag and do not push.** The build stays red until 017d.

---

## Step 1 — Inventory first

`app/components/journal-table.tsx` is 878 lines and about a dozen of them name a
department. Do not read it end to end — **delegate the inventory** (see the
master's delegation section):

```
Agent(subagent_type: "Explore"):
  "In /home/mcabras/Developer/baleinev-backoffice/app, list every file:line in
   components/journal-table.tsx, components/add-journal-entry-modal.tsx and
   app/(app)/journal/ (recursively) that references department, departmentId,
   departmentName, uniqueDepartments or departments — with the one-line context
   of each. Group by file. Change nothing."
```

Work from that list. It is the checklist for this whole phase.

---

## Step 2 — The picker's data

File: `app/app/(app)/journal/page.tsx`

- `budgetingDepartments()` → the **budgets of the active edition** (`id`, `name`),
  ordered by name.
- **The picker offers every budget of the edition, not the visible subset.** Only
  admins may write a journal entry, and the journal table already shows every entry
  of the edition to everyone. Do not add a second visibility rule here —
  `visibleBudgetsWhere` belongs to the budget app.
- The entries query: `include: { department: { select: { name: true } } }` →
  `include: { budget: { select: { name: true } } }`, and the mapped
  `departmentId: entry.departmentId ?? null` → `budgetId: entry.budgetId ?? null`.
- The expense-report prefill currently passes `prefillExpenseReport.departmentId`
  straight through. It becomes
  `await resolveDefaultBudgetForDepartment(activeEdition.id, prefillExpenseReport.departmentId)`
  from `@/lib/budgets`, which may be `null` — the picker then opens empty and the
  admin chooses. **Do not guess a budget.** The expense report itself keeps its
  `departmentId`; only what the journal entry is booked against changes.

Commit.

---

## Step 3 — The client and the modal

- `app/app/(app)/journal/client.tsx` — the `departments` prop becomes `budgets`;
  `department` / `departmentId` on the entry type become `budget` / `budgetId`;
  the prefill's `departmentId` becomes `budgetId`.
- `app/components/add-journal-entry-modal.tsx` — the `departments` prop, the
  `name="departmentId"` field, and the `<Field label="Department *">` become the
  budget. That label is a **hardcoded English string** today: put it on
  `copy.budget` while you are in there, and the placeholder option on
  `copy.selectBudget`.

Commit.

---

## Step 4 — The table

File: `app/components/journal-table.tsx`

Rename, in place, every site the inventory found:

- the column header (`copy.department` → `copy.budget`);
- the `filters.department` text filter and the `uniqueDepartments` option list it
  builds — both become the budget name;
- the `"department"` case in the sort switch;
- the inline-edit `<Select>` and the bulk-edit draft field
  (`departmentId` → `budgetId`, the `departments` prop → `budgets`);
- `row.departmentName` → `row.budgetName`;
- the mobile `CardletField` label, in both the read and the edit branch.

**The desktop table and the mobile cardlets must keep reading the same array.**
They do today; a rename must not split them into two mappings.

Commit.

---

## Step 5 — The actions

File: `app/app/(app)/journal/actions.ts`

- `createJournalEntryAction`: `departmentId` → `budgetId`, and
  `assertDepartmentsBudget([departmentId])` → `assertBudgetInEdition(budgetId,
  editionId)` from `@/lib/budgets`.
- `updateJournalEntryAction`: the same swap.
- The bulk update: `readRequired("departmentId")` → `readRequired("budgetId")`,
  and validate **every distinct budget id** in the payload against the edition
  before the transaction — the same place `assertDepartmentsBudget` was called.

Everything else in these actions — the advisory lock around sequence allocation,
the opening-entry guard, the linked-invoice guard, the `revalidatePath` list — is
unchanged. Do not refactor it.

Commit.

---

## Step 6 — The single-entry edit page

Files: `app/app/(app)/journal/[journalEntryId]/page.tsx` and `edit-form.tsx`

`budgetingDepartments()` → the edition's budgets; the `departments` prop → `budgets`;
the `<Select name="departmentId">` → `name="budgetId"` with `copy.budget` /
`copy.selectBudget`. This page is where a phone edits an entry, so the field keeps
its full-width `<Field>` shape — do not compact it.

Commit.

---

## Step 7 — Copy

File: `app/lib/i18n-dictionaries.ts`, the `journal` block of **both** `en` and `fr`.

Rename `department` → `budget` and `selectDepartment` → `selectBudget` rather than
leaving dead keys behind. English: `Budget` / `Pick a budget`. French: `Budget` /
`Choisis un budget`.

If any other phase has already added a `journal.budget` key, reuse it — do not
create a second.

Commit.

---

## Step 8 — Verify

**Delegate the mechanical half**, in one message, in parallel:

- an agent running `npm run lint` and `npm run build` from `app/`, reporting the
  failures with `file:line` — **expect failures from the budget app, the dashboard
  and the import scripts**; those belong to 017c and 017d. What must be clean is
  everything under `app/(app)/journal/` and `components/journal-*`;
- an agent listing every remaining `file:line` under `app/(app)/journal/` and
  `app/components/journal-table.tsx` / `add-journal-entry-modal.tsx` that still
  says `department`.

The second must come back empty. Relay both results yourself.

Then check by hand, against the local database:

- The journal lists every entry with its budget name, and pre-migration entries
  still show one.
- Creating an entry against a budget lands it on that budget.
- The column filter, the sort and the bulk edit all work on the budget.
- Converting an approved expense report: a department attached to one budget
  prefills it; a department attached to two leaves the picker empty and required.

Commit anything this changed. Then stop — **no tag, no push.** 017d releases.
