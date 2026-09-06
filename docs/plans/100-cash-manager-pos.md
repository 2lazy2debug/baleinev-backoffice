# 100 — Cash manager & point of sale (master)

The intranet already keeps a **journal**, **money accounts** and a **stock** with
a catalogue behind it. What it cannot do is take money at a bar: open a till with
a counted float, sell things from a grid, hand back change, and book the result
into the journal at the end of the night.

This master file is the shared context for seven subplans. **Read this file once,
then read exactly one subplan and work from those two files only.** Do not read
the other subplans — not reading them is the entire point of the split.

| # | Subplan | What it delivers | Needs |
|---|---|---|---|
| 101 | [Articles app](done/101-articles-app.md) ✅ | The catalogue leaves `/stock/items` and becomes its own `/articles` app, with a `tracksStock` flag | — |
| 102 | [Cash registers](102-cash-registers.md) | Open a till on a cash account with a counted float, close it with a counted count. No journal writes. | — |
| 103 | [POS templates](103-pos-templates.md) | A 3x3 paginated grid of articles and prices, saved as a reusable template | 101 |
| 104 | [POS sessions & selling](104-pos-sessions.md) | Open/pause/close a session, sell from the grid, take cash or Twint or bank, compute change, record every sale | 102, 103 |
| 105 | [Session history](105-pos-session-history.md) | The read side: what each session sold, by payment method, with the change handed back | 104 |
| 106 | [Closing a register into the journal](106-register-close-journal.md) | The three journal entries a closed till produces, including the user-correction gap | 104 |
| 107 | [A sale moves stock](107-pos-stock-movements.md) | Selling an article with `tracksStock` on writes a `StockMovement` | 104 |

**The chain is 101 → 102 → 103 → 104 → {105, 106, 107}.** 101 and 102 are
independent of each other and may be done in either order. 105, 106 and 107 are
independent of each other and may be done in any order once 104 has landed.

**Done so far:** 101 (shipped in v0.34.0).

---

## What already exists

You do not need to read the whole codebase. These are the facts, and the file
paths, that the subplans build on. Every path below is relative to `app/`.

### The money side

- **`Edition`** is the fiscal year. Almost everything financial hangs off it.
  Resolve it with `resolveEditionIdOrNull()` when rendering and
  `resolveWritableEditionId()` when writing — both in `lib/edition-context.ts`.
  A closed edition is read-only and `resolveWritableEditionId()` is what enforces
  that. Never re-implement the check.
- **`MoneyAccount`** — `id, editionId, name, type (BANK | CASH | OTHER),
  openingBalance`. A cash register is opened **against a `MoneyAccount` whose
  `type` is `CASH`**. Managed at `app/(app)/money-accounts/`.
- **`JournalEntry`** — `id, editionId, budgetId?, moneyAccountId, accountType
  (CHARGES | PRODUITS), sequenceNumber, date, amount, label, counterparty?,
  referenceNumber?, costCenterId?, enteredById?`. `amount` is always **positive**;
  the direction lives in `accountType` (`CHARGES` = money out, `PRODUITS` = money
  in). Creation is `createJournalEntryAction` in
  `app/(app)/journal/actions.ts` — **read its `prisma.$transaction` block before
  writing any journal entry.** It takes a per-edition advisory lock and allocates
  `sequenceNumber` inside the transaction, and skipping that collides on
  `@@unique([editionId, sequenceNumber])`.
- **`Budget`** is a named envelope of money in an edition; `JournalEntry.budgetId`
  is nullable but the journal UI always sets it.

### The stock side

- **`StockElement`** is the *catalogue* entry — what can be stocked or sold:
  `id, name, brand?, barcode? (unique), unitId, unitQty, expireable`. This is the
  model 101 renames-in-place into "articles" at the UI level.
- **`StockItem`** is one element, in one place, at one expiry date.
  **`StockMovement`** is every quantity change, written by `applyMovement()` in
  `app/(app)/stock/actions.ts`. Nothing changes a quantity without writing one.
- Stock is **global, not edition-scoped**, and open to everyone signed in. Only
  units, places and deleting a catalogue entry are admin-only.

### The shell

- `components/app-shell.tsx` holds both navigation arrays (`adminNavigation`,
  `departmentNavigation`) as `NavigationItem[]`. Add a nav entry there and the
  mobile drawer picks it up for free — `components/mobile/mobile-shell.tsx`
  renders the same array.
- `BAR_HREFS` in `mobile-shell.tsx` is the four apps with a phone bar slot.
  **No subplan changes it.** Everything new lands in the "Other" drawer; which
  four apps deserve a bar slot is the user's call, not a plan's.
- UI copy lives in `lib/i18n-dictionaries.ts`, `en` and `fr`, and every key goes
  into **both**.

### The design system

`CLAUDE.md` at the repo root is not advice. Read it and obey it literally: no
hardcoded colour, no arbitrary radius, no pixel font size, no hand-sized control,
every surface and control imported from `components/ui/` (`Button`, `IconButton`,
`Card`, `CardGrid`, `Panel`, `PanelHeader`, `SectionTitle`, `Modal`, `Field`,
`Input`, `Select`, `MultiSelect`, `Checkbox`, `Radio`, `Table`, `Cardlet*`,
`Badge`, `Chip`, `Alert`, `SegmentedControl`, `PageHeader`, `EmptyPage`,
`Suggest`, `Menu`). `npm run check:design` must pass.

