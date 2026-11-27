# CAD implicits

Whether Studio's agent reaches for GSL (an implicit model, text-to-cad's omega integration) where the cad skill says, and only there, and whether what it builds is right: one valid solid, a STEP that reads back, the exact holes and flat faces kept, and printable.

The cad skill's "Start with the task" names five cases: a fillet build123d refuses (offer a smooth blend, make it on a yes), a printed part made lighter, a stress result on a printed part that must stay light, a casting with many blends, and an organic grip. Everything else stays build123d. The cases cover each, plus ambiguous prompts, a trap ("smooth blend" said of a fillet that builds) and controls.

## Run

```sh
cd evals
pnpm cad-implicits --out runs/implicits --model claude-opus-5-5 --model claude-sonnet-5-5 --samples 5
```

- Each run is Claude Code (`claude -p`, your local login) with Studio's project context (`studioProjectContext`), the text-to-cad plugin from `../text-to-cad`, and the project and local settings alone, as Studio starts it. The agent may run commands: `cad` is this checkout's (`text-to-cad/.venv`), with its own state, cache and server port under `--out`.
- After each run, `build_check.py` (run with text-to-cad's Python) builds the part the case judges in a process of its own and measures it. One check runs at a time: a lattice part takes minutes and several GB.
- `--case <id>` limits the run (repeat it). `--jobs 2` agents run at once. `--budget 150` stops starting runs past that many dollars; `--run-budget 4` caps one run's dollars, `--run-minutes 15` its time, and `--grade-minutes 10` each build its check makes. A run cut off before Claude Code says its cost is priced from its tokens.
- A run writes `results.jsonl` (resumed: finished runs are not run again), `summary.md`, and each run's project and transcript under `projects/`. `--summary-only` rewrites the summary. A file named `PAUSE` in `--out` starts no new runs (the ones under way finish), for when another heavy job needs the machine; remove it and run again to go on. `--regrade <case>` checks the builds of that case's runs again, after `build_check.py` changes.

A run passes when its decision is the one expected (GSL built, offered, or kept exact) and its part passes every build check. Each case's summary cell is passes out of samples.

## Cost

Measured on the implicits prototype (Sonnet 5.5 on all 17 cases, Opus 5.5 on the 8 where GSL is the answer): Sonnet
about $0.40 a run, Opus about $1.10; controls take a minute or two, a lattice part the whole 15 minutes. 51 Sonnet and
16 Opus runs cost $38 and, with `--jobs 2`, about 7 hours. A lattice build peaks at 2-6 GB: keep `--jobs` at 2.

## Add a case

Add an entry to `cases.ts` with an `id`, its `source`, the `prompt`, the `seeds` it starts from (files in `fixtures/`), the decision `expected`, and `checks` for the built part. A seed must be sound geometry: an agent that finds a fault in it fixes the fault instead of doing what the case tests.
