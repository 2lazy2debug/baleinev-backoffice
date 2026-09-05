# 016 — Stock improvement (master)

Two additions to the stock app shipped in
[012-stock-management](done/012-stock-management.md). They are independent of each
other and are written as two subplans so neither has to carry the other's context:

| Subplan | What it does | Depends on |
|---|---|---|
| [016a — Stock transfer](016a-stock-transfer.md) | Move pieces from the stock you are in to another one, logged as an exit on one side and an entry on the other | nothing |
| [016b — Search on a phone](016b-stock-mobile-search.md) | The filter that only exists in the desktop table head becomes one search field both breakpoints read | nothing |

**Either order. Either alone.** They touch `client.tsx` and `page.tsx` in
different places and do not conflict.

**This file is the shared context.** Read it once, then read *one* subplan and
work from those two only. Do not read the other subplan — it is what this split
exists to avoid.

---

## What the stock app already is

Read `docs/business-processes.md` §10 for the flows and
`app/prisma/schema.prisma` (the Stock section) for the models. The three facts
that matter for both subplans:

- **`StockItem` is one element, in one place, at one expiry date.** Two rows for
  the same item in the same place exist precisely when their dates differ. Adding
  stock with a date that is already on the shelf tops that row up.
- **Nothing changes a quantity without saying so.** Every write goes through
  `applyMovement()` in `app/app/(app)/stock/actions.ts`, which updates the row and
  writes its `StockMovement` in one transaction. `delta` is a magnitude and `isIn`
  is the direction, so a movement still reads after the row it changed is gone.
- **Stock is edition-independent and open to everyone signed in.** No action in
  the stock app resolves an edition; a closed edition makes none of it read-only.
  Only units, places and deleting a catalogue entry are admin-only.

The screens:

```
app/app/(app)/stock/
  page.tsx                  server: place picker, or the contents of the selected place
  client.tsx                the table + cardlets, the +/- steppers, the row actions
  actions.ts                every write
  add-stock-modal.tsx       the "new entry" dialog
  stock-place-switcher.tsx  the picker screen and the switch-stock modal
  items/ history/ settings/ the catalogue, the log, the admin config
```

**Neither subplan changes the schema.** Both ship as `non-breaking`.

---

## Ground rules — both subplans

- **Read `CLAUDE.md` first and obey it literally.** The design-system section is
  not advice: no hardcoded colour, radius, pixel font size or hand-sized control,
  and `npm run check:design` must pass.
- **Reuse before you write.** Every surface, control and heading already exists in
  `app/components/ui/`. A screen should almost never write a border, background or
  height recipe of its own.
- **One commit per step**, `git add . && git commit -am "<what you did>"`, as
  `CLAUDE.md` asks. No branches.
- **Server actions throw English sentences** — that is the existing convention in
  `stock/actions.ts`. Only *UI copy* goes through
  `app/lib/i18n-dictionaries.ts`, and it goes into **both** `en` and `fr`.
- `docs/` is updated in the same plan that changes the flow, never later.

---

## Delegating to subagents

Both subplans are small enough to hold in one head, but the *checking* is not, and
checking is where context is dead weight. Hand a subagent anything that is
verifiable from its own instructions alone, and keep the reply small — ask for a
verdict and a `file:line` list, never a file dump.

**Delegate:**

- Running `npm run lint`, `npm run check:design` and `npm run build`, reporting
  each failure verbatim with its file and line.
- Grep sweeps: "list every `file:line` still referencing X".
- Dictionary parity: "compare the `stock` block of `en` and the `stock` block of
  `fr` in `app/lib/i18n-dictionaries.ts`; list keys present in one and missing
  from the other".
- Reading a long file and reporting the exact call sites a rename must touch.

**Never delegate:** the design decisions, the modal and header shapes, anything
that has to honour `CLAUDE.md`, and the release step. A subagent starts cold and
will not have read the design system.

Run independent checks in parallel in one message. A subagent's report is not
shown to the user, so relay what matters yourself.

A shape that works:

```
Agent(subagent_type: "general-purpose", run_in_background: false):
  "In /home/mcabras/Developer/baleinev-backoffice/app run, in order:
   npm run lint, npm run check:design, npm run build.
   Report for each: pass/fail, and on failure the exact error lines with
   file:line. Do not fix anything. Do not read files unless an error names one."
```

---

## Release protocol — both subplans

Each subplan ships itself. If both land in one session, one release at the end
covering both is fine.

Never hardcode a version. Read the latest tag and go one **minor** step up — these
are features:

```bash
cd /home/mcabras/Developer/baleinev-backoffice
git tag --sort=-v:refname | head -1        # e.g. v0.28.4  ->  NEXT = v0.29.0
```

1. Set `app/package.json` `"version"` to `NEXT` without the leading `v`.
2. `git commit -am "chore(release): bump version to <NEXT without v>"`
3. `git tag -a <NEXT> -m "non-breaking"` — **`non-breaking`, not
   `requires-migration`**: neither subplan adds a migration, and a message that
   claims one makes the box run `prisma migrate deploy` for nothing.
4. `git push origin main --follow-tags`

**Do not monitor the deployment.** The updater timer picks the tag up within about
two minutes, snapshots first, health-checks and rolls back on its own. Do not poll
`journalctl`, do not ssh to the box, do not loop on `/api/health`. Push the tag and
report what you shipped.

The tag vocabulary and what the pipeline guarantees are in `docs/production.md`.

---

## When both are done

Move this file and both subplans to `docs/plans/done/`, keeping the names.
