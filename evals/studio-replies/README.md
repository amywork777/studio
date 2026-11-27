# Studio replies

Checks how a Studio agent ends its reply to an engineer. Law 5 (AGENTS.md) says build first, then ask: the agent does the next step or asks a specific question, never a yes-or-no offer such as "Would you like me to run that change as a study?". The grader fails a reply that holds one; "What would you like me to do?" over named answers, or "Which one should I start with?", is a choice and passes. It also fails a reply that holds a link to the CAD viewer (`VIEWER_URL`), which carries the viewer's access token.

Each sample runs a real Claude Code turn (`claude -p`) in a fresh project folder holding the case's files, with the system text a Studio project's Claude thread gets from this checkout (`makeClaudeQueryOptions` with `studioProjectContext`). The agent can only read (`Read`, `Glob`, `Grep`), so it cannot build; the cases are about the question it ends on.

A case with `skills` also gets Studio's copy of text-to-cad's skills, laid out as the app's plugin is (`scripts/studio_cad_plugin.py`, `--plugin-dir`). A case with `commands` can also write files and run those commands, and nothing else: each is a stand-in answered from the case's fixtures (`cad`'s words for reading a part, planning it and `cad viewer --json`), so no CAD engine or FreeCAD starts, and the grader reads what it ran (`mustRun`, `mustNotRun`). The stand-ins go on `PATH` again before each command (`CLAUDE_ENV_FILE`), after the shell profile, which can put a real `cad` first.

## Run

From `evals/`, with the `claude` CLI signed in:

```sh
node studio-replies/run.ts --case study-fix-offer --samples 1 --out runs/check
node studio-replies/run.ts --samples 8 --out runs/haiku
node studio-replies/run.ts --model claude-sonnet-5-5 --samples 4 --out runs/sonnet
```

- Flags: `--model` (default `claude-haiku-5-5`), `--case <id>` (repeatable), `--samples <n>` (default 3), `--out <dir>`.
- A run writes `results.jsonl` (every reply, graded) and `summary.md`.
- Cost: 24 Haiku samples of the reply cases cost about $0.06, 12 Sonnet samples about $0.42; the CAM cases, which run tools, about $0.02 a Haiku sample and $0.30 a Sonnet one (2026-11-27), as the CLI reports. Samples run at once: run one case at a time on a busy machine.

## Add a case

Cases are in `cases.ts`: `kind` (`bad` reproduces a reply, `control` is ordinary work), `source`, the `prompt`, the project's `files`, `mustMatch` for what the reply must say, and `skills`, `commands`, `mustRun` and `mustNotRun` for a case that works, and `sameValue` for a quantity the reply must give one number. The grader, `YES_NO_OFFER`, is tested in `cases.test.ts`.

## Results

Passes per case, before → after the "Never word a question as a yes-or-no offer" line in Studio's Questions and recommendations (`packages/shared/src/studioProjects.ts`), 2026-11-27.

| Case            | Kind    | Haiku 5.5     | Sonnet 5.5 |
| --------------- | ------- | ------------- | ---------- |
| study-fix-offer | bad     | 10/16 → 15/16 | 8/8 → 4/4  |
| next-job-offer  | bad     | 12/16 → 16/16 | 8/8 → 4/4  |
| material-fact   | control | 16/16 → 16/16 | 8/8 → 4/4  |

Sonnet did not make the offer in these single-turn cases on either text; Haiku did, in the incident's words ("Do you want me to set the wall to 3 mm and re-run the static study?").

Passes per case, before → after Studio's copy of the cam skill plans with stated defaults before it asks, and Studio's skills and project instructions give the person no viewer link (`scripts/studio_cad_plugin.py`, `packages/shared/src/studioProjects.ts`), 2026-11-27. The reply cases' before is their run above; Sonnet ran on the new text only.

| Case                | Kind    | Haiku 5.5   | Sonnet 5.5 |
| ------------------- | ------- | ----------- | ---------- |
| cam-asks-first      | bad     | 0/6 → 6/6   | 2/2        |
| cam-viewer-link     | bad     | 1/6 → 6/6   | 2/2        |
| cam-freecad-consent | control | 2/4 → 3/4   |            |
| study-fix-offer     | bad     | 15/16 → 4/4 |            |
| next-job-offer      | bad     | 16/16 → 4/4 |            |
| material-fact       | control | 16/16 → 4/4 |            |

Before, Haiku read the plate and asked for the spindle speed, travel, every tool's flute length and stickout and how the plate is held, and planned nothing; on a plan it ran, it gave the `url` `cad viewer --json` printed, `?token=` and all. The consent control's misses, on both texts, are one reply that never said the download's size and two that asked "Should I install it for Studio now?".

Passes per case, before → after Studio's copy of the cam skill says in one line what it planned with before any question and marks each planned answer (Recommended), the controller's too, and Studio's project instructions say one quantity has one value in a reply (`scripts/studio_cad_plugin.py`, `packages/shared/src/studioProjects.ts`), 2026-11-27. Before, `cam-controller-recommended` ran with the stand-ins on `PATH` after the shell profile; the other cases' before is their run above. Sonnet ran on the new text only.

| Case                       | Kind    | Haiku 5.5 | Sonnet 5.5 |
| -------------------------- | ------- | --------- | ---------- |
| cam-controller-recommended | bad     | 0/5 → 6/6 | 2/2        |
| bolt-thread-one-value      | control | 7/7 → 3/3 |            |
| cam-asks-first             | bad     | 6/6 → 3/3 |            |
| cam-viewer-link            | bad     | 6/6 → 3/3 |            |
| cam-freecad-consent        | control | 3/4 → 3/3 |            |
| study-fix-offer            | bad     | 4/4 → 3/3 |            |
| next-job-offer             | bad     | 4/4 → 3/3 |            |
| material-fact              | control | 4/4 → 3/3 |            |

Before, Haiku planned with GRBL and listed the controllers with none marked ("I'm not marking any as recommended"), its spindle speed, tools and holding scattered after the question or left out. The thread-length mix-up did not come back in one turn: with the script's sizes, Haiku gave 5.4 mm throughout on both texts, so the case guards it rather than reproducing it.
