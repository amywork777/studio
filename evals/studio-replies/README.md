# Studio replies

Checks how a Studio agent ends its reply to an engineer. Law 5 (AGENTS.md) says build first, then ask: the agent does the next step or asks a specific question, never a yes-or-no offer such as "Would you like me to run that change as a study?". The grader fails a reply that holds one; "What would you like me to do?" over named answers, or "Which one should I start with?", is a choice and passes. It also fails a reply that holds a link to the CAD viewer (`VIEWER_URL`), which carries the viewer's access token.

Each sample runs a real Claude Code turn (`claude -p`) in a fresh project folder holding the case's files, with the system text a Studio project's Claude thread gets from this checkout (`makeClaudeQueryOptions` with `studioProjectContext`). The agent can only read (`Read`, `Glob`, `Grep`), so it cannot build; the cases are about the question it ends on.

A case with a `project.json` file gets it as the project's record, as a new project's thread does. A case with `skills` also gets Studio's copy of text-to-cad's skills, laid out as the app's plugin is (`scripts/studio_cad_plugin.py`, `--plugin-dir`). A case with `commands` can also write files and run those commands, and nothing else: each is a stand-in answered from the case's fixtures (`cad`'s words for reading a part, planning it and `cad viewer --json`), so no CAD engine or FreeCAD starts, and the grader reads what it ran (`mustRun`, `mustNotRun`). A fixture can fail (`stderr`, `code`) or answer only its first `times` calls, so a command can take several calls to finish, as `studio-install-freecad` does. The turn is read as it streams, so the grader also sees what the agent wrote before a command ran (`beforeRun`). The stand-ins go on `PATH` again before each command (`CLAUDE_ENV_FILE`), after the shell profile, which can put a real `cad` first.

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

Cases are in `cases.ts`: `kind` (`bad` reproduces a reply, `control` is ordinary work), `source`, the `prompt`, the project's `files`, `mustMatch` for what the reply must say, and `skills`, `commands`, `mustRun` and `mustNotRun` for a case that works, and `sameValue` for a quantity the reply must give one number, `mustNotMatch` for what it must not say, `writes` for the files it writes (a CAM job, an assembly script), `mustNotSay` for what no text of the turn may say (the reply and what it writes between commands, which the chat shows too), and `beforeRun` for what it must not write before a command runs (the controller before the plan). The grader, `YES_NO_OFFER`, is tested in `cases.test.ts`.

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

Passes per case, before → after Studio's copy of the cam skill asks the FreeCAD download alone before the first plan, says no plan has run and claims none, asks the controller with the questions after the plan, and keeps travel and feed limits out of a job unless the person gave them (its example's machine too), and Studio's project instructions say how an assembly in `assemblies/` imports its parts from `parts/` (`scripts/studio_cad_plugin.py`, `packages/shared/src/studioProjects.ts`), 2026-11-27. A case with `writes` grades the files the agent wrote (the CAM job, the assembly script) as well as its reply. The other cases ran on the new text only; their before is their run above.

| Case                       | Kind    | Haiku 5.5 |
| -------------------------- | ------- | --------- |
| cam-controller-before-plan | bad     | 0/4 → 4/4 |
| cam-invented-limits        | bad     | 2/6 → 3/4 |
| assembly-imports-parts     | bad     | 0/4 → 3/3 |
| cam-controller-recommended | bad     | 6/6 → 2/3 |
| cam-asks-first             | bad     | 3/3 → 3/3 |
| cam-viewer-link            | bad     | 3/3 → 3/3 |
| cam-freecad-consent        | control | 3/3 → 3/3 |
| bolt-thread-one-value      | control | 3/3 → 3/3 |
| study-fix-offer            | bad     | 3/3 → 2/3 |
| next-job-offer             | bad     | 3/3 → 3/3 |
| material-fact              | control | 3/3 → 3/3 |

