# 114 — Journal bulk edit: keystroke lag (trace analysis + fix)

Source: `docs/soa/trace_baleinev_backoffice.gz` — a 7.3 s DevTools trace of typing
into a bulk-edit row on `/journal` in production (`blv.cabras.ch`, minified build).
Re-run the numbers any time with:

```sh
python3 docs/soa/analyze-trace.py docs/soa/trace_baleinev_backoffice.gz
```

## What the trace says

**The app is not monitoring anything.** 21 keystrokes produced 21 `input` events —
one per key, as expected. There are zero network requests, zero timers and no
app-level key listener in the window. The "thousands of events" in the DevTools
panel are the profiler's own instrumentation (467 `ProfileChunk`s, ~250
`v8::Debugger::AsyncTask*`, 606 `UpdateCounters`), GC slices, and React's internal
function calls. Nothing to remove there.

**The real problem: every keystroke re-renders the entire ledger, synchronously.**

| Metric (baseline, user's trace) | Value |
|---|---|
| `input` handler per keystroke — median / p95 / max | **114.9 ms** / 201 ms / 220 ms |
| Long tasks > 50 ms | 32 of them, 4.4 s total in 7.3 s |
| JS inside React's sync work loop (render + commit) | 2.46 s — render ≈ 1.40 s, commit ≈ 1.05 s |
| `Paint` per frame — median | 29.7 ms (paints a ~9 000 px tall region, not the viewport) |
| `HitTest` per mouse move — median | 7.3 ms |
| Layout objects on the page | **29 353** |

A frame budget is 16 ms. Every key costs ~7 frames of JS plus a 30 ms paint.

### Cause, in `app/components/journal-table.tsx`

All state lives in one component, `JournalTable` (L119). Typing calls
`updateDraft` (L401–407) → `setBulkDrafts` → the whole component re-runs:

1. **Every row re-renders, in both views.** The desktop rows (L631–798) and the
   mobile cardlets (L805–967) are inline JSX in one `.map` each — no row component,
   no `memo`. The `CardletList` is `sm:hidden` (CSS) so it is invisible on desktop
   but React still renders and diffs it. ~650 rows × 2 views × 8 controls, and every
   `<Select>` rebuilds its full `<option>` list (L656, 732, 746, 891, 900, 910).
2. **Every derived value is recomputed per key**, none memoised: running balances
   (L195–212), filter (L214–244), sort (L246–277), `bulkEditableEntries` +
   `changedEntries` which calls `isDirty` → `draftFromEntry` (a `toISOString` and
   a `toFixed`) for every entry (L360–363), the three filter option lists
   (L409–411), and the `rows` array (L416–436) — which carries `draft`, so every
   row object is new on every key.
3. **Every row's props are new objects**, so React 19 flags every host element for
   an update and the commit phase walks all of them (≈ 50 ms/key of commit).
4. **DOM weight** (29 k layout objects) makes each paint and hit test expensive
   on its own. Step 5 addresses it only if steps 1–4 are not enough.

`app/app/(app)/journal/client.tsx` does **not** re-render on a keystroke (its only
state is the add-entry modal), so the fix is entirely inside `journal-table.tsx`.

## Pinned decisions — do not revisit

- No behaviour or markup change in steps 1–4. Same classes, same elements, same
  copy. `check:design` and `check:i18n` must be untouched by the refactor.
- Keep both views (table + cardlets) rendered as today. The CLAUDE.md rule "both
  fed by the same array" stands; memoised rows make the hidden view free.
- Inputs stay controlled. No `defaultValue`/ref-based rewrite.
- No new npm dependency in any step. Puppeteer (already in `app/package.json`)
  and `@prisma/client` are enough for the harness.
- Measurements compare a **production build** (`npm run build && npm start`),
  never `next dev` — dev React is several times slower and would mislead.

## Execution

Each step is written to run in a fresh context. Open **only** the files the step
lists. Paths are from the repo root; npm runs from `app/`. Quote paths containing
`(app)` — it is a zsh glob. Commit at the end of each step (CLAUDE.md), on `main`,
staging only the files the step names — the working tree carries unrelated
untracked files that are not yours.

| Step | Model | What |
|---|---|---|
| 1 | Sonnet | Measurement harness (fixture + puppeteer trace) |
| 2 | Haiku (high effort) | Baseline measurement, write numbers into this file |
| 3 | Sonnet | Extract pure helpers + unit tests |
| 4 | Sonnet | Memoised row components + memoised derived data |
| 5 | Haiku (high effort) | Checks + after-measurement, decide gate |
| 6 | Opus — **only if the gate in step 5 fails** | Row windowing in bulk mode |
| 7 | Haiku (high effort) | Final checks, docs, move plan to `done/` |

---

### Step 1 — Sonnet: measurement harness

**Open only:** `app/package.json`, `app/app/(auth)/login/login-form.tsx` (lines
90–130, the form fields), `app/prisma/schema.prisma` (models `Edition`,
`MoneyAccount` L296, `Budget`, `CostCenter`, `JournalEntry` L350–385, `User` field
`selectedEditionId`), `docs/soa/analyze-trace.py` (read the docstring only).

**Create `app/scripts/measure-journal-typing.mjs`** — a plain Node ESM script
(`node scripts/measure-journal-typing.mjs <label>`), run from `app/` against a
server that is already running. It must:

1. Load env with `import "dotenv/config"` (values in `app/.env` are quoted;
   dotenv strips the quotes). Read `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `BASE_URL` (default `http://localhost:3000`), `LOAD_ENTRIES` (default `700`).
2. **Fixture (idempotent)** with `new PrismaClient()` from `@prisma/client`:
   - upsert an edition named `DEV — Journal load` (open: `closedAt` null,
     `isDefault: false`, dates 2030-01-01 → 2030-12-31);
   - in it, ensure 2 money accounts (`Load bank`, `Load cash`), 20 budgets
     (`Load budget 01`…`20`) and 30 cost centres (`L01`…`L30`) exist — fill any
     other required columns from the schema with obvious placeholder values;
   - if the edition's journal-entry count ≠ `LOAD_ENTRIES`, `deleteMany` its
     entries and `createMany` `LOAD_ENTRIES` new ones: `sequenceNumber` 1…N,
     dates spread over 2030, alternating `CHARGES`/`PRODUITS`, amounts
     `(i % 500) + 0.5`, labels `Load entry ${i}`, counterparty `Supplier ${i % 40}`,
     budgets/accounts/cost centres assigned round-robin, `isOpeningEntry: false`.
   - Refuse to run (exit 1 with a message) if `NODE_ENV === "production"`.
3. **Point the admin at that edition**: read the admin user's `selectedEditionId`,
   set it to the load edition, and restore the original value in a `finally`
   block — whatever happens, the admin's working edition must come back.
4. **Browser** (`import puppeteer from "puppeteer"`), headless, viewport
   1280×960 (≥ `lg`, so the desktop table is the visible view):
   - `goto ${BASE_URL}/login`, fill `input[name=email]` and
     `input[name=password]`, click `button[type=submit]`, wait for navigation.
     If `input[name=totp]` appears instead, exit 1 with "admin has 2FA enabled
     locally — disable it or use an account without it".
   - `goto ${BASE_URL}/journal`, wait for `table tbody tr`.
   - Click the button whose text is `Bulk edit` or `Édition groupée`
     (the two locales of `journal.bulkEdit` in `app/lib/i18n-dictionaries.ts`).
   - Wait for `table tbody tr:first-child td:nth-child(5) input`, click it,
     press `End`.
   - `page.tracing.start({ path })` with default categories, where `path` is
     `docs/soa/traces/<label>.json` resolved from the repo root (create the
     folder). Then `page.keyboard.type("abcdefghijklmnopqrst", { delay: 80 })`,
     wait 1 s, `page.tracing.stop()`.
   - Close the browser.
5. Run `python3 ../docs/soa/analyze-trace.py <that path>` via `execFileSync`
   and print its output.

**Also:** add `docs/soa/traces/` and `docs/soa/*.json` to the root `.gitignore`
(traces are 5–10 MB each and regenerate on demand).

**Done when:** `npm run build && npm run lint` pass (the script is `.mjs` outside
the Next graph; lint may or may not cover it — both results are fine as long as
there are no new errors). Do not run the measurement — step 2 does.

**Commit:** `git add app/scripts/measure-journal-typing.mjs .gitignore` then
`git commit -m "chore(journal): add bulk-edit typing measurement harness"`.

---

### Step 2 — Haiku (high effort): baseline measurement

**Open only:** this file. Do not read or edit source code.

1. From `app/`: `npm run build`, then start the server in the background with
   `npm start` and wait until `http://localhost:3000/login` returns 200.
2. `node scripts/measure-journal-typing.mjs baseline`.
3. Stop the server.
4. Paste the analyzer output verbatim into the **Results** table at the bottom
   of this file (column "Baseline (headless)").

If the script fails, do not fix it: paste the full error into the Results
section under "Step 2 failure", commit, and stop — step 1 goes back to Sonnet.

**Commit:** `git add docs/plans/114-journal-analysis-results.md` then
`git commit -m "docs(plan-114): record baseline bulk-edit typing measurement"`.

---

### Step 3 — Sonnet: pure helpers + unit tests

**Open only:** `app/components/journal-table.tsx` lines 40–117 and 195–277,
`app/app/(app)/articles/actions.test.ts` (test style reference, first 40 lines),
`app/vitest.config.ts`.

Create **`app/lib/journal-grid.ts`** (no `"use client"`, no React imports) and
move the pure logic there, typed on a minimal structural entry type so the
test does not need the full `JournalEntry`:

- `type EntryDraft` (move it from `journal-table.tsx` L71–80 and export it).
- `draftFromEntry(entry)` (L101–112) — unchanged.
- `buildRunningBalances(entries, openingBalances): Record<string, number>` —
  the body of L195–212 (sort by `sequenceNumber` then `id`, accumulate per
  `moneyAccountId`, `PRODUITS` adds, `CHARGES` subtracts).
- `filterEntries(entries, filters)` — the body of L215–244, unchanged semantics.
- `sortEntries(entries, sortBy)` — the body of L247–277, unchanged semantics.
- `isDraftDirty(baseline: EntryDraft, draft: EntryDraft): boolean` — field-by-
  field `!==` over the eight keys (replaces `isDirty`, which rebuilt the
  baseline on every call).

In `journal-table.tsx`, import these and delete the moved code; replace the
inline blocks with calls. `isDirty(entry, draft)` call sites become
`isDraftDirty(draftFromEntry(entry), draft)` for now — step 4 memoises the
baseline.

Create **`app/lib/journal-grid.test.ts`** covering:
- running balances: opening balance carried, two accounts kept separate, order
  by `sequenceNumber` not array order, tie broken by `id`;
- `isDraftDirty`: identical → false; each single field changed → true;
- `filterEntries`: an empty filter set returns everything; `label` is
  case-insensitive; a `costCenter` filter keeps entries with no cost centre
  (current behaviour at L240 — preserve it, the test documents it);
- `sortEntries`: `null` keeps order; `amount` asc/desc numeric, not lexical.

**Done when** (from `app/`): `npm test`, `npm run build`, `npm run lint` pass.

**Commit:** `git add app/lib/journal-grid.ts app/lib/journal-grid.test.ts app/components/journal-table.tsx`
then `git commit -m "refactor(journal): extract grid logic to lib/journal-grid with tests"`.

---

### Step 4 — Sonnet: memoised rows (the fix)

**Open only:** `app/components/journal-table.tsx` (whole file — it is the
subject) and `app/app/(app)/journal/client.tsx` lines 95–110.

Line numbers below are the pre-step-3 ones; step 3 shortened the file, so find
each block by the code quoted, not the number.

**4a. Stable callbacks** (in `JournalTable`):
- Replace `updateDraft` with two `useCallback(…, [])` functions, both
  `(entryId: string, patch: Partial<EntryDraft>) => void`:
  `updateBulkDraft` (the `setBulkDrafts(current => …)` branch) and
  `updateEditDraft` (the `setEditDraft(current => …)` branch, ignores
  `entryId`). Then `const onDraftChange = isBulkEditing ? updateBulkDraft : updateEditDraft;`
- `handleEditStart` → `useCallback((entry) => {…}, [])`.
- New `cancelInlineEdit = useCallback(() => { setEditingId(null); setEditDraft(null); }, [])`
  replacing the inline arrow on the row's cancel `IconButton`.
- `saveFormAction` / `deleteFormAction` from `useActionState` are already
  stable — pass them as-is.

**4b. Memoised derived data** (`useMemo`):
- `runningBalanceByEntryId = useMemo(() => buildRunningBalances(entries, accountOpeningBalances), [entries, accountOpeningBalances])`
- `sortedEntries = useMemo(() => sortEntries(filterEntries(entries, filters), sortBy), [entries, filters, sortBy])`
- `bulkEditableEntries = useMemo(() => entries.filter(e => !e.isOpeningEntry), [entries])`
- `baselineById = useMemo(() => Object.fromEntries(bulkEditableEntries.map(e => [e.id, draftFromEntry(e)])), [bulkEditableEntries])`
- `changedEntries = useMemo(() => bulkDrafts ? bulkEditableEntries.filter(e => bulkDrafts[e.id] && isDraftDirty(baselineById[e.id], bulkDrafts[e.id])) : [], [bulkDrafts, bulkEditableEntries, baselineById])`
- `startBulkEdit` seeds from `baselineById` with a shallow copy per entry
  (`{ ...baselineById[id] }`), not by calling `draftFromEntry` again.
- `uniqueBudgets`, `uniqueAccounts`, `uniqueCostCenters` → one `useMemo([entries])`.
- `rows = useMemo(() => sortedEntries.map(…), [sortedEntries, runningBalanceByEntryId, accountBalances, locale, isReadOnly])`
  with the **`draft` field removed** from the row object. Name the row type
  `JournalRow = …` (derive with `ReturnType` or declare it; either is fine).

In `app/app/(app)/journal/client.tsx`, wrap the `accountOpeningBalances`
`Object.fromEntries(…)` (L102) in a `useMemo([activeEdition.moneyAccounts])`
declared at the top of the component, so the memo in 4b holds when the modal
opens or closes.

**4c. Two memoised row components** — same file, above `JournalTable`, using
`memo` from `react`:

- `const JournalTableRow = memo(function JournalTableRow(props) {…})` — its body
  is the current `<TR key={entry.id} …>…</TR>` block (the desktop `rows.map`
  callback body) **moved verbatim**, with only these substitutions:
  `updateDraft(` → `onDraftChange(`, `handleEditStart(entry)` → `onEditStart(entry)`,
  the cancel arrow → `onCancelEdit`, and `copy`/`shellCopy` read from
  `dictionaries[locale]` inside the component. Props: `row`, `draft: EntryDraft | null`,
  `isBulkEditing`, `onDraftChange`, `onEditStart`, `onCancelEdit`, `budgets`,
  `moneyAccounts`, `costCenters`, `locale`, `saveFormAction`, `isSaving`,
  `deleteFormAction`, `isDeleting`. The `key` stays on the element in the parent map.
- `const JournalCardlet = memo(function JournalCardlet(props) {…})` — the
  `<Cardlet key=…>…</Cardlet>` block moved verbatim, same substitutions. Props:
  `row`, `draft`, `isBulkEditing`, `onDraftChange`, `budgets`, `moneyAccounts`,
  `costCenters`, `locale`, `deleteFormAction`, `isDeleting`.

In `JournalTable`, both maps become one-liners passing
`draft={draftFor(row.entry.id)}` where
`const draftFor = (id: string) => (isBulkEditing ? bulkDrafts[id] : editingId === id ? editDraft : null) ?? null;`.

Why this works (keep in mind, do not add as comments): `setBulkDrafts` spreads
the outer record but keeps every untouched per-entry draft object, so only the
edited row sees a new `draft` prop; every other prop is stable → `memo` skips
~649 of 650 rows in each view.

Do **not** pass new inline objects/arrays/arrow functions as props to the
memoised components — that silently defeats `memo`. Every prop must be a
primitive, a `useCallback`/`useMemo` value, a `useActionState` value, or a
prop `JournalTable` itself received.

**Done when** (from `app/`): `npm run build`, `npm run lint`,
`npm run check:design`, `npm run check:i18n`, `npm test` all pass. Then a manual
smoke test against the step-1 fixture (`npm run build && npm start`, log in as
admin): bulk edit → change a label, an amount and a select → "Save all (3)"
shows 3 → save → values persisted; inline edit (pencil) on one row → save and
cancel both work; delete still works on a non-invoice row.

**Commit:** `git add app/components/journal-table.tsx "app/app/(app)/journal/client.tsx"`
then `git commit -m "perf(journal): memoise bulk-edit rows so a keystroke re-renders one row"`.

---

### Step 5 — Haiku (high effort): after-measurement + gate

**Open only:** this file.

1. From `app/`: `npm run build && npm run lint && npm run check:design && npm run check:i18n && npm test`.
   Record pass/fail per command in Results. On any failure, paste the output,
   commit, and stop — step 4 goes back to Sonnet.
2. `npm start` in the background, wait for `/login` → 200,
   `node scripts/measure-journal-typing.mjs after-memo`, stop the server.
3. Paste the analyzer output into Results, column "After step 4 (headless)".
4. **Gate** — write the verdict in Results:
   - **PASS** if `input handler` median ≤ 16 ms **and** `Paint` median ≤ 16 ms
     → skip step 6, go to step 7.
   - **FAIL** otherwise → step 6 (Opus). State which of the two numbers failed.

**Commit:** `git add docs/plans/114-journal-analysis-results.md` then
`git commit -m "docs(plan-114): record post-memo measurement and gate verdict"`.

---

### Step 6 — Opus (conditional): windowing the bulk grid

Run only if step 5's gate is FAIL. The remaining cost is DOM weight: ~650 rows ×
8 live controls → ~29 k layout objects, so paint and hit testing stay slow even
when React does nothing.

**Open:** `app/components/journal-table.tsx`, `app/components/ui/Table.tsx`,
`app/components/app-shell.tsx` (only to find the page's scroll container),
this plan's Results.

**Scope, pinned:**
- Window **only the desktop table, only while bulk editing**. Read mode and the
  mobile cardlets stay as they are.
- No new dependency. Top and bottom spacer `<tr>`s (one `<td colSpan={10}>`
  each, height = hidden rows × row height), overscan of 20 rows each side, row
  height measured once from the first rendered row.
- **First determine which element scrolls** — `<Table frame={false}>` wraps the
  table in an `overflow-auto` div (`Table.tsx` L39) with `frameClassName="flex-1"`,
  but whether that div or `<main>`/the document actually scrolls depends on the
  shell's height chain. The trace's `Paint` events cover the `#document` layer
  over a ~9 000 px clip, which suggests the document; confirm in the browser
  before writing the scroll listener.
- Keep `THead`'s `sticky top-0` working and the column-resize handles working.
- Tab from the last rendered row's last control must still reach the next
  row (overscan makes it rendered; confirm by hand).
- If windowing belongs in the `Table` primitive rather than the screen, that is
  a design-system change — CLAUDE.md's ladder (reuse → prop → layout class)
  applies; document a new prop in the component if you add one.

**Done when:** all five checks pass; `node scripts/measure-journal-typing.mjs after-window`
recorded in Results with the gate re-evaluated; manual pass of the step-4 smoke
test plus: scroll to the middle of the grid, edit a row, Save all → the right
row changed.

**Commit:** stage the touched source files and this plan, then
`git commit -m "perf(journal): window the bulk-edit grid to cut DOM weight"`.

---

### Step 7 — Haiku (high effort): close out

**Open only:** this file and `docs/testing.md`.

1. Re-run the five checks from `app/`; record in Results.
2. In `docs/testing.md`, after the unit-tests table, add a short section
   "Measuring the journal bulk-edit" with the three commands: `npm run build`,
   `npm start`, `node scripts/measure-journal-typing.mjs <label>` — noting it
   needs a production build, the local DB, and the admin credentials in
   `app/.env`, and that it restores the admin's selected edition afterwards.
3. Add to Results: "User to confirm: record a new trace on production after
   deploy and run `python3 docs/soa/analyze-trace.py <file>`; compare with the
   baseline table at the top of this plan."
4. `git mv docs/plans/114-journal-analysis-results.md docs/plans/done/`.

**Commit:** `git add docs/testing.md docs/plans` then
`git commit -m "docs(plan-114): close journal bulk-edit performance plan"`.

---

## Results

| | Baseline (headless) | After step 4 (headless) | After step 6 (headless) |
|---|---|---|---|
| input handler median / p95 | 223.1 ms / 477.6 ms | | |
| Paint median | 33.5 ms | | |
| HitTest median | 5.5 ms | | |
| layout objects | 44487 | | |
| long tasks (>50 ms) n / total | 40 / 7398.1 ms | | |

Checks (step 5 / step 7):

**npm run build:** ✓ PASS
**npm run lint:** ✗ FAIL

```
/home/mcabras/Developer/baleinev-backoffice/app/app/(app)/tasks/client.tsx
   51:9  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  350:9  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/mcabras/Developer/baleinev-backoffice/app/lib/proof-upload.ts
  57:3  warning  Unused eslint-disable directive (no problems were reported from 'no-control-regex')

/home/mcabras/Developer/baleinev-backoffice/app/types/next-auth.d.ts
  2:15  warning  'JWT' is defined but never used  @typescript-eslint/no-unused-vars

✖ 4 problems (2 errors, 2 warnings)
```

Step 4 (Sonnet) returned with lint errors. Step 5 stopped per plan.

Gate verdict (step 5): BLOCKED — lint errors in step 4

Notes:
