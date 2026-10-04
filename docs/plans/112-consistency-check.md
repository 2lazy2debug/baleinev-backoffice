# 112 — Design consistency check

Follow-up to @docs/plans/done/006-design-consistency-check.md and
@docs/plans/done/010-responsive-feedback.md. Those plans fixed a batch of
consistency issues against CLAUDE.md's design system rules; the app has
changed since. This plan re-audits every app and fixes what's drifted.

Two phases, two models, don't skip the order: ****Opus audits only**** (phase 1), ****Sonnet resolves**** (phase 2). 
Do not start phase 2 until phase 1's findings table is filled in.

## Scope — apps to check

One row per app under `app/app/(app)/`. Check each against CLAUDE.md's
design system rules (components, control sizes, radius, spacing, mobile
rules) and against the outcomes described in the two linked plans above.

- [x] account
- [x] addresses
- [x] articles
- [x] budget
- [x] calendar
- [x] cash
- [x] cost-centers
- [x] departments
- [x] editions
- [x] events
- [x] expense-reports
- [x] invoices
- [x] journal
- [x] money-accounts
- [x] passwords
- [x] pos
- [x] stock
- [x] tasks
- [x] templates
- [x] users

## Phase 1 — Audit (Opus)

For each app above: browse it (desktop and mobile widths), compare against
CLAUDE.md, and check the box once it's been reviewed.

****Rules:****

- Do not edit any code in this phase. Every finding becomes a row in the
  Findings table below — that row is the instruction Sonnet will execute.

- Each row must give Sonnet everything it needs without re-exploring: exact
  file path, line number(s), what's wrong, and a concrete fix (which token,
  component, or prop to use instead). "Inconsistent spacing" is not a
  finding; "`app/app/(app)/events/page.tsx:42` uses `p-6` instead of the

  `<Card>` default `p-4/sm:p-5`" is.

- Number issues sequentially starting at 1, one row per issue, in the order
  found. The row is the permanent record for that issue and is updated in place
  when the issue is resolved; never append a second row for the resolution.

- If an issue repeats across apps (e.g. the same hardcoded color in three
  places), still give it one issue number, but list every file:line in the
  "What's broken" cell.

## Phase 2 — Resolve (Sonnet)

Before resolving anything, read `112b-consistency-check-done.md` if it exists. It is a compact
ledger of issues already fixed in previous runs. Do not re-read, re-fix, or
re-audit an issue listed there unless the current code has drifted and the issue
has genuinely returned.

Work through the Findings table top to bottom, one issue at a time.
1. Read the row's "What's broken" and "Fix" cells.
2. Decide who does the fix:

   - ****No context needed**** (a single hardcoded value swapped for a token, a
     `rounded-[Npx]` swapped for a scale class, a prop rename) → spawn a Haiku
     subagent, give it the file:line and the fix verbatim, have it make the
     edit and report back what it changed. Do not also make the edit yourself.

   - ****Anything else**** (touches component logic, spans multiple files,
     ambiguous which token applies, requires reading surrounding code to judge)
     → fix it yourself.

3. Verify the fix (re-read the file or view it in the browser).

4. Update the **same row** in the Findings table: change `Model` to `Sonnet`
   (or `Haiku via Sonnet`) and fill in `Fixed at` + `Solution`. Never append a
   second row for a resolved issue.

5. Commit: `git add . && git commit -am "..."` — one commit per issue,
   per CLAUDE.md. Don't batch multiple issues into one commit.

6. After the fix has been verified and committed, append a short entry for the
   issue to `112b-consistency-check-done.md` so future runs can skip the completed work. Keep the
   entry compact: issue number, short description, and commit hash if available.
   Do not copy the full finding or solution into `112b-consistency-check-done.md`.

7. Run the checks in `CLAUDE.md` (`npm run build`, `lint`, `check:design`,

   `check:i18n`, `test`, from `app/`) before moving to the next issue if the

   fix touched shared components; otherwise it's fine to batch checks every

   few issues.

Once every issue is resolved and recorded in `112b-consistency-check-done.md`, move this file to

`docs/plans/done/`. Keep `112b-consistency-check-done.md` available for future runs.

## Findings

One issue = one number and one row. Opus creates the row with `Model = Opus`

and leaves `Fixed at` and `Solution` empty. Sonnet updates that same row in place

when the issue is resolved; it never creates a second resolution row.

### `112b-consistency-check-done.md`

`112b-consistency-check-done.md` is a compact persistent ledger of completed issues. Sonnet must

read it before resolving issues and append an issue only after its fix has been

verified and committed. Keep entries short: issue number, short title, and

commit hash if available. Do not copy the full finding or solution into this

file.

Example:

```md
# Completed issues

- #1 — PageHeader duplicate eyebrow/title — `<commit>`
- #2 — Panel surface token — `<commit>`
```

