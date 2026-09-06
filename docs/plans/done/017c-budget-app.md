# 017c — The budget app

**Read [017-budget-department-improvement.md](017-budget-department-improvement.md)
first** — the target model, the rules, the conventions, the delegation policy and
the release protocol live there. Then work from that file and this one only. Do
not read 017a, 017b or 017d; their context is not yours.

**Runs after 017a**, which has already created `Budget`, `BudgetDepartment` and
`app/lib/budgets.ts`. If that file does not exist, 017a is not done — stop.

## What this phase does

`/budget` stops being one card per department that happens to budget, and becomes
one card per **budget**: a named envelope you create by hand, attach zero or more
departments to, and plan lines in. Its actuals are its own journal entries.

This is the design-heavy phase. `CLAUDE.md` governs it — in particular: **every
"create X" is a header button and a modal**, the same button and the same modal on
both breakpoints, with the permission check wrapped around the button.

**Do not tag and do not push.** The build stays red until 017d.

---

## Step 1 — The actions

File: `app/app/(app)/budget/actions.ts`

The three existing budget-line actions stay, with two edits:
`departmentBudgetId` → `budgetId`, and `resolveDepartmentBudgetId(editionId,
departmentId)` — which no longer exists — replaced by the `budgetId` that now
comes straight from the form. `requireEditionBudgetLine` guards it against
`{ budget: { editionId } }`.

Three new actions, all `requireAdmin()` + `resolveWritableEditionId()`:

- **`createBudgetAction`** — a required `name`, and `departmentIds` (zero or more,
  `formData.getAll("departmentIds")`). Refuse a duplicate name in the edition with
  a sentence rather than letting the unique index speak:
  `"A budget called X already exists in this edition."` Refuse a department that is
  not `hasBudget`. Create the `Budget` and its `BudgetDepartment` rows in one
  nested `create`.
- **`updateBudgetAction`** — the same checks; renames, and replaces the attachment
  set (`deleteMany` then `createMany`, in one transaction). **Detaching is always
  allowed** — it takes nothing away from the budget, it only stops a team seeing it.
- **`deleteBudgetAction`** — refused while the budget holds budget lines or journal
  entries: `"This budget still holds budget lines or journal entries. Empty it
  before deleting it."` An empty budget goes, taking its attachments with it by
  cascade. This action is what stands in for the `Restrict` the schema deliberately
  does not have.

All three revalidate `/budget`, `/journal` and `/`.

Commit.

---

## Step 2 — The page

File: `app/app/(app)/budget/page.tsx`

It stops querying departments and queries budgets:

```ts
prisma.budget.findMany({
  where: visibleBudgetsWhere(access, activeEdition.id),   // from @/lib/budgets
  orderBy: { name: "asc" },
  include: {
    departments: { include: { department: { select: { id: true, name: true } } } },
    budgetLines: { orderBy: [{ accountType: "asc" }, { createdAt: "desc" }] },
    journalEntries: { orderBy: [{ date: "desc" }, { sequenceNumber: "desc" }] },
  },
})
```

**The second query over `journalEntry` disappears entirely.** Actuals are now the
budget's own entries, so there is nothing left to match up by department id — and
nothing that could double-count a department sitting in two budgets.

The page also loads `budgetingDepartments()` for the create/edit pickers (admins
only) and keeps passing `canManage` as it does today. The "no edition selected"
`EmptyPage` branch is unchanged.

**The visibility rule is `visibleBudgetsWhere` and nowhere else.** Do not filter
again in the client.

Commit.

---

## Step 3 — The cards

File: `app/app/(app)/budget/client.tsx`

Rename the types: `DepartmentItem` → `BudgetItem { id, name, departments: {id,
name}[], budgetLines, journalEntries }`, `DepartmentSummary` → `BudgetSummary`.

**`AccountSection`, `BudgetRollup`, the details modal and the mobile cardlets are
otherwise unchanged.** They already read a section object rather than a department,
and the comment explaining that actuals are a section-level fact stays true — a
journal entry carries a CHARGES/PRODUITS type, never a line. Do not redesign them.

