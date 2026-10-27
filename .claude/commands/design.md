---
description: Design session for a plan step
argument-hint: plan NNN step N
---
Design session for $ARGUMENTS. Follow docs/plans/how-to-plans.md.

Read only the plan's README.md and this step's file.

You orchestrate; you don't read code, diffs or logs yourself.
- Lookups, call-site inventories, "where is X used": spawn `scout` agents split by code area, in parallel.
  Ask for paths, line ranges, and findings in ≤15 lines.
- Anything that runs (tests, typecheck, scripts, queries for oracle numbers): spawn `verifier`.
- Read code yourself only when a decision depends on exact code a scout can't summarize: the relevant
  range, never whole files.

Deliver the step's `## Design` complete per how-to-plans: nothing left to judgement.
Then stop. Don't implement.