The Findings table remains the detailed audit record; `112b-consistency-check-done.md` exists only

to avoid spending read cycles rediscovering work that is already done.

All paths are from the repo root. `npm run check:design` passes today (199 files

clean), so nothing below is catchable by the script — these are all rules the

guard cannot see.

| # | Model | What's broken (file:line) | Fix | Fixed at | Solution |
|---|-------|----------------------------|-----|----------|----------|
| 6 | Opus | Micro labels are written two ways. The primitives use `text-2xs`/`text-3xs` + `tracking-[0.08em]` (`app/components/ui/Cardlet.tsx:82`, `app/components/ui/PageHeader.tsx:69`, `app/components/ui/Table.tsx:53`, `app/components/ui/Badge.tsx:19`), but these screens use `text-xs` with a wider arbitrary tracking: `app/app/(app)/budget/client.tsx:369,503,509,513,520,523,561` (`0.16em`/`0.18em`), `:564,568` (`text-2xs tracking-[0.14em]`), `app/app/(app)/calendar/client.tsx:718,722,726,730` (`0.14em`), `app/app/(app)/calendar/create-appointment-modal.tsx:98,108` (`0.14em`), `app/app/(app)/cost-centers/client.tsx:59` (`0.18em`), `app/app/(app)/money-accounts/client.tsx:98` (`0.18em`), `app/app/(app)/page.tsx:200` (`0.2em`), `app/app/(app)/pos/sessions/[sessionId]/page.tsx:168` (`0.2em`), `app/app/(app)/templates/client.tsx:62`. CLAUDE.md: `text-3xs`/`text-2xs` are the tokens for micro labels. | Export a `microLabelClasses` (or `<MicroLabel>`) from `app/components/ui/` holding `text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]`, and replace every line above with it. Leave the deliberate wide-tracked code displays alone (`app/app/(app)/passwords/client.tsx:285`, `app/app/(app)/account/two-factor-card.tsx:156`, `app/app/(auth)/login/login-form.tsx:106`). |  | done: `microLabelClasses` exported from `components/ui/microLabel.ts`, every screen uses it |
| 12 | Opus | `app/app/(app)/budget/client.tsx:324` — `<div className="hidden items-center gap-2 sm:flex">` hides view-details, edit and delete below `sm`. The in-code comment at `:322-324` calls this deliberate, but CLAUDE.md is explicit: "Never show a create button on one breakpoint and hide it on the other; permission decides who sees it, never the viewport." | Drop `hidden … sm:flex` for `flex`, and make the actions work on a phone: the `IconButton`s are already 44px below `lg` via the control scale, and issue 13 makes the details modal usable there. If the row overflows, wrap the three in a `<Menu>` rather than hiding them. Remove the now-false comment. | `3b99ac8` | done: actions always visible, comment removed |
| 13 | Opus | The budget details dialog does not work on a phone. `app/app/(app)/budget/client.tsx:495-499`: `size="full"` with no `mobileFullScreen`. `:501` and `:562`: a `<Card>` is used as a panel **inside** a `<Modal>` — CLAUDE.md says a surface nested in a Card/Modal is `<Panel nested>`/`nestedSurfaceClasses`. `:524` and `:572`: two `<Table>`s with no `desktopOnly` and no `<CardletList>` fallback. | Add `mobileFullScreen` to the modal; swap both `<Card as="div">` for `<Panel nested>`; give both tables `desktopOnly` plus a `<CardletList>`/`<Cardlet>` fed by the same array. | `3b99ac8` | done: mobileFullScreen, Panel nested, desktopOnly tables + cardlets |
| 14 | Sonnet | Dialogs re-implement close-on-success by hand instead of `useCloseOnSuccess`: `app/app/(app)/budget/client.tsx:194-201` (a wrapper action that calls `setEntryModalBudget(null)`), `app/app/(app)/passwords/client.tsx:347-354` and `:461-469` (a `submitted` flag plus a `useEffect`). | Replace all three with `useCloseOnSuccess` from `@/components/use-close-on-success` (`app/components/use-close-on-success.ts`), the hook every other modal uses — including two other dialogs in the very same budget file at `app/app/(app)/budget/client.tsx:216` and `:222`. Call shape: `const markSubmitted = useCloseOnSuccess(state, isPending, () => setOpen(false));` — see `app/app/(app)/expense-reports/create-expense-report-modal.tsx:70`. |  | done: budget, passwords (both dialogs) use `useCloseOnSuccess` |
| 19 | Opus | `app/app/(app)/cost-centers/client.tsx:80-91` hides the rename form inside a `<details>` whose `<summary>` is styled with `iconButtonClasses("neutral","sm",...)` — a disclosure element masquerading as a button, and the only one of its kind in the app. | Use the inline-edit pattern from `app/app/(app)/addresses/settings/client.tsx`: a pencil `<IconButton>` that flips local state to an `<Input size="sm">` plus save/cancel `IconButton`s. Delete the `<details>`/`<summary>`. |  | done: pencil IconButton swaps the title for an inline Input + save/cancel, `<details>` removed |
| 20 | Sonnet | Two apps still create with an inline column instead of a header modal. `app/app/(app)/editions/client.tsx:125-177` is a `<Card as="section">` holding the create form in the right half of the grid at `:47`; `app/app/(app)/templates/client.tsx:121-155` is the same shape. CLAUDE.md: "do not add an inline create form, a sidebar create column or a per-app Create/History tab strip, not even for a brand-new app." | Move each form into its own `create-edition-modal.tsx` / `create-template-modal.tsx` client component (pattern: `app/app/(app)/expense-reports/create-expense-report-modal.tsx`) with the submit in the modal `footer` reaching the form by `form="…"`, `useCloseOnSuccess`, and `mobileFullScreen`. Pass it into `PageHeader actions` from `app/app/(app)/editions/page.tsx:22-26` and `app/app/(app)/templates/page.tsx:24-32`, wrapped in the same permission gate. The list then takes the full width — drop the two-column grid from issue 15. | 3f80953 + this commit | Sonnet: editions and templates create forms moved into `create-edition-modal.tsx` / `create-template-modal.tsx` (header button, `form="…"` footer submit, `useCloseOnSuccess`, `mobileFullScreen`); the two-column grids are gone. |
| 21 | Opus | `app/app/(app)/journal/client.tsx:70-75` puts the create button in the page body above the table (`<Button … className="self-start">`) rather than in `PageHeader actions`. | Move the trigger into the `PageHeader actions` prop of the journal page, keeping the `isReadOnly` gate exactly where it is, and drop the `self-start` class. | `2a036ac` | done: already moved into `PageHeader actions` (no `self-start` left) |
| 22 | Opus | `app/app/(app)/tasks/client.tsx:467-497` renders a full create-task form inline inside every todo card. | Replace with a `compactOnMobile` `<Button icon={<Plus />}>` on the todo card that opens one shared `<Modal mobileFullScreen>` create form (the todo id goes in a hidden input), per CLAUDE.md's "Every create X is a header button and a modal". | d7e45a4 | done |
| 24 | Opus | Empty states are bare paragraphs instead of the primitives CLAUDE.md names: `app/app/(app)/events/client.tsx:345-346` (`<p className="text-sm text-[var(--muted)]">{copy.noEvents}</p>` as the whole screen), `app/app/(app)/tasks/client.tsx:150-156` (no edition selected) and `:158-163` (no tasks), `app/app/(app)/invoices/client.tsx:668` (`<p className="mt-3 …">{copy.invoices.noHistory}</p>`). | "Screen with nothing to show yet → `<EmptyPage eyebrow title>` — never a `PageHeader` alone": use `<EmptyPage>` for `tasks/client.tsx:150-156` (hoist it to `app/app/(app)/tasks/page.tsx` so the header is not rendered twice) and `<Card dashed>` for the in-page cases (events, tasks `:158-163`, invoices). |  | tasks half done in d7e45a4 (EmptyPage hoisted to page.tsx, Card dashed); invoices done in 3cfa5fc; events open |
| 25 | Opus | `app/app/(app)/expense-reports/client.tsx:222` shows the status as plain text in the desktop table while the mobile cardlet renders the same value as a `<Badge>` — the same field with two visual treatments. `:212-214` also leans on a `<Badge title=…>` as a hover tooltip, which a phone cannot show. | Render `<Badge tone={…}>{row.statusLabel}</Badge>` in the desktop `<TD>` too, from the same `row` object. For `:212-214`, put the bank info in the cardlet body / a table column rather than a `title` attribute. |  |  |
| 26 | Opus | The invoice history table at `app/app/(app)/invoices/client.tsx:670-763` has five columns, no `desktopOnly` and no `<CardletList>`, so a phone gets a horizontally-squashed table. `:685` overrides the row fill with `className="bg-[var(--panel-strong)]"` on every `<TR>` (the `Table` primitive already stripes). `:690-696` is a raw `<button>` with a hand-rolled `font-semibold hover:text-[var(--accent)]` class. | Add `desktopOnly` to the `<Table>` and a `<CardletList>`/`<Cardlet>` block fed by the same `invoiceHistory` array; delete the `bg-[var(--panel-strong)]` from the `<TR>`; make the refill trigger a `<Button variant="ghost" size="sm">` (or `buttonClasses`). | 3cfa5fc | Table desktopOnly + CardletList, no TR fill, ghost Button |
| 27 | Opus | `app/app/(app)/page.tsx:228-260` — the budget-vs-actuals table has eight columns, `frame={false}`, no `desktopOnly` and no mobile fallback; it is the widest table in the app and the dashboard is the first screen a phone opens. | Add `desktopOnly` plus a `<CardletList>` fed by the same rows, with the delta as the `<CardletHeader>` action (use the `<SignedAmount>` from issue 5). |  |  |
| 29 | Opus | Edit forms sit permanently open on every row instead of behind a pencil: `app/app/(app)/money-accounts/client.tsx:113-187` renders a name/type/balance form inside each account card, and `app/app/(app)/tasks/client.tsx:201-233` renders a title/date/description/assignee form inside every task. Both double the height of a list on a phone and bury the read view. | Show the values as read-only text with a pencil `<IconButton>` that opens a `<Modal mobileFullScreen>` holding the form (the `app/app/(app)/budget/client.tsx:653` edit modal is the nearest pattern). | c3c929d | done: tasks in d7e45a4, money-accounts edit modal |
| 30 | Opus | `app/app/(app)/tasks/page.tsx:55-66` wraps `<TasksPageClient>` in a `<Card as="section">`, and the client renders each todo as its own card (`app/app/(app)/tasks/client.tsx:181`, `:383`) — a card of cards, two borders and two gutters deep before any content. | Drop the outer `<Card>` from `tasks/page.tsx` and keep the `<SectionTitle>` above the client, or make the todo cards `<Panel nested>` — not both surfaces. | d7e45a4 | done |
| 31 | Opus | `app/app/(app)/tasks/client.tsx:443-462` implements delete-confirmation as an inline rose-tinted box with a type-to-confirm input, inside the list. Nothing else in the app confirms this way. | Move it into a `<Modal size="sm">` with a `variant="destructive"` submit in the `footer`, matching `app/app/(app)/budget/client.tsx:694`. | d7e45a4 | done |
| 32 | Opus | `app/components/tasks-create-modal.tsx` breaks the unified create shape three ways: `:54` is `size="xl"` with no `mobileFullScreen`; `:65` puts two `<form>`s side by side in a `grid … md:grid-cols-2` inside one dialog; the `footer` at `:59-63` holds only a Cancel button, so each form submits from its own body instead of from the footer by `form="…"`; and there is no `useCloseOnSuccess`, so the dialog stays open after a successful create. | Rebuild it on the `app/app/(app)/expense-reports/create-expense-report-modal.tsx` pattern: one form, `size="md"`, `mobileFullScreen`, submit in the `footer` with `form="…"`, `useCloseOnSuccess`. If both creates are genuinely needed, they are two buttons and two modals, not two forms in one. | d7e45a4 | done |
| 33 | Opus | `app/app/(app)/tasks/client.tsx:558-563` — the edit pencil is a `<form action={updateTaskFormAction}>` containing only hidden ids and a submit `IconButton`, so clicking it posts an update with no field values instead of opening an editor. | Make the pencil a plain `<IconButton onClick>` that opens the edit modal from issue 29. Verify against `app/app/(app)/tasks/actions.ts` that the action is not silently blanking fields today. | d7e45a4 | done |
| 34 | Opus | `app/app/(app)/users/client.tsx:86-141` is a page-level section form but every control is `size="sm"`: `:90`, `:93`, `:96`, `:115`, `:132`, `:141`. CLAUDE.md scopes `sm` to "table/list-row actions and toolbars" and `md` to "section forms". | Drop the `size="sm"` props so the row falls back to `md`; the grid at `:86` may need its `170px`/`200px` track widths nudged for the taller controls. | 72a5e43 | done: dropped size="sm" |
| 36 | Opus | Required fields are marked with a `*` appended to the label in exactly two files — `app/app/(app)/events/create-event-modal.tsx:117-148` and `app/components/add-journal-entry-modal.tsx:98-150` — and nowhere else, even though most modals have required inputs. | Pick one convention and apply it in `app/components/ui/Field.tsx`: add a `required` prop that renders the marker, and set it from the fields that already pass `required` to their `<Input>`. Remove the two files' hand-appended `` `${label} *` `` strings. |  |  |
| 37 | Opus | `app/app/(app)/pos/till.tsx:299-321` — the two page-nav arrows are raw `<button>`s carrying `h-[66px] … lg:h-[48px]` plus their own border, hover and disabled recipe. CLAUDE.md: "Never hand-size a control … if a size is missing, change the scale, not the screen." | Add the oversized till size to `app/components/ui/control.ts` (e.g. a `touch` step) and use `<IconButton size="touch" label={copy.previousPage}>`, or if the till is genuinely a one-off, add the variant to `IconButton` rather than to the screen. Keep `basis-[30%]` — that is layout and may stay on the screen. |  |  |