What changes on the card:

- The header shows the budget name in `<SectionTitle>` and, under it, its
  departments as `<Chip>`s. No department → `copy.budget.noDepartment` in
  `text-sm text-[var(--muted)]`. Do not invent a badge tone for it.
- The desktop-only action cluster gains, for `canManage`: a `Pencil` opening the
  edit modal and a `Trash2` opening a confirm modal, beside the existing `Eye` and
  `Plus`. Keep the cluster `hidden … sm:flex` as it is — this pass does not change
  which breakpoint manages budgets.
- Empty state, in the existing `<Card span="full" dashed>`: admin →
  `copy.budget.noBudgets` ("No budget yet. Create the first one."); non-admin →
  `copy.budget.noVisibleBudgets` ("No budget is shared with your departments yet.").
  Empty states give direction, not mood.

Commit.

---

## Step 4 — Creating a budget

Two new files, modelled on `app/app/(app)/departments/` — **read
`create-department-modal.tsx` and `department-form-fields.tsx` first.**

`app/app/(app)/budget/budget-form-fields.tsx` — the fields create and edit share,
so they cannot drift into two:

- `<Field label={copy.budgetName}>` + `<Input name="name" required autoFocus>`.
- `<Field label={copy.budgetDepartments}>` +
  `<MultiSelect name="departmentIds">` over the budgeting departments, with
  nothing preselected on create. **Selecting none is valid** — that is the whole
  point of the plan.
- A hint under it, `copy.budgetDepartmentsHint`: attaching a department only lets
  that team see the budget. Name things by what they do.

`app/app/(app)/budget/create-budget-modal.tsx` — `Button variant="primary"
icon={<Plus />} compactOnMobile`, `<Modal size="sm" mobileFullScreen>`, the submit
button in the modal `footer` reaching the form by `form="create-budget-form"`,
`useActionState`, and `useCloseOnSuccess` so the dialog shuts when the action
returns without an error.

The page header lives inside `BudgetPageClient`, so render the button there,
**gated on `canManage`, identically on both breakpoints**. Permission decides who
sees it; never the viewport. There is no inline create form and no Create/History
tab strip — `CLAUDE.md` is explicit, and the rationale is in
`docs/plans/done/009_unified_create_pattern/`.

Edit reuses `budget-form-fields.tsx` in its own `<Modal>`, prefilled, exactly as
the departments screen does.

Commit.

---

## Step 5 — Copy

File: `app/lib/i18n-dictionaries.ts`, the `budget` block of **both** `en` and `fr`.

New keys, at least: `createBudget`, `createBudgetTitle`, `createBudgetButton`,
`budgetName`, `budgetDepartments`, `budgetDepartmentsHint`, `noDepartment`,
`editBudget`, `deleteBudget`, `deleteBudgetBlocked`, `noBudgets`,
`noVisibleBudgets`.

Follow the copy rules in `CLAUDE.md`: name things by what they do, no labels that
state the obvious, empty states give direction, errors say what happened and what
to do.

Commit.

---

## Step 6 — Verify

**Delegate the mechanical half**, in one message, in parallel:

- an agent running `npm run lint`, `npm run check:design` and `npm run build` from
  `app/`, reporting failures with `file:line` — **expect failures from the
  dashboard, the editions screen and the import scripts**; those belong to 017d.
  What must be clean is everything under `app/(app)/budget/` and, in particular,
  `check:design`, which is not allowed to fail at all;
- an agent listing keys present in the `en` `budget` block and missing from the
  `fr` one, and vice versa.

Relay both results yourself. Then check by hand, against the local database:

- Create a budget with two departments → users in either see it. Create one with
  none → **only an admin sees it.**
- A user in one department attached to two budgets sees two cards.
- Rename a budget and change its departments → the lines and the actuals are
  untouched.
- Delete a budget holding a line → refused with the sentence. Empty it → it goes.
- 390px viewport: the create button sits in the top bar, its modal is
  `mobileFullScreen`, and the cards still read as roll-ups and cardlets.

Commit anything this changed. Then stop — **no tag, no push.** 017d releases.
