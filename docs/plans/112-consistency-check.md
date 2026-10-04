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
| 37 | Opus | `app/app/(app)/pos/till.tsx:299-321` — the two page-nav arrows are raw `<button>`s carrying `h-[66px] … lg:h-[48px]` plus their own border, hover and disabled recipe. CLAUDE.md: "Never hand-size a control … if a size is missing, change the scale, not the screen." | Add the oversized till size to `app/components/ui/control.ts` (e.g. a `touch` step) and use `<IconButton size="touch" label={copy.previousPage}>`, or if the till is genuinely a one-off, add the variant to `IconButton` rather than to the screen. Keep `basis-[30%]` — that is layout and may stay on the screen. |  |  |
