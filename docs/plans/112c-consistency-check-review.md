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

Execute §1, §2 and §3 the same way as 112 phase 2: one issue = one commit,
update the row in place, record it in 112b. §3 was decided by the user on
2026-10-05; it is the larger work, so do §1 and §2 first. Within §3, do D3a
before E4 if E4 is not done yet (E4 then picks up the new tokens for free).

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

## 3. Decided by the user (2026-10-05)

Decisions: **D1 — every delete asks for confirmation.** **D2 — dropped**: the
templates page is going to become the invoices app's settings, so its inline
editor is left alone until then. **D3 — fix the contrast** with status tokens.
**P1** is a new request: the passwords 2FA code.

### D1 — Every delete asks for confirmation

There is one confirm shape, and it already exists on six screens
(`app/app/(app)/departments/client.tsx:161-180` is the reference): a
`<Modal size="sm">`, the item named in the body, Cancel + a destructive button in
the footer. D1a turns it into one primitive; D1b–D1d put it on every delete that
is still one click.

**Not in scope, on purpose:** removing a line from something that is not saved
yet. Nothing stored is lost, and a dialog on each cart line would slow a sale
down at the till. The cases are the invoice editor's line items
(`invoices/client.tsx:999-1006`), till cart lines (`pos/till.tsx:333`), "clear
sale" (`pos/till.tsx:342-351`) and `<ChipRemoveButton>`. Also out of scope are
the deletes that already confirm: the modals in budget, calendar, passwords,
departments, addresses/settings, stock/settings places and the POS stack editor,
plus the typed "delete" on task todos. Leave those as they are.

