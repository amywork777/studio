# Studio replies

Checks how a Studio agent ends its reply to an engineer. Law 5 (AGENTS.md) says build first, then ask: the agent does the next step or asks a specific question, never a yes-or-no offer such as "Would you like me to run that change as a study?". The grader fails a reply that holds one; "What would you like me to do?" over named answers, or "Which one should I start with?", is a choice and passes.

Each sample runs a real Claude Code turn (`claude -p`) in a fresh project folder holding the case's files, with the system text a Studio project's Claude thread gets from this checkout (`makeClaudeQueryOptions` with `studioProjectContext`). The agent can only read (`Read`, `Glob`, `Grep`), so it cannot build; the cases are about the question it ends on.

## Run

From `evals/`, with the `claude` CLI signed in:

```sh
node studio-replies/run.ts --case study-fix-offer --samples 1 --out runs/check
node studio-replies/run.ts --samples 8 --out runs/haiku
node studio-replies/run.ts --model claude-sonnet-5-5 --samples 4 --out runs/sonnet
```

- Flags: `--model` (default `claude-haiku-5-5`), `--case <id>` (repeatable), `--samples <n>` (default 3), `--out <dir>`.
- A run writes `results.jsonl` (every reply, graded) and `summary.md`.
- Cost: 24 Haiku samples cost about $0.06, 12 Sonnet samples about $0.42 (2026-11-27), as the CLI reports.

## Add a case

Cases are in `cases.ts`: `kind` (`bad` reproduces a reply, `control` is ordinary work), `source`, the `prompt`, the project's `files`, and `mustMatch` for what the reply must say. The grader, `YES_NO_OFFER`, is tested in `cases.test.ts`.

## Results

Passes per case, before → after the "Never word a question as a yes-or-no offer" line in Studio's Questions and recommendations (`packages/shared/src/studioProjects.ts`), 2026-11-27.

| Case            | Kind    | Haiku 5.5     | Sonnet 5.5 |
| --------------- | ------- | ------------- | ---------- |
| study-fix-offer | bad     | 10/16 → 15/16 | 8/8 → 4/4  |
| next-job-offer  | bad     | 12/16 → 16/16 | 8/8 → 4/4  |
| material-fact   | control | 16/16 → 16/16 | 8/8 → 4/4  |

Sonnet did not make the offer in these single-turn cases on either text; Haiku did, in the incident's words ("Do you want me to set the wall to 3 mm and re-run the static study?").
