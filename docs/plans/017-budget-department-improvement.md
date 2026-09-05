# 017 — Budgets and departments become many-to-many

[014-departments-expansion](done/014-departments-expansion.md) left one budget
welded to one department: `DepartmentBudget` is a `(editionId, departmentId)` pair
and a journal entry books against a *department*. That is too tight. What the
association actually plans is a **budget** — a named envelope inside an edition —
and a department may watch several of them while a budget may be shared by
several departments, or by none at all.

After this plan:

```
Department  1 ──n  BudgetDepartment  n ── 1  Budget  ──n  BudgetLine
                                              │
                                              └──n  JournalEntry
```

- A **budget** has a name, belongs to one edition, holds the budget lines, and is
  created by hand in the budget app — "pick a department, or don't".
- **`BudgetDepartment` carries no money.** It exists so a person in a department
  can see the budgets that concern them. Attaching or detaching a department
  moves nothing and destroys nothing.
- **Journal entries book against a budget, not a department.** This is the change
  with the widest reach in the plan and it is deliberate: the financial weight now
  sits entirely on the budget, and the department is only a lens onto it.
- **Expense reports keep their department** (`ExpenseReport.departmentId`) and are
  not touched. So do passwords, appointments, tasks and users.
- A budget with **no department is visible to admins only** — it belongs to nobody
  in particular, and a non-admin keeps seeing exactly the budgets of their own
  departments.

This plan **has a migration**, it repoints live financial data, and its tag must
say `requires-migration`.

---

## Ground rules

- **Read `CLAUDE.md` first and obey it literally.** Every "create X" is a header
  button plus a modal — there is now a *create budget* flow, and it takes that
  shape, on both breakpoints, with the permission check wrapped around the button.
- **Reuse before you write.** `Chip`, `MultiSelect`, `Modal`, `Card`, `Table`,
  `CardletList` all exist. `app/(app)/departments/` is the closest working model
  for the create/edit/delete trio — read it before you write the budget one.
- **One commit per step**, `git add . && git commit -am "<what you did>"`. No
  branches.
- Server actions throw English sentences; only UI copy goes through the
  dictionary, in **both** `en` and `fr`.
- `npm run lint`, `npm run check:design` and `npm run build` from `app/` must all
  pass before the release step.
- Work against the local database — `CLAUDE.md` says it holds no production data.
  Test the migration on it before tagging.

---

## Step 1 — The schema

File: `app/prisma/schema.prisma`

**`DepartmentBudget` becomes `Budget`:**

```prisma
/// One named envelope of money inside one edition — what used to be a
/// department's budget, now a thing in its own right. It carries the lines that
/// were planned and the journal entries that were actually booked; the
/// departments attached to it only get to look.
model Budget {
  id        String   @id @default(cuid())
  editionId String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  edition        Edition            @relation(fields: [editionId], references: [id], onDelete: Cascade)
  departments    BudgetDepartment[]
  budgetLines    BudgetLine[]
  journalEntries JournalEntry[]

  @@unique([editionId, name])
  @@index([editionId])
}

/// Who may look at a budget. It carries no amount and no share — detaching a
/// department takes nothing away from the budget, it only stops the team seeing
/// it. A budget with no row here is an admin-only budget.
model BudgetDepartment {
  id           String   @id @default(cuid())
  budgetId     String
  departmentId String
  createdAt    DateTime @default(now())

  budget     Budget     @relation(fields: [budgetId], references: [id], onDelete: Cascade)
  department Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@unique([budgetId, departmentId])
  @@index([departmentId])
}
```

**`BudgetLine`**: `departmentBudgetId` → `budgetId`, relation `departmentBudget`
→ `budget`, still `onDelete: Cascade`.

**`JournalEntry`**: `departmentId` → `budgetId` (still nullable), relation
`department` → `budget Budget? @relation(fields: [budgetId], references: [id],
onDelete: SetNull)`. `SetNull` and not `Restrict`: deleting an edition cascades
both its budgets and its entries, and a `Restrict` in the middle of that cascade
is a deploy that fails at 2am. A budget that still holds entries is protected by
the delete *action* instead, where the refusal can be a sentence.

**`Department`**: drop the `journalEntries JournalEntry[]` back-relation and the
`budgets DepartmentBudget[]` one; add `budgets BudgetDepartment[]`. **Keep
`hasBudget`** — its job shrinks to one thing: it is the filter for which
departments may be attached to a budget. Update its doc comment to say exactly
that, since it no longer opens or closes anything by itself.

