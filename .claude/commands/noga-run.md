---
description: Classify the next companies into NOGA 2025 with Haiku agents (docs/noga.md > First run)
argument-hint: <batches> <size> [dev]
---
Classify companies into NOGA 2025 codes from this Claude Code session. $ARGUMENTS = `<batches> <size> [dev]` (default `10 50`); `dev` works on the local database instead of production.

1. `mkdir -p` a fresh `DIR` under `.noga-run/`, then `npm run --silent noga -- prompt > DIR/prompt.txt`.
2. Export `batches × size` companies (at most 5,000): production `./deploy/noga-remote.sh export <batches> <size> DIR`; dev `npm run --silent noga -- export --batches <batches> --size <size> --dir DIR`. Note `remaining`.
3. Spawn one `noga-classifier` agent per `DIR/batch-NNNN.jsonl` (at most 5 at a time), each told the prompt path `DIR/prompt.txt` and its batch path. Respawn a batch whose `.out.jsonl` is missing or has a different line count than its input.
4. Import: production `./deploy/noga-remote.sh import DIR`; dev `npm run --silent noga -- import --model claude-code:haiku DIR/batch-*.out.jsonl`.
5. Report `applied`, `unknown`, `skipped`, `rejected` and `remaining`.

Never read batch or result files in this session: only counts. Sectors set by hand are never overwritten.
