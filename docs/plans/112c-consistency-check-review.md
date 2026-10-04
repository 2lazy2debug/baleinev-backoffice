# 112c — Review of the 112 fixes

Review of @docs/plans/done/112-consistency-check.md as recorded in
@docs/plans/done/112b-consistency-check-done.md, done on 2026-10-04 against
`1aafe87`. Every one of the 37 rows was re-checked in the current code.

**Verdict:** 31 of 37 fixes are correct and complete. One fix caused a
regression (#16), two are only partly done (#17, #36), and the original audit
missed a handful of issues of the same kinds (§2). The checks pass: `build`,
`check:design` (206 files), `check:i18n` (1026 keys), `npm test` (254 tests).
`lint` gives 3 warnings, and one of them comes from 112 (C5). The fixes left no
new orphaned i18n keys: all 29 keys reported by `check:i18n --dead` were
already unused before 112.

Execute §1 and §2 the same way as 112 phase 2: one issue = one commit, update
the row in place, record it in 112b. §3 needs a decision from the user first —
do not touch it until they answer.

## 1. Problems with the fixes

| # | Model | What's broken (file:line) | Fix | Fixed at | Solution |
|---|-------|---------------------------|-----|----------|----------|
| C1 | Opus | **Regression from #16.** `app/app/(app)/calendar/client.tsx:408` and `:506` became `<SectionTitle desktopOnly>`, so a phone no longer shows which month is on screen or which day is selected. The prev/next/today buttons have no label next to them. The audit assumed a `<SegmentedControl>` already names the view, but the calendar has none (`grep SegmentedControl` finds nothing in the file). The old `<p>` was visible on every breakpoint. | Remove `desktopOnly` from both `SectionTitle`s. To avoid the double word, drop the `{copy.monthView}: ` / `{copy.dayView}: ` prefix on phones only, not the date: e.g. `<span className="hidden sm:inline">{copy.monthView}: </span>{date}`. | | |
| C2 | Opus | **#17 only half done.** The weekday row uses `locale`, but the two headings next to it still format with the browser locale: `app/app/(app)/calendar/client.tsx:408` (`monthStart.toLocaleDateString(undefined, …)`), `:506` (`selectedDate.toLocaleDateString(undefined, …)`), `:732` and `:736` (`toLocaleString()` with no argument). Under `fr` on an English browser, the month name stays English, and server and client can render different text. Same bug at `app/app/(app)/page.tsx:333` (`toLocaleDateString()`). | Pass the `locale` prop already in scope (`calendar/client.tsx:152`) as the first argument in all four calendar calls. In `page.tsx:333`, pass the `locale` the dashboard already reads. | | |
| C3 | Opus | **#36 only half done.** `<Field required>` exists (`app/components/ui/Field.tsx:7`), but only `events/create-event-modal.tsx` and `components/add-journal-entry-modal.tsx` use it. About 68 other `<Field>`s wrap an input with `required`, and they show no marker. The 112b row says "Other modals not yet marked". So the `*` still appears in exactly two dialogs, which is the inconsistency the issue was about. | Either add `required` to every `<Field>` whose child input has `required` (`grep -rn -A2 '<Field ' app components \| grep -E '(Input\|Select\|Textarea\|MultiSelect)[^>]* required'` lists them), or remove the prop from the two modals and drop the marker everywhere. Doing all of them is the issue's stated fix. | | |
| C4 | Opus | **#1 missed the same shape on two pages.** The title still repeats the eyebrow: `app/app/(app)/budget/client.tsx:247-248` (`Budget` / `Budget entries for <edition>`) and `app/app/(app)/journal/page.tsx:106-107` (`Journal` / `Journal entries - <edition>`). This is the exact pattern #1 fixed on expense-reports and events. | Do what #1 did: keep `eyebrow`, reduce `title` to `{editionName}` / `{activeEdition.name}`. `budget.entriesFor` and `journal.entriesFor` are then unused: delete both from `app/lib/i18n-dictionaries.ts` (en + fr) and run `npm run check:i18n`. | | |
| C5 | Haiku | `#19` left an unused import: `app/app/(app)/cost-centers/client.tsx:9` imports `Button` (lint warning). | Remove `Button` from the import. | | |
| C6 | Haiku | `#34` left whitespace-only lines where `size="sm"` was deleted: `app/app/(app)/users/client.tsx:132` and `:141`. | Delete both lines. | | |
| C7 | Sonnet | The task-empty-state change from `#24` (d7e45a4) uses `EmptyPage` the other way round: `app/app/(app)/tasks/page.tsx:37` is `<EmptyPage title={copy.tasks.title}>{copy.common.noEditionSelected}</EmptyPage>`. Every other screen does `eyebrow={copy.<app>.title} title={copy.common.noEditionSelected}` with direction text as children (e.g. `app/app/(app)/budget/page.tsx:25`). | Match the other screens: `eyebrow={copy.tasks.title} title={copy.common.noEditionSelected}`, children `{copy.common.pickEditionHint}`, the same as budget. | | |

## 2. Escaped the audit (same rules, not listed in 112)

| # | Model | What's broken (file:line) | Fix | Fixed at | Solution |
|---|-------|---------------------------|-----|----------|----------|
| E1 | Haiku | Hardcoded English labels that #23 did not list: `app/app/(app)/tasks/client.tsx:383` (`label="Edit"`), `:386` and `:506` (`label="Delete"`). | `:386` → `copy.tasks.deleteTodo`, `:506` → `copy.tasks.deleteTask` (both exist). `:383` has no key: add `tasks.editTodo` (en "Edit todo" / fr "Modifier la liste") next to `deleteTodo` in both locales. Run `npm run check:i18n`. | | |
| E2 | Haiku | A raw heading that #16 missed: `app/app/(app)/tasks/client.tsx:167` `<h3 className="text-sm font-semibold">{copy.tasks.standaloneTasks}</h3>`. | `<SectionTitle as="h3">`. | | |
| E3 | Sonnet | A third micro-label recipe that #6 missed: `text-xs font-semibold uppercase tracking-wide text-[var(--muted)]` at `app/app/(app)/page.tsx:320`, `app/app/(app)/events/client.tsx:400`, `app/app/(app)/tasks/client.tsx:47`. | Replace with `microLabelClasses` (from `@/components/ui`). | | |
| E4 | Sonnet | `#5` made `signedAmountClasses` the one recipe, but "account type" is still coloured two ways. The journal colours PRODUITS only (`app/components/journal-table.tsx:275`, `:444`, CHARGES stays uncoloured). The budget details modal colours both, with hand-typed classes (`app/app/(app)/budget/client.tsx:559`, `:563`, `:590`, `:607`). The 112b row says this was left alone on purpose, but the `SignedAmount.tsx` comment says this exact case belongs to `signedAmountClasses`. | Use `signedAmountClasses(entry.accountType !== "CHARGES")` at all four budget lines. Then choose one rule for the journal and budget together: either both colour CHARGES rose, or neither does. The budget's both-coloured rule is the more readable one. | | |
| E5 | Sonnet | Inline todo edit never closes on success: `app/app/(app)/tasks/client.tsx:336-365` toggles `editingTodoId`, but `updateTodoFormAction` (`:322`) has no `useCloseOnSuccess`, so the form stays open after a successful save. #14 fixed this pattern elsewhere. | `const markUpdateSubmitted = useCloseOnSuccess(updateTodoState, isSavingTodo, () => setEditingTodoId(null));` and `onSubmit={markUpdateSubmitted}` on the form at `:337`. | | |
| E6 | Haiku | Page rhythm drift: `app/app/(app)/tasks/page.tsx:58` `space-y-5`; `app/components/ui/EmptyPage.tsx:30` `space-y-6` (a primitive, so every empty screen is off the `space-y-4 lg:space-y-8` rhythm). | Both → `space-y-4 lg:space-y-8`. | | |
| E7 | Haiku | `app/app/(app)/passwords/client.tsx:127` `<Panel as="ul" className="… bg-[var(--panel-strong)]">` overrides the fill that #2 moved into `<Panel>`. It is the only screen that still sets its own Panel fill. | Drop `bg-[var(--panel-strong)]` from the className. | | |

## 3. Needs a decision first (do not execute yet)

- **D1 — Delete without confirmation.** About half of the destructive actions
  open a `<Modal size="sm">` confirm (budget, tasks todos, calendar, passwords,
  departments, stock/addresses settings). The rest delete on one click. Among the
  heaviest: `app/app/(app)/editions/client.tsx:165-176` (a whole edition),
  `app/app/(app)/users/client.tsx:123,139` (a user account),
  `app/app/(app)/cost-centers/client.tsx:113`,
  `app/app/(app)/money-accounts/client.tsx:111`,
  `app/app/(app)/templates/client.tsx:149`, task rows at
  `app/app/(app)/tasks/client.tsx:504-509`. Some are guarded server-side
  (`canDelete`). The question: should every delete confirm, or only those whose
  target holds data? Either way it is a shared `<ConfirmDeleteModal>` in
  `components/ui/`, not one modal per screen.
- **D2 — Templates edit inline.** `app/app/(app)/templates/client.tsx:96-129`
  keeps a name + 26-row HTML editor open on every template card. This is the
  same shape #29 moved behind a pencil + modal. Is the inline editor the point
  of that page (it is the only way to edit the HTML), or should it go behind a
  pencil like money-accounts?
- **D3 — `emerald-300`/`rose-300` on the light theme.** `SignedAmount`, `Badge`
  and `Alert` use fixed 300 shades. Since `be82b87` there is a light theme
  (`:root[data-theme="light"]` in `app/app/globals.css:53`), and those shades are
  low-contrast on it. #5 chose 300 for all signed amounts. This needs `--good`
  / `--bad` tokens, which is a token change that repaints the whole app.

## 4. Bookkeeping

- 112b's job was a short list of issue / title / commit, but the previous run
  filled it with the full finding rows, and 112's own Findings table is now
  empty. Leave it as is: 112b is now the detailed record.
- 112b rows with no commit hash (fill them in): #6 → `3ee9338`, `7d5376f`,
  `fb06e47`; #14 → `3b99ac8`, `fa67e31`; #19 → `50fe956`; #20 → `3f80953`,
  `d00860d`; #24 → `d7e45a4`, `3cfa5fc`, `2e56580`; #25 → `c146177`.
- Verified sound, no action: #2, #3, #4, #5 (apart from E4), #7, #8, #9, #10,
  #11, #12, #13, #14, #15, #18, #19, #20, #21, #22, #23, #25, #26, #27, #28,
  #29, #30, #31, #32, #33, #34 (apart from C6), #35, #37.