**`Edition`**: `departmentBudgets DepartmentBudget[]` → `budgets Budget[]`.

Do not run `prisma migrate dev` — this repo writes its migrations by hand
(see step 2). Run `npx prisma generate` to get the client types.

Commit.

---

## Step 2 — The migration

New file:
`app/prisma/migrations/20260905090000_budget_department_nn/migration.sql`

Hand-written, heavily commented, in the style of
`20260903090000_departments_expansion/migration.sql` — read that one first, it is
the closest precedent and its comments explain a bug worth not repeating (drop a
foreign key *before* repointing the rows it guards, because Postgres checks per
statement, not at commit).

The order matters. `Budget.departmentId` has to survive until every row that used
it has been repointed:

1. `ALTER TABLE "DepartmentBudget" RENAME TO "Budget";` and rename its primary
   key, its `editionId` foreign key and its indexes to match.
2. `ALTER TABLE "Budget" ADD COLUMN "name" TEXT;` then
   `UPDATE "Budget" b SET "name" = d."name" FROM "Department" d WHERE d."id" = b."departmentId";`
   then `SET NOT NULL`. Every existing budget is named after the department that
   owned it — that is what it was.
3. Create `"BudgetDepartment"` with its unique index on `("budgetId",
   "departmentId")`, its index on `("departmentId")` and both foreign keys
   (`ON DELETE CASCADE`). Fill it with one row per existing budget:
   `INSERT INTO "BudgetDepartment" … SELECT gen_random_uuid()::text, b."id",
   b."departmentId", NOW() FROM "Budget" b;`
4. **Do not lose an entry's attribution.** A journal entry may point at a
   department that never got a `DepartmentBudget` row in its edition (the row was
   only created when a *line* was first planned). Create a budget for every such
   `(editionId, departmentId)` pair, named after the department, and attach it —
   otherwise those entries end up with `budgetId = NULL` and their money vanishes
   from the comparison. Department names are globally unique, so the derived
   per-edition names cannot collide.
5. `ALTER TABLE "JournalEntry" ADD COLUMN "budgetId" TEXT;` then
   `UPDATE "JournalEntry" e SET "budgetId" = b."id" FROM "Budget" b
    WHERE b."editionId" = e."editionId" AND b."departmentId" = e."departmentId";`
   Drop `JournalEntry_departmentId_fkey` and its index, drop the `departmentId`
   column, and add `JournalEntry_budgetId_fkey → "Budget"("id") ON DELETE SET NULL`
   plus an index on `("budgetId")`.
6. `ALTER TABLE "BudgetLine" RENAME COLUMN "departmentBudgetId" TO "budgetId";`
   and rename the foreign key to `BudgetLine_budgetId_fkey`.
7. Only now: drop the `("editionId", "departmentId")` unique index and the
   `"departmentId"` index on `Budget`, drop `Budget."departmentId"` and its
   foreign key, and create the unique index on `("editionId", "name")`.
8. `UPDATE "Department" d SET "hasBudget" = true WHERE EXISTS (SELECT 1 FROM
   "BudgetDepartment" bd WHERE bd."departmentId" = d."id");` — a department that
   is attached to something is a department that budgets.

Verify on the local database with `npm run db:deploy`, then check by hand that no
journal entry lost its attribution:

```sql
SELECT count(*) FROM "JournalEntry" WHERE "budgetId" IS NULL;
```

That count must equal the number that had a NULL `departmentId` before the
migration — measure it first. Anything higher means step 4 or 5 missed a pair.

Commit.

---

## Step 3 — The server helpers

File: `app/lib/departments.ts` — three of its four exports are about a
relationship that no longer exists.

- **Delete `resolveDepartmentBudgetId`.** Budgets are created explicitly now;
  nothing opens one as a side effect of writing a line.
- **Delete `assertDepartmentsBudget`.** Its only callers were the journal
  actions, and they now name a budget.
- **Keep `budgetingDepartments()`** — it is what fills the "attach departments"
  picker. Its doc comment must be rewritten: it lists the departments that may be
  *attached to* a budget, not the ones a line may be booked against.
- **Rewrite `departmentBudgetUsage(departmentId)`**: count the budget lines of the
  budgets this department is attached to
  (`prisma.budgetLine.count({ where: { budget: { departments: { some: { departmentId } } } } })`)
  and the journal entries of those same budgets. It still answers one question —
  "would turning this department's budget off hide live money from a team?" — and
  the departments screen still uses it for exactly that.

