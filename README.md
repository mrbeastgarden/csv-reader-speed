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

The speed comes from never reading one character at a time: unquoted fields
jump with `indexOf` to the next comma, LF or CR and are taken as one slice;
quoted fields jump to the next quote the same way, and a quoted segment is
converted (CR/CRLF to LF) only when it actually holds one. On the practice
set (6 cases, ~11 MB) it answers all 6 cases identically to csv-reader in
about half the CPU time (~1.9× faster than the house baseline).

## Files

- `main.ts` — the driver the harness runs: reads every case from
  `/input/cases.json`, answers each with `run` from `solve.js`, writes
  `/output/answers.json`. Node 22, standard library only, no network.
- `solve.js` — the reader. Dependency-free ES module, pure: no clock, no
  randomness, nothing kept from one case to the next.

Run it the way the grader does:

    mkdir -p out && MAKEFUN_INPUT_DIR=<practice/input> MAKEFUN_OUTPUT_DIR=out node main.ts

Two runs on the same set write byte-identical `answers.json`.
