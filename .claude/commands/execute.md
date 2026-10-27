---
description: Execute session for a designed plan step
argument-hint: plan NNN step N
---
Execute session for $ARGUMENTS. Follow docs/plans/how-to-plans.md.

Read only the plan's README.md and this step's file. Where Design and spec differ, Design wins.

- Implement the Design directly. If something needs judgement the Design doesn't cover, stop and report.
- Lookups outside the step's code map: spawn `scout`.
- Tests, lint, typecheck, scripts: spawn `verifier`. Keep its output out of your context except failures.
- Use compact command output (CLAUDE.md > Short output).

When checks pass, report in this order, then wait for my go:
1. **Context** (2-3 lines): which plan and step this is, what it is for, what the user can now do or see that they couldn't.
2. **Diff**: `git diff --stat` summarised in a few lines.
3. **Checks**: one line each, failures and flaky reruns named.
4. **Your manual pass**: the step's manual-pass list turned into numbered actions, each naming the page (URL or menu path), the cardlet or element, the action to take (what to click or type, with the exact values), and the result to expect (what appears, which numbers). Say what you could not run yourself. If the step has no UI, say so and give the one command or query to check instead. Record each numbered action as a pilot verify row: `npm run pilot -- verify create --description "<page> · <element> · <action>" --action "<expected result>" --ref "<path> > <symbol>"` (one `--ref` per piece of code to review), and give each action its row id. A step without UI records its one check the same way.
5. **Deviations** from the Design and any open question.
After the go: commit, tag per docs/production.md, close the step per how-to-plans.