| # | Model | What's broken (file:line) | Fix | Fixed at | Solution |
|---|-------|---------------------------|-----|----------|----------|
| D1a | Sonnet | No shared confirm. Every confirming screen hand-rolls its own `Modal` + state + form id, and the other half skip it. | New `app/components/ui/ConfirmDelete.tsx` (`"use client"`), exported from `components/ui/index.ts`. Props: `label` (trigger's accessible name, modal title and confirm-button text), `subject?` (the item's name, rendered `font-semibold`), `message?` (rendered `text-sm text-[var(--muted)]`), `cancelLabel`, `trigger?: "icon" \| "button"` (default `"icon"`: `<IconButton tone="delete"><Trash2/></IconButton>`; `"button"`: `<Button variant="destructive" icon={<Trash2/>}>{label}</Button>`), `size?`, `disabled?`, `className?`, and **either** `form: string` (the confirm button is `type="submit" form={form}`) **or** `onConfirm: () => void`. The trigger opens a `<Modal size="sm" title={label}>`. Its footer is Cancel (`variant="secondary"`) + confirm (`variant="destructive"`), and both close the modal on click. `<Modal>` portals into `<body>`, so the confirm button is **outside** the row's form: the `form` attribute is what links them, so each row's form needs a unique `id`. Add `common.cannotBeUndone` (en "This cannot be undone." / fr "Cette action est irréversible.") next to `common.delta` in both locales: it is the default `message` every screen passes. Document the component in CLAUDE.md's component table (`Delete anything` → `<ConfirmDelete>`). | | |
| D1b | Sonnet | Row deletes that submit on one click. For each line below: give the existing `<form action=…>` an `id` (`delete-<thing>-${item.id}`), take the `IconButton`/`Button` out of it so the form keeps only its hidden inputs, and put `<ConfirmDelete form={thatId} label={…same label as today…} subject={item name} message={copy.common.cannotBeUndone} cancelLabel={copy.shell.cancel} disabled={…same as today…}>` where the trigger was. A disabled reason that swaps the label (cost-centers, money-accounts, event types, journal "locked", articles "blocked") stays as it is: pass the swapped `label`, and the trigger is `disabled`. | `editions/client.tsx:165` (a whole edition) · `users/client.tsx:137-145` (the form at :123 already has an id: only swap the `Button` for `<ConfirmDelete trigger="button">`) · `cost-centers/client.tsx:113` · `money-accounts/client.tsx:111` · `budget/client.tsx:387` (budget line) · `events/client.tsx:464` (event, `trigger="button"`) and `:665` (shift) · `events/settings/client.tsx:79` · `stock/client.tsx:247` · `stock/settings/client.tsx:329` (conversion) · `addresses/client.tsx:467` (desktop) and `:537` (cardlet, `trigger="button" size="sm"`) · `addresses/[addressId]/client.tsx:236-245` (the form at :226 already has `DELETE_FORM_ID`) and the bank account at `:334` / `:373` (`trigger="button" size="sm"`) · `articles/client.tsx:78` (the `deleteButton()` helper: both variants) · `tasks/client.tsx:233` (`trigger="button" size="sm"`) and `:504` (this also closes E1's `:506` label: use `copy.tasks.deleteTask`) · `templates/client.tsx:149` · `components/journal-table.tsx:365` and `:552`. Check: `grep -rn 'tone="delete"\|variant="destructive"' app components` → every hit is either inside `ConfirmDelete.tsx`, a modal footer's confirm button, or a scope exclusion listed above. | | |
| D1c | Haiku | Two screens confirm with the browser's `window.confirm`. It looks like neither the app nor the other 20 deletes, and its OK/Cancel buttons are not translated. `pos/sessions/client.tsx:69-73` + `:81`, `pos/templates/client.tsx:61-65` + `:83`. | Delete both `confirmDelete` functions and the `onSubmit={confirmDelete}`, and use `<ConfirmDelete>` as in D1b. The existing `copy.deleteSessionConfirm` / `copy.deleteTemplateConfirm` become the `message`. (The `window.confirm` calls in `events/add-shift-form.tsx:36`, `edit-shift-form.tsx:62` and `pos/sessions-modal.tsx:67` are overlap/close warnings, not deletes. Leave them.) | | |
| D1d | Sonnet | Invoice delete is one click and goes through `fetch`, not a form: `invoices/client.tsx:687-696` calls `handleDeleteInvoice(item)` (`:565`). | `<ConfirmDelete onConfirm={() => handleDeleteInvoice(item)} label={copy.invoices.deleteInvoice} subject={item number} …>`, keeping today's `disabled` and the paid-invoice `title`. | | |

### D3 — Status colours that read on both themes

Today `emerald-300` / `rose-300` / `amber-300` are fixed shades. Against the
light theme's `--page` (`#efe6d8`) they reach **1.23 / 1.53 / 1.17 : 1**, where
the body-text minimum is 4.5. On the dark theme they are 9–12 : 1, which is fine.
The fix is three tokens that are allowed to differ by theme. Same reach warning
as any token: this repaints every badge, alert, signed amount and delete button.
On the dark theme the values below **are** today's shades, so only the light
theme visibly changes. The one exception is Alert (see D3a).

| Token | Dark (`:root`) | Light (`:root[data-theme="light"]`) | Light contrast vs `--page` / `--panel` |
|---|---|---|---|
| `--good` | `#6ee7b7` (emerald-300, unchanged) | `#065f46` (emerald-800) | 6.21 / 6.89 |
| `--bad` | `#fda4af` (rose-300, unchanged) | `#be123c` (rose-700) | 5.08 / 5.64 |
| `--warn` | `#fcd34d` (amber-300, unchanged) | `#92400e` (amber-800) | 5.73 / 6.36 |

| # | Model | What's broken (file:line) | Fix | Fixed at | Solution |
|---|-------|---------------------------|-----|----------|----------|
| D3a | Sonnet | Status colours in the primitives are fixed shades: `components/ui/SignedAmount.tsx:8`, `Badge.tsx:6-8`, `Alert.tsx:6-8`, `Button.tsx:50` (destructive), `IconButton.tsx:25-27` (save/delete/warning), `Field.tsx:21` (error), `Input.tsx:21` (danger), `Chip.tsx:36` (`hover:text-rose-400`). | Add the three tokens to `app/app/globals.css`: in `:root` after `--accent-strong`, and in `:root[data-theme="light"]`, with one comment saying they are status colours, never categories. Then, in the primitives: text → `text-[var(--bad)]` etc.; tinted fills → `bg-[var(--bad)]/15` (Badge) or `/10` (Alert, hover states); borders → `border-[var(--bad)]/30`–`/60` (keep each line's current opacity step). `emerald-400` (IconButton save) maps to `--good` too. Alert's text goes from `-200` to the token (`-300` on dark), a small shift that is on purpose: one shade per status. After `npm run build`, open a page with an Alert and a Badge on both themes (theme toggle in the account menu) to confirm Tailwind v4 emitted the `/NN` opacity on the `var()` colour. | | |
| D3b | Haiku | The same shades hand-typed in screens: `budget/client.tsx:95-96` (progress fills + text; `bg-emerald-400`/`bg-rose-400` → `bg-[var(--good)]`/`bg-[var(--bad)]`) · `:559`, `:563`, `:590`, `:607` (→ `signedAmountClasses`, see E4) · `calendar/client.tsx:101-102` and `:482-483` · `expense-reports/client.tsx:222`, `:321` · `events/client.tsx:587` · `stock/client.tsx:41` · `cash/journal-register-modal.tsx:120-121` (`rose-200`) · `passwords/client.tsx:57` · `pos/till.tsx:472` · `components/mobile/mobile-sheet.tsx:171`, `:179`. | Each one → the matching token (`emerald`→`--good`, `rose`→`--bad`, `amber`→`--warn`), with the same opacity modifier it has today. | | |
| D3c | Sonnet | Nothing stops the next screen from typing `text-rose-300` again, and CLAUDE.md still tells it to ("Destructive/error states use Tailwind `rose-*` utilities directly"). | Add a rule to `app/scripts/check-design.mjs` `RULES`: id `status-shade`, `re: /\b(?:text\|bg\|border\|ring\|fill\|stroke\|from\|to)-(?:emerald\|rose\|amber\|red\|green)-\d{2,3}\b/g`, msg "fixed status shade — use var(--good) / var(--bad) / var(--warn)" (the `\|` are markdown table escapes; the regex itself uses plain `|`). It must report 0 after D3a+D3b. In CLAUDE.md, add `--good` / `--bad` / `--warn` to the colour list ("status only: success / error-destructive / warning; light theme has its own values"), and replace the "Destructive/error states use Tailwind `rose-*`…" sentence with the token version, e.g. `border-[var(--bad)]/30 bg-[var(--bad)]/10 text-[var(--bad)]`. | | |

### P1 — Passwords: the 2FA code is a one-shot snapshot

| # | Model | What's broken (file:line) | Fix | Fixed at | Solution |
|---|-------|---------------------------|-----|----------|----------|
| P1 | Sonnet | `app/app/(app)/passwords/client.tsx:201-231`, `:282-295`. A 2FA entry shows a "2FA" button. One click fetches **one** code (`loadTotp` → `getTotpCodeAction`), stores `secondsRemaining` **once**, and swaps the button for the code. Nothing ticks the counter (it stays at e.g. "17s") and nothing fetches the next code, so after ≤30 s the row shows an expired code until the page is reloaded. It should just show the current code, always, with no click. | **1. Remaining time in ms.** `app/lib/totp.ts:75-85`: add `msRemaining` to `TotpCode` (`const periodMs = period * 1000; const msRemaining = periodMs - (Date.now() % periodMs);`), and carry it through `TotpResult` (`passwords/actions.ts:27`) and the return at `:245-247`. `secondsRemaining` is rounded up, so the client would show a dead code for up to 1 s if it used that. **2. Hook.** Add `useLiveTotp(entryId: string, enabled: boolean)` in a new `app/app/(app)/passwords/use-live-totp.ts`. It returns `{ code, secondsLeft, error, retry }`. State is `{ code, expiresAt }` with `expiresAt = Date.now() + msRemaining`, set when the response arrives (this ignores server/client clock skew). Fetch on mount when `enabled`. A 1 s `setInterval` sets `now`; `secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000))`. When `now >= expiresAt`, fetch the next code; a `useRef` flag stops two fetches overlapping. While `document.hidden`, clear the interval. On `visibilitychange` back to visible, restart it and fetch at once if expired. On an error, stop refetching and expose `error`; `retry()` clears it and fetches. Clean up the interval and listener on unmount. **3. Row.** In `EntryRow`, replace the `totp` state, `loadTotp` and the button branch with `const totp = useLiveTotp(entry.id, entry.has2fa)`. When `entry.has2fa`, always render the pill at `:284-288`: the code (or `••• •••` in `text-[var(--muted)]` before the first response), `{secondsLeft}s`, and the `CopyButton` (disabled until a code exists). Show the existing `ShieldCheck` + `copy.field2fa` button only when `totp.error` is set, as `onClick={totp.retry}`, next to the `FormError` at `:298`. **Do not** move code generation to the client: the seed stays server-side (`lib/totp.ts:4-5`). The cost is one server action per 2FA entry every 30 s while the tab is visible. **4. Test.** New `app/lib/totp.test.ts` using the RFC 6238 SHA-1 vector: seed `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`, `vi.setSystemTime(59_000)` → `code === "287082"`, `msRemaining === 1000`. At `vi.setSystemTime(60_000)` → `msRemaining === 30000` and a different code. | | |

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