New file: `app/lib/budgets.ts`

- `visibleBudgetsWhere(access, editionId)` — the one place the visibility rule
  lives: an admin sees `{ editionId }`, anyone else sees
  `{ editionId, departments: { some: { departmentId: { in: access.departmentIds } } } }`.
  A budget with no `BudgetDepartment` row therefore never matches for a non-admin,
  which is the admin-only rule, expressed once.
- `assertBudgetInEdition(budgetId, editionId)` — replaces
  `assertDepartmentsBudget`. Refuses a journal entry booked against a budget from
  another edition: `"That budget does not belong to the active edition."`
- `resolveDefaultBudgetForDepartment(editionId, departmentId)` — used by the
  expense-report → journal prefill. Returns the budget id when the department is
  attached to **exactly one** budget in that edition, and `null` otherwise.
  Guessing between two budgets would book real money to the wrong envelope; an
  empty picker is the honest answer.

Commit.

---

## Step 4 — The budget app

Files: `app/app/(app)/budget/page.tsx`, `client.tsx`, `actions.ts`, plus new
modal components.

### 4a — Actions

`app/(app)/budget/actions.ts` keeps its three budget-line actions (with
`departmentBudgetId` → `budgetId` and `resolveDepartmentBudgetId` replaced by the
`budgetId` that now comes straight from the form) and gains three:

- `createBudgetAction` — `requireAdmin()`, `resolveWritableEditionId()`, a
  required `name`, and `departmentIds` (zero or more, from a multi-select:
  `formData.getAll("departmentIds")`). Refuse a duplicate name in the edition with
  a sentence rather than letting the unique index speak. Refuse a department that
  is not `hasBudget`. Creates the `Budget` and its `BudgetDepartment` rows in one
  `create` with a nested `departments: { create: [...] }`.
- `updateBudgetAction` — same checks; renames, and replaces the attachment set
  (`deleteMany` then `createMany` inside a transaction). Detaching is always
  allowed: it takes nothing away from the budget.
- `deleteBudgetAction` — `requireAdmin()`, and **refused while the budget holds
  budget lines or journal entries**: `"This budget still holds budget lines or
  journal entries. Empty it before deleting it."` An empty budget goes, taking its
  attachments with it by cascade.

All three revalidate `/budget`, `/journal` and `/`.

### 4b — Page

`page.tsx` stops querying departments and queries budgets:

```ts
prisma.budget.findMany({
  where: visibleBudgetsWhere(access, activeEdition.id),
  orderBy: { name: "asc" },
  include: {
    departments: { include: { department: { select: { id: true, name: true } } } },
    budgetLines: { orderBy: [{ accountType: "asc" }, { createdAt: "desc" }] },
    journalEntries: { orderBy: [{ date: "desc" }, { sequenceNumber: "desc" }] },
  },
})
```

The second query over `journalEntry` disappears entirely — actuals are now the
budget's own entries, so there is nothing left to match up by department id. It
also removes the double-counting the old shape would have had.

The page also loads `budgetingDepartments()` for the create/edit pickers (admins
only) and passes `canManage` as it does today.

### 4c — Client

`BudgetPageClient` becomes one card per **budget**:

- The `DepartmentItem` type becomes `BudgetItem { id, name, departments: {id,
  name}[], budgetLines, journalEntries }`. `DepartmentSummary` becomes
  `BudgetSummary`. The two `AccountSection`s, `BudgetRollup`, the details modal
  and the mobile cardlets are otherwise **unchanged** — they already read a
  section object, not a department, and their comment about actuals being a
  section-level fact stays true.
- The card header shows the budget name (`SectionTitle`) and, under it, its
  departments as `<Chip>`s. No department → `copy.budget.noDepartment` in
  `text-sm text-[var(--muted)]`. Do not invent a badge tone for it.
- The desktop-only action cluster on the card gains, for `canManage`: a pencil
  opening the edit modal and a `Trash2` opening a confirm modal, beside the
  existing eye and plus. Keep it `hidden … sm:flex` as it is now — this pass does
  not change which breakpoint manages budgets.
- **The create button is a `PageHeader actions` button plus a modal**, per
  `CLAUDE.md`: a new client component
  `app/(app)/budget/create-budget-modal.tsx`, modelled on
  `app/(app)/departments/create-department-modal.tsx` — `Button icon={<Plus />}
  compactOnMobile`, `<Modal size="sm" mobileFullScreen>`, submit in the modal
  `footer` reaching the form by `form="…"`, `useCloseOnSuccess`. The header lives
  inside `BudgetPageClient`, so the button is rendered there, gated on
  `canManage`, identically on both breakpoints.