Before, with no FreeCAD for Studio, Haiku wrote "What I planned with" or "Planned with: GRBL, …" over a plan that never ran and asked which controller beside the download question, and one job held the skill example's `travel_mm` [300, 300, 80] and `max_feed_mm_min` 2500; with FreeCAD there, most replies never said travel was not checked. Every assembly imported its part as `from parts.flat_plate import …` or by its bare name, which neither a run nor the part tree finds from `assemblies/`. The misses after: one plan that stalled on the stand-in's answers and never said travel, one controller question lost in a reply about the stand-in's files, and one "Should I…?" on the strength study, as before this change.

Passes per case, before → after `studio-install-freecad` installs in a process of its own and returns within 90 s saying how far it is, Studio's copy of the cam skill says to call `studio-install-freecad --wait` until FreeCAD is installed and say nothing about the plan or the controller until a plan has run (`scripts/studio_freecad.py`, `scripts/studio_cad_plugin.py`), and Studio's project instructions say a part builds with `cad run` and its STEP is exported from that build (`packages/shared/src/studioProjects.ts`), 2026-11-27, Haiku 5.5.

| Case                         | Kind    | Before                  | After |
| ---------------------------- | ------- | ----------------------- | ----- |
| cam-freecad-installs-in-turn | bad     | 1/3 blocking, 2/3 calls | 4/4   |
| part-step-from-its-script    | bad     | 0/3                     | 2/3   |
| cam-controller-before-plan   | bad     |                         | 2/2   |
| cam-freecad-consent          | control |                         | 2/2   |
| cam-asks-first               | bad     |                         | 1/2   |
| assembly-imports-parts       | bad     |                         | 1/2   |
| material-fact                | control |                         | 2/2   |

`cam-freecad-installs-in-turn`'s before ran twice on the old text: once with a stand-in that blocks for 130 s as the old install did (Claude Code moved it to the background at 120 s, and one turn wrote "Controller: GRBL for now" while it installed, the 0.1.19 reply), once with the new install's answers (one turn named GRBL and the controller while waiting, before any plan). Before, every `part-step-from-its-script` turn ran the part with the computer's `python3`, got `No module named 'cad'`, and stopped with the part unbuilt or exported a plain build123d copy with `export_step`; after, every turn built `parts/flat_plate.py` with `cad run`, and the first run's one miss of an export went once the instructions said to export after each build (the after column is that run). The misses after are "Should I…?", "Shall I…?" and "Would you like me to…?" offers, as before this change.

Passes per case, before → after `studio-install-freecad` returns within 60 s and Studio's copy of the cam skill says to give each call a timeout of at least 120000 ms, and, once a plan has run, to write the `Planned with: …; travel and feed limits not checked` line before any question, then ask one set of questions on the controller, the tools, the spindle's top speed and how the part is held, each with its planned answer marked (Recommended) (`scripts/studio_freecad.py`, `scripts/studio_cad_plugin.py`); and Studio's project instructions say never to use git's words in a reply and never to say what Studio's screen shows (`packages/shared/src/studioProjects.ts`), 2026-11-27, Haiku 5.5. The other cases ran on the new text only.

| Case                         | Kind    | Before | After |
| ---------------------------- | ------- | ------ | ----- |
| cam-planned-with-questions   | bad     | 0/3    | 4/4   |
| new-project-git-words        | bad     | 3/3    | 2/2   |
| part-viewer-claim            | bad     | 3/3    | 2/2   |
| cam-controller-recommended   | bad     |        | 1/2   |
| cam-freecad-installs-in-turn | bad     |        | 2/2   |
| cam-controller-before-plan   | bad     |        | 2/2   |
| cam-freecad-consent          | control |        | 2/2   |
| material-fact                | control |        | 2/2   |

Before, Haiku asked only the controller, or no question at all, after the plan; one reply had no `Planned with:` line and none asked about the tools. After, every reply wrote the line, then the four questions with the planned answers marked. The 0.1.19 replies asked through Studio's question tool, which `claude -p` cannot answer, so these cases grade the questions as text. Neither the git words ("The setup file is committed in its own folder") nor the claim about the screen ("The viewer didn't open automatically") came back in these turns on the old text, so those two cases guard the new lines rather than reproduce them. `cam-controller-recommended`'s miss is a turn whose every `cad` call waited on approval, so it never planned.