**Every "create X" is a header button plus a `<Modal>`** — never an inline form,
never a create/list tab strip, on either breakpoint. The reference implementations
are `components/tasks-create-modal.tsx` and
`app/(app)/expense-reports/create-expense-report-modal.tsx`.

---

## Ground rules — every subplan

1. **Money is integer rappen in code, `Decimal(10,2)` in the database.**
   Never add or subtract prices as JavaScript floats: `0.1 + 0.2` is how a till
   ends the night 1 rappen short. 102 creates `lib/cash.ts` with the conversion
   and the denomination list; everything after it imports from there.
2. **Migrations are hand-written SQL.** This repo does **not** run
   `prisma migrate dev`. Edit `prisma/schema.prisma`, run `npx prisma generate`
   from `app/`, and write
   `prisma/migrations/<YYYYMMDDHHMMSS>_<snake_name>/migration.sql` yourself, with
   comments explaining *why*. Copy the style from
   `prisma/migrations/20260906090000_drop_department_has_budget/migration.sql`.
3. **Server actions throw plain English sentences.** That is the convention in
   `stock/actions.ts` and `journal/actions.ts`. Only *UI copy* goes through the
   dictionaries, and it goes into both `en` and `fr`.
4. **One commit per step.** `git add . && git commit -am "<what you did>"`, as
   `CLAUDE.md` asks. **No branches.**
5. **`docs/` is updated inside the plan that changes the flow, never after.**
   `docs/business-processes.md` (append a new numbered section at the end, taking
   the next free number — renumber nothing), `docs/database.md` (new models),
   `docs/file-structure.md` (new routes and files).
6. **Reuse before you write.** If a screen needs a surface, a control or a
   heading, `components/ui/` already has it.

---

## Non-goals for the whole chain

Say so if asked; do not build them.

- **No card terminal integration.** "Twint" and "Bank" are labels on a payment
  method — the app records that the money arrived that way and nothing else.
- **No receipt printing, no customer display, no offline mode.** A session needs
  the network.
- **No per-seller cash drawer.** A session points at at most one register.
- **No article price on the article.** Prices live on the POS template cell, so
  the same article can be CHF 4 at one bar and CHF 5 at another.

---

## Delegating to subagents

Each subplan fits in one head; the *checking* is what does not, and checking is
where context is dead weight. Hand a subagent anything verifiable from its own
instructions alone, and ask for a verdict plus a `file:line` list — never a file
dump.

**Delegate:** running `npm run lint`, `npm run check:design` and `npm run build`
from `app/` and reporting failures verbatim with `file:line`; grep sweeps ("list
every `file:line` still referencing X"); dictionary parity ("compare the `pos`
block of `en` with the `pos` block of `fr` in `app/lib/i18n-dictionaries.ts`, list
keys present in one and missing from the other").

**Never delegate:** design decisions, modal and header shapes, anything that has
to honour `CLAUDE.md`, and the release step. A subagent starts cold and has not
read the design system.

Run independent checks in parallel in one message. A subagent's report is not
shown to the user — relay what matters yourself.

---

## Release protocol

Each subplan ships itself, unless several land in one session — then one release
at the end covering all of them is fine. **101–104 must not be released
half-done**; a release always leaves `npm run build` green.

Never hardcode a version. Read the latest tag and go one **minor** step up — these
are features:

```bash
cd /home/mcabras/Developer/baleinev-backoffice
git tag --sort=-v:refname | head -1        # e.g. v0.33.0  ->  NEXT = v0.34.0
```

1. Set `app/package.json` `"version"` to `NEXT` without the leading `v`.
2. `git commit -am "chore(release): bump version to <NEXT without v>"`
3. `git tag -a <NEXT> -m "<directive>"` — the directive is
   **`requires-migration`** for any subplan that added a `migration.sql`, and
   `non-breaking` otherwise. Each subplan states which one it is. A schema change
   tagged `non-breaking` deploys code against an unmigrated database.
4. `git push origin main --follow-tags`

**Do not monitor the deployment.** The updater picks the tag up within about two
minutes, snapshots first, health-checks and rolls back on its own. Do not poll
`journalctl`, do not ssh to the box, do not loop on `/api/health`. Push and report
what you shipped. The full tag vocabulary is in `docs/production.md`.

---

## Marking a subplan done

**A subplan is done the moment it has shipped its release.** Do not wait for the
whole chain. When a subplan lands:

1. Add a `> **Done** — shipped in <tag> on <date>.` line directly under its H1.
2. `git mv docs/plans/<n>-<name>.md docs/plans/done/`, keeping the name.
3. Update **Done so far** above, and tick the subplan's row hint in the table if
   you want the master to read at a glance.
4. Fix the relative links: a subplan in `done/` points back at the master as
   `../100-cash-manager-pos.md`, and the master's table points into
   `done/<n>-<name>.md`. Run a quick grep for the moved name so nothing dangles.
5. Commit that move on its own: `git commit -m "docs(plans): move <n> to done"`.

## When the chain is done

Move this file into `docs/plans/done/` too, keeping its name. `015-cash-manager.md`
is the original single-file draft, kept for comparison — move it as well, and do
not treat it as a source of truth where it and this chain disagree. By this point
every subplan should already be in `done/` by the rule above.
