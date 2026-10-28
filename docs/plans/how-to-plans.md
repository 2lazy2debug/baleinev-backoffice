## Implementation plans

Plans live in `plans/NNN-name/` (product plans, numbered on from the last one: `019` → `020`)


```
plans/NNN-name/
  README.md        live core: header, step table, principles, decisions, current state, verification kit, deferred
  NN-step.md       one file per open step: spec, tests, verify, code map, then its Design
  done/NN-step.md  finished steps, moved verbatim (approved design, evidence, timings, verify results)
```

**Running a step**
Every step runs as two sessions, each started by a project command (`.claude/commands/`). Between
sessions the user does only this:

| Session | User types | Ends with |
|---|---|---|
| Design | `/clear`, `/model <design model>`, `/design plan NNN step N` | the step's `## Design` written; stop |
| Execute | `/clear`, `/model <execute model>`, `/execute plan NNN step N` | diff summary, then commit, tag and close on the user's go |

- The models come from the README's Models table (default: Opus designs, Sonnet executes).
- The commands carry the session rules (reading scope, orchestration, stop points). The plan files
  carry everything else. A session gets no other input.
- Never hand the user a prompt to paste. Whatever a prompt would have said belongs in `README.md` or
  the step file. A session that writes or changes a plan, and every design or execute session, ends
  its reply with the exact next lines to type, e.g. `/clear` · `/model sonnet` ·
  `/execute plan 017 step 10`.

**Reading**
- A session reads `README.md` and its own step file. Nothing else in the folder.
- `done/` is opened only when a step file cites a specific section of it.
- Search the code for what the step's code map lacks; don't expect the plan to restate code.

**What goes where**
- `README.md`: only what every remaining step needs. Decisions with their reason, invariants and
  gotchas the code doesn't show, gates and expected values (timings, counts, diffs), how to verify,
  deferred work a later step of this plan picks up. Target ≤ ~200 lines. Plus the Models table: per open step, the design and execute
  model and what each session needs beyond the default (live probe, `scout`, `verifier`).
- Step file: what that step changes. Contracts and SQL only for code that doesn't exist yet.
  It is the whole brief for `/design`: goal, scope and out of scope, user decisions already made,
  live probes or evidence to gather, environment and data it needs (env vars, which DB, credentials
  to ask for), gates and expected numbers, manual-pass list. A question only the user can answer is
  listed as an open question; the design session asks it first and records the answer in the Design.
- `docs/`: how the system works today. The plan links to it, never copies it.
- `done/`: everything about a finished step. Append-only.
- Pilot items: anything out of the plan's scope, `npm run pilot -- item create … --plan NNN-name`. `README.md` > Deferred holds only what a later step of this plan picks up.
- Pilot verify rows: each manual-pass action and each unverified fact a step leaves, `npm run pilot -- verify create` with the code to review in `--ref` (`CLAUDE.md` > Pilot). Never a marker in code.
- Nowhere: signatures, types or file-move tables of shipped code, line numbers of shipped code,
  narration ("already done in Step 7"). Git and the code hold these.

**Authoring** (the one session without a command)
- Writes `README.md` and every step file from the user's direction, then runs a read-only mapping pass: lookups grouped by code area, dispatched to `scout` in parallel; each step's code map holds confirmed `path > symbol` only. Reports the code maps, evidence and open questions, applies the user's review, commits the plan and stops. No code changes.
- A plan born from a pilot roadmap point (the dashboard's "Préparer /plan-directions" brief) is linked back after the commit: `npm run pilot -- roadmap update <id> --plan NNN-name`, then one `npm run pilot -- step create --roadmap <id> --title … [--item <id>]` per step, in order.

**Design session** (`/design plan NNN step N`)
- Writes the step's `## Design` at the end of its step file, including any deviation from the spec
  and the evidence behind it. Where Design and spec differ, Design wins.
- The Design is the whole brief for `/execute`: written for a Sonnet execute session, so it leaves
  no decision open. It pins:
  - the exact schema and migration;
  - new function signatures and the order of their calls;
  - transaction boundaries;
  - guards and error rules, as before → after cases;
  - each test case with its expected result;
  - the expected oracle numbers;
  - the manual-pass list.

  If any of these needs judgement during execution, the Design isn't done.

**Commits**
- One step = one commit: code, tests, messages and docs together, made after the checks pass and
  the user's go. A Design doesn't split a step into several commits.
- The commit subject names the step: `feat(scope): what (plan NNN Step N)`.
- Tag and push only on the user's go (see `docs/production.md`).

**Execute session** (`/execute plan NNN step N`)
- Implements the Design. If it doesn't hold against the code, stops and reports; the fix goes into
  the Design in a new design session, not into a prompt.
- Ends with a report the user can act on cold: context of the step, diff, checks, then the manual pass
  as numbered actions (page, cardlet, action, expected result), then deviations (`.claude/commands/execute.md`).

**Closing a step** (execute session, after the user's go and the tag)
1. Append the verify results and any "beyond the design" notes to the step file, then
   `git mv NN-step.md done/`.
2. `README.md`: the step becomes one row in the step table (tag + `done/` link); remove its rows from
   the Models table; add any new invariant, gate or accepted exception to Current state; add to
   Deferred what a later step of this plan picks up; reword a superseded Decision in place.
3. Update the code maps of later step files that the step invalidated.
4. Update `docs/`; mark the plan's pilot step done (`npm run pilot -- step update <id> --status done`) if the plan is linked to a roadmap point (this also closes the step's item, and the point once every step is done); create the pilot items and verify rows the step leaves (`CLAUDE.md` > Pilot).
5. If `README.md` exceeds its budget, move what serves no open step to `done/`.

**Closing a plan**
Once every step within a plan is done and closed:
1. Turn every still-open item of the README's Deferred into a pilot item (`npm run pilot -- item create --kind <bug|improvement> --priority P2 --plan NNN-name --problem …`); drop shipped ones. Replace the README's Deferred with the line "Moved to the pilot: `item list --plan NNN-name`."
2. Move the plan folder to `plans/closed`.

A plan's Deferred lists only items raised during that plan; never chain it to an earlier plan's.

**Style**: tables and terse bullets, imperative, no history in the live files.
