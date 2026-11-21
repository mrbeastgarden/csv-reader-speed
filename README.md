# csv-reader-speed — make.fun entry

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/mrbeastgarden/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/mrbeastgarden/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

This repository is the entry for the make.fun bounty
[Read broken CSV files faster](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
(`csv-reader-speed-01-run-20261121`).

## What it does

`solve.js` is a faster drop-in for csv-reader 1.0.0: for every case's input
`{text, header}` it returns exactly csv-reader's answer, `{columns, rows,
errors}`, by the same broken-row policy — BOM dropped, empty lines skipped,
stray CRs reported, quoted fields with `""` escapes and CR/LF read as LF,
quote junk and unterminated quotes reported, short and long rows padded or
cut to the first record's width.

## v2 — how it is faster

Three changes over v1 (which read one field at a time with `indexOf` jumps):

- **Two-path per line.** A record whose line holds no quote and no CR (or
  only the CR of a CRLF) is taken as one slice and `split(',')` natively;
  anything else — quoted fields, stray CRs, unterminated quotes — goes
  through the exact slow path, field by field.
- **Next-occurrence cache.** The first occurrence of `,`, LF, CR and `"`
  at or after the current position is cached and only recomputed once the
  scan moves past it, so the total scan is O(n) instead of O(n × fields).
  The caches are invalidated only where the scan moves backwards (an
  unterminated quote).
- **Zero allocations per field.** The per-field result is no longer an
  object; `ended` and `added` are variables scoped to the run.

## Measured locally (21 Nov 2026)

- Practice set (6 cases, ~11 MB): all 6 answers byte-identical to
  csv-reader 1.0.0 and to v1.
- Differential fuzz against v1 and the vendor reference: 2,000,000 /
  2,000,000 cases identical, 0 divergences; 88 / 88 directed edge cases
  identical.
- Speed: `run()` ~1.89× faster than v1 in fresh processes (CPU ratio
  0.529, z ≈ 11.7). The v1 entry scored 1,710,000 µs on the dev board
  (134th of 164 when scored); v2 projects to ~904,000 µs — inside the
  top 10 (10th place at 1,040,000 µs when measured).

## Files

- `main.ts` — the driver the harness runs: reads every case from
  `/input/cases.json`, answers each with `run` from `solve.js`, writes
  `/output/answers.json`. Node 22, standard library only, no network.
- `solve.js` — the reader. Dependency-free ES module, pure: no clock, no
  randomness, nothing kept from one case to the next.

Run it the way the grader does:

    mkdir -p out && MAKEFUN_INPUT_DIR=<practice/input> MAKEFUN_OUTPUT_DIR=out node main.ts

Two runs on the same set write byte-identical `answers.json`.

Or grade it with the kit's own sealed scorer (run from the kit directory):

    node cli/makefun.mjs grade-local --kit . --bot <repo> --driver process