- Share the form fields between create and edit in
  `app/(app)/budget/budget-form-fields.tsx`, the way
  `department-form-fields.tsx` does: a `name` `<Input>` and a
  `<MultiSelect name="departmentIds">` over the budgeting departments, with a
  hint line saying attaching a department only lets that team see the budget.
- Empty state: admin → `copy.budget.noBudgets` ("No budget yet. Create the first
  one."); non-admin → `copy.budget.noVisibleBudgets` ("No budget is shared with
  your departments yet."). Keep it in the existing `<Card span="full" dashed>`.

Commit (one commit for 4a, one for 4b+4c is fine — do not squash the actions and
the screen into one).

---

## Step 5 — The journal

The journal books against a budget. Every site below currently says "department";
they all become "budget", and the *shape* of each screen is unchanged — this is a
swap, not a redesign.

| File | What changes |
|---|---|
| `app/(app)/journal/page.tsx` | `budgetingDepartments()` → the edition's budgets (`id`, `name`), ordered by name. The entries `include: { department: … }` → `include: { budget: { select: { name: true } } }`. The expense-report prefill's `departmentId` → `resolveDefaultBudgetForDepartment(editionId, prefill.departmentId)`, which may be `null` — the picker then opens empty. |
| `app/(app)/journal/client.tsx` | `departments` prop → `budgets`; `department`/`departmentId` on the entry type → `budget`/`budgetId`; the prefill's `departmentId` → `budgetId`. |
| `components/add-journal-entry-modal.tsx` | the `departments` prop, the `<Field label="Department *">` (which is a hardcoded English string today — put it on `copy.budget` while you are in there) and `name="departmentId"` all become the budget. |
| `components/journal-table.tsx` | the column header, the `department` filter (and `uniqueDepartments`), the `"department"` sort case, the inline-edit `<Select>`, the bulk-edit draft field, `row.departmentName` and the mobile `CardletField` — about a dozen sites, all named `department*`. Rename them to `budget*`. |
| `app/(app)/journal/actions.ts` | `departmentId` → `budgetId` in create, update and bulk update; `assertDepartmentsBudget([...])` → `assertBudgetInEdition(budgetId, editionId)`. The bulk path validates every distinct budget id in the payload. |
| `app/(app)/journal/[journalEntryId]/page.tsx` and `edit-form.tsx` | the picker and the `departmentId` field become the budget. |

The picker offers **every budget of the active edition**, not the visible subset:
only admins may write a journal entry, and the journal table already shows every
entry of the edition to everyone. Do not add a second visibility rule here.

Commit.

---

## Step 6 — Everything else that read a department budget

- `app/app/(app)/page.tsx` (dashboard) — `activeEdition.departmentBudgets` →
  `budgets`, each row named by `budget.name` instead of `budget.department.name`.
  Actuals come from `budget.journalEntries` directly, so the two `filter` passes
  over `activeEdition.journalEntries` collapse into a sum over the budget's own
  entries. The totals row and the `TFoot` are unchanged.
- `app/app/(app)/editions/page.tsx` and `client.tsx` — `_count.departmentBudgets`
  → `_count.budgets`, and the label beside it says budgets, not departments
  (`copy.editions.budgets`, a new key).
- `app/lib/edition-carry-over.ts` — carries `budgets` instead of
  `departmentBudgets`. It must copy the **name** and re-create the
  `BudgetDepartment` attachments in the new edition, then the lines with their
  `createdAt` preserved (the existing comment explains why that matters). A budget
  with no lines is still skipped, as today.
- `app/scripts/import-workbook.ts` — creates a `Budget` per department name in the
  edition, attaches the department, and points the imported journal entries at the
  budget instead of the department. Its reset step deletes `budgetLine` by
  `{ budget: { editionId } }` and then `budget` by `{ editionId }`.
- `app/scripts/import-budget.ts` — same swap: upsert the budget by
  `(editionId, name)` rather than `(editionId, departmentId)`.
- `app/scripts/import-bank-statement.ts` — `departmentId: null` → `budgetId: null`
  in both places, and its comment about "both update actions require a department"
  becomes "require a budget".

A `grep -rn "departmentBudget\|DepartmentBudget" app lib components scripts` from
`app/` must come back empty when this step is done.

Commit.

---

## Step 7 — Departments screen

File: `app/app/(app)/departments/` — the screen stays as it is, with two
corrections.

- `updateDepartmentAction`: turning `hasBudget` off no longer deletes anything.
  It is still **refused** while `departmentBudgetUsage` says the department is
  attached to a budget holding lines or journal entries — hiding live money from
  a team is the thing that rule was always protecting against — and otherwise it
  detaches the department from every budget
  (`prisma.budgetDepartment.deleteMany({ where: { departmentId } })`).
- `deleteDepartmentAction`: unchanged in shape; it reads the rewritten
  `departmentBudgetUsage`.
- The `hasBudget` hint copy on the department form now says what the flag means:
  the department can be attached to budgets. Update `copy.departments.hasBudgetHint`
  in `en` and `fr`.

Commit.

---

## Step 8 — Copy

File: `app/lib/i18n-dictionaries.ts`, `en` and `fr`, the `budget`, `journal`,
`editions` and `departments` blocks.

New keys, at least: `createBudget`, `createBudgetTitle`, `budgetName`,
`budgetDepartments`, `budgetDepartmentsHint`, `noDepartment`, `editBudget`,
`deleteBudget`, `deleteBudgetBlocked`, `noBudgets`, `noVisibleBudgets`,
`selectBudget`, and `editions.budgets`. `journal.department` /
`journal.selectDepartment` become `journal.budget` / `journal.selectBudget` —
rename them rather than leaving a dead key behind.

Follow the copy rules in `CLAUDE.md`: name things by what they do, no labels that
state the obvious, empty states give direction, errors say what happened and what
to do.

Commit.

---

## Step 9 — Docs

- `docs/database.md` — the ER overview and the `Models` section: `Budget`,
  `BudgetDepartment`, the new `BudgetLine.budgetId` and `JournalEntry.budgetId`,
  and the reduced role of `Department.hasBudget`. Delete `DepartmentBudget`.
- `docs/business-processes.md` — **§2 Budget Management** is rewritten: budgets
  are created by hand, named, attached to zero or more departments, and the
  attachment is visibility only. **§3 Journal Entries** now books against a
  budget; say plainly that an entry no longer carries a department and that
  expense reports still do.
- `docs/file-structure.md` — the new files under `/budget` and `lib/budgets.ts`.

Commit.

---

## Step 10 — Verify

From `app/`: `npm run lint`, `npm run check:design`, `npm run build`.

Then, against the local database, after `npm run db:deploy`:

- Every pre-migration journal entry still shows a budget, and the dashboard's
  totals are the same as before the migration. **Write the totals down first.**
- Create a budget with two departments → both teams' users see it; create one with
  none → only an admin sees it.
- A user in one department who is attached to two budgets sees two cards.
- Book a journal entry against a budget → it lands in that budget's actuals and
  nowhere else.
- Convert an approved expense report to a journal entry: if its department has one
  budget the picker is prefilled, if it has two the picker is empty and required.
- Delete a budget that holds a line → refused. Empty it → it goes.
- Turn `hasBudget` off on a department attached to a budget with lines → refused.
- 390px viewport: the create button sits in the top bar, its modal is
  `mobileFullScreen`, and the budget cards still read as cardlets and roll-ups.

Commit anything the verification changed.

---

## Step 11 — Release

Read the latest tag, do not hardcode one:

```bash
cd /home/mcabras/Developer/baleinev-backoffice
git tag --sort=-v:refname | head -1        # e.g. v0.28.4
```

With `NEXT` one minor step above it (`v0.28.4` → `v0.29.0`; if 016 shipped first,
one minor above *that*):

1. Set `app/package.json` `"version"` to `NEXT` without the leading `v`.
2. `git commit -am "chore(release): bump version to <NEXT without v>"`
3. `git tag -a <NEXT> -m "requires-migration"` — **mandatory here.** The tag
   message is the only place the box learns a migration has to run;
   `non-breaking` would deploy this code against the old schema and the app would
   throw at runtime, not at build time.
4. `git push origin main --follow-tags`

**Do not monitor the deployment.** The updater timer picks the tag up within about
two minutes, takes its own snapshot first, and rolls back on a failed health
check. Do not poll `journalctl`, do not ssh to the box, do not loop on
`/api/health`. Push the tag and report what you shipped.

---

## When it is done

Move this file to `docs/plans/done/017-budget-department-improvement.md` in the
release commit.
