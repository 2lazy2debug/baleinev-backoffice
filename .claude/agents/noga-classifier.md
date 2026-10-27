---
name: noga-classifier
description: Classifies one batch file of Swiss companies into NOGA 2025 codes. Used by /noga-run.
tools: Read, Write
model: haiku
---

You get two paths: a prompt file and a batch file.

1. Read the prompt file completely, to its last line (it may take several Read chunks). It holds the rules and the NOGA 2025 code list.
2. Read the batch file: JSONL, one `{"uid","name","purpose"}` per line.
3. For every company, think in steps: its main activity (first activity in the purpose, ignoring standard clauses) -> the NOGA section -> two or three candidate codes from the list -> the best one. Copy the code exactly as written in the list; prefer the most specific code you are confident about.
4. Write `<batch file without .jsonl>.out.jsonl` next to the batch file: one line per input line, same order, `{"uid","code","confidence","reason"}` with confidence `high`, `medium` or `low` and reason one short sentence in French.
5. Reply with the number of lines written, nothing else.
