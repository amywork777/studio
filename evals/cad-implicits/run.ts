#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off globalConsole:off - a CLI that drives other CLIs and prints its progress.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import { studioProjectContext } from "@t3tools/shared/studioProjects";
import { implicitCases, type ImplicitCase } from "./cases.ts";
import {
  buildProblems,
  decision,
  decisionPasses,
  runFacts,
  type BuildFacts,
  type RunFacts,
} from "./grade.ts";

const { values } = NodeUtil.parseArgs({
  options: {
    out: { type: "string" },
    model: { type: "string", multiple: true },
    case: { type: "string", multiple: true },
    samples: { type: "string", default: "5" },
    jobs: { type: "string", default: "2" },
    budget: { type: "string", default: "150" },
    "run-budget": { type: "string", default: "4" },
    "run-minutes": { type: "string", default: "15" },
    "grade-minutes": { type: "string", default: "10" },
    "summary-only": { type: "boolean", default: false },
    regrade: { type: "string", multiple: true },
  },
});
if (!values.out)
  throw new Error("Use --out <directory> [--model <id>]... [--case <id>]... [--samples 5].");
for (const id of values.case ?? [])
  if (!implicitCases.some((each) => each.id === id)) throw new Error(`Unknown case id: ${id}.`);

const here = import.meta.dirname;
const textToCad = NodePath.resolve(here, "../../text-to-cad");
const python = NodePath.join(textToCad, ".venv/bin/python");
const out = NodePath.resolve(values.out);
const models = values.model?.length ? values.model : ["claude-opus-5-5"];
const cases = implicitCases.filter((each) => !values.case?.length || values.case.includes(each.id));
const samples = Number(values.samples);
const budget = Number(values.budget);
const runMinutes = Number(values["run-minutes"]);
const gradeMinutes = Number(values["grade-minutes"]);
const resultsFile = NodePath.join(out, "results.jsonl");

interface Row {
  readonly model: string;
  readonly case: string;
  readonly sample: number;
  readonly expected: string;
  readonly decision: string;
  readonly decisionPass: boolean;
  readonly problems: ReadonlyArray<string>;
  readonly pass: boolean;
  readonly costUsd: number;
  /** True where the run was cut off before Claude Code said its cost, and `costUsd` is estimated from tokens. */
  readonly costEstimated?: boolean;
  readonly tokens?: RunFacts["tokens"];
  readonly turns: number;
  readonly seconds: number;
  readonly timedOut: boolean;
  readonly stepRuns: RunFacts["stepRuns"];
  readonly gslFiles: ReadonlyArray<string>;
  readonly build: BuildFacts;
  readonly finalText: string;
}

const done = (): Row[] =>
  NodeFS.existsSync(resultsFile)
    ? NodeFS.readFileSync(resultsFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Row)
    : [];

// The CAD tools the agents run: this checkout's, with their own state, cache and server port.
const cadHome = NodePath.join(out, "cad");
for (const folder of ["bin", "state", "cache", "engine", "launcher"])
  NodeFS.mkdirSync(NodePath.join(cadHome, folder), { recursive: true });
const cadLink = NodePath.join(cadHome, "bin/cad");
if (!NodeFS.existsSync(cadLink))
  NodeFS.symlinkSync(NodePath.join(textToCad, ".venv/bin/cad"), cadLink);
const cadEnv = {
  PATH: `${NodePath.join(cadHome, "bin")}:${process.env.PATH ?? ""}`,
  CAD_STATE_DIR: NodePath.join(cadHome, "state"),
  CAD_CACHE_DIR: NodePath.join(cadHome, "cache"),
  CAD_ENGINE_DIR: NodePath.join(cadHome, "engine"),
  CAD_LAUNCHER_DIR: NodePath.join(cadHome, "launcher"),
  // A port of this output folder's own, so two runs' servers never answer for each other.
  CAD_ENGINE_PORT: String(
    47_000 + ([...out].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) >>> 0, 7) % 1_000),
  ),
  CAD_ENGINE_MESH_WORKERS: "1",
  CAD_UPDATE_CHECK: "0",
  CAD_TELEMETRY: "0",
  DO_NOT_TRACK: "1",
};

const spawn = (
  command: string,
  args: string[],
  options: NodeChildProcess.SpawnOptions,
  limitMs: number,
) =>
  new Promise<{ stdout: string; code: number | null; timedOut: boolean }>((resolve) => {
    const child = NodeChildProcess.spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let timedOut = false;
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", () => undefined);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, limitMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, code, timedOut });
    });
  });

// One build check at a time: a lattice part takes minutes and gigabytes to build and measure.
let checking: Promise<unknown> = Promise.resolve();
const checkBuild = (project: string, fixture: ImplicitCase): Promise<BuildFacts> => {
  const run = checking.then(async () => {
    const result = NodePath.join(project, "..", "build.json");
    const seed =
      fixture.checks.part && fixture.seeds.includes(fixture.checks.part)
        ? ["--seed", NodePath.join(here, "fixtures", fixture.checks.part)]
        : [];
    await spawn(
      python,
      [
        NodePath.join(here, "build_check.py"),
        "--project",
        project,
        "--out",
        result,
        ...(fixture.checks.part ? ["--part", fixture.checks.part] : []),
        ...seed,
        "--limit",
        String(gradeMinutes * 60),
      ],
      { cwd: textToCad, env: { ...process.env, ...cadEnv } },
      // Its builds each stop at the limit; the measuring after them is a few minutes more at most.
      (gradeMinutes + 5) * 60_000,
    );
    return NodeFS.existsSync(result)
      ? (JSON.parse(NodeFS.readFileSync(result, "utf8")) as BuildFacts)
      : { built: false, error: "the build check did not finish" };
  });
  checking = run.catch(() => undefined);
  return run;
};

/**
 * A run's cost: Claude Code's own figure, or for one cut off before its result line, its tokens at the dollars per
 * weighted token the model's finished runs in this folder paid (cache reads a tenth of input, writes 1.25, output 5).
 */
function priced(model: string, facts: RunFacts): Pick<Row, "costUsd" | "costEstimated" | "tokens"> {
  const weight = (tokens: RunFacts["tokens"]) =>
    tokens.input + 1.25 * tokens.cacheWrite + 0.1 * tokens.cacheRead + 5 * tokens.output;
  if (facts.costUsd > 0) return { costUsd: facts.costUsd, tokens: facts.tokens };
  const paid = done().filter(
    (row) => row.model === model && !row.costEstimated && row.tokens && row.costUsd > 0,
  );
  const rate =
    paid.reduce((sum, row) => sum + row.costUsd, 0) /
    Math.max(
      1,
      paid.reduce((sum, row) => sum + weight(row.tokens!), 0),
    );
  return { costUsd: weight(facts.tokens) * rate, costEstimated: true, tokens: facts.tokens };
}

/** A run's facts: its transcript's, with every .gsl in its project (one written from the shell is no Write call). */
function projectFacts(project: string, stream: string): RunFacts {
  const written = NodeFS.readdirSync(project, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".gsl") && !file.endsWith(".baked.gsl"))
    .map((file) => NodePath.join(project, file));
  const read = runFacts(stream);
  return { ...read, gslFiles: [...new Set([...read.gslFiles, ...written])] };
}

async function runOne(model: string, fixture: ImplicitCase, sample: number): Promise<Row> {
  const work = NodePath.join(out, "projects", model, `${fixture.id}-${sample}`);
  const project = NodePath.join(work, "project");
  NodeFS.rmSync(work, { recursive: true, force: true });
  NodeFS.mkdirSync(NodePath.join(project, "parts"), { recursive: true });
  for (const seed of fixture.seeds) {
    const target = NodePath.join(project, seed);
    NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
    NodeFS.copyFileSync(NodePath.join(here, "fixtures", seed), target);
  }
  NodeChildProcess.execFileSync("git", ["init", "-q"], { cwd: project });
  const context = studioProjectContext(
    {
      name: "Bench test",
      template: "part",
      folders: [project],
      createdAt: "2026-11-27T00:00:00Z",
      brief: {
        purpose: "",
        requirements: "",
        units: "mm",
        material: "",
        process: fixture.process ?? "",
        quantity: "",
        links: "",
        notes: "",
      },
    },
    project,
  );
  const started = Date.now();
  const { stdout, timedOut } = await spawn(
    "claude",
    [
      "-p",
      fixture.prompt,
      "--model",
      model,
      "--output-format",
      "stream-json",
      "--verbose",
      "--plugin-dir",
      textToCad,
      "--append-system-prompt",
      context,
      "--setting-sources",
      "project,local",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      "Read,Write,Edit,Glob,Grep,Skill,TodoWrite,Bash",
      "--disallowedTools",
      "WebFetch,WebSearch,Agent,Task",
      "--max-turns",
      "80",
      "--max-budget-usd",
      values["run-budget"] ?? "4",
      "--no-session-persistence",
    ],
    { cwd: project, env: { ...process.env, ...cadEnv } },
    runMinutes * 60_000,
  );
  const seconds = Math.round((Date.now() - started) / 1000);
  NodeFS.writeFileSync(NodePath.join(work, "stream.jsonl"), stdout);
  const facts = projectFacts(project, stdout);
  const made = decision(facts);
  const build = await checkBuild(project, fixture);
  const problems = buildProblems(fixture.checks, build, made);
  const decisionPass = decisionPasses(fixture.expected, made);
  return {
    model,
    case: fixture.id,
    sample,
    expected: fixture.expected,
    decision: made,
    decisionPass,
    problems,
    pass: decisionPass && problems.length === 0,
    ...priced(model, facts),
    turns: facts.turns,
    seconds,
    timedOut,
    stepRuns: facts.stepRuns,
    gslFiles: facts.gslFiles.map((file) => NodePath.relative(project, file)),
    build,
    finalText: facts.finalText,
  };
}

function summary(rows: Row[]): string {
  const spend = rows.reduce((sum, row) => sum + row.costUsd, 0);
  const lines = [
    "# GSL decisions and builds",
    "",
    `${rows.length} runs, $${spend.toFixed(2)}.`,
    "",
    `| Case | Expected | ${models.map((model) => `${model}: decision | ${model}: built right`).join(" | ")} |`,
    `| --- | --- | ${models.map(() => "--- | ---").join(" | ")} |`,
  ];
  for (const fixture of implicitCases) {
    const cells = models.map((model) => {
      const mine = rows.filter((row) => row.model === model && row.case === fixture.id);
      if (mine.length === 0) return "- | -";
      const decided = mine.filter((row) => row.decisionPass).length;
      const right = mine.filter((row) => row.pass).length;
      const made = Object.entries(
        mine.reduce<Record<string, number>>(
          (tally, row) => Object.assign(tally, { [row.decision]: (tally[row.decision] ?? 0) + 1 }),
          {},
        ),
      )
        .map(([name, count]) => `${name} ${count}`)
        .join(", ");
      return `${decided}/${mine.length} (${made}) | ${right}/${mine.length}`;
    });
    lines.push(`| ${fixture.id} | ${fixture.expected} | ${cells.join(" | ")} |`);
  }
  lines.push("", "## Each run", "");
  for (const row of rows)
    lines.push(
      `- ${row.model} ${row.case}-${row.sample}: ${row.pass ? "pass" : "FAIL"}${row.timedOut ? " (timed out)" : ""} (${row.decision}; ` +
        `${row.problems.join("; ") || "builds right"}) $${row.costUsd.toFixed(2)}, ${row.seconds}s` +
        (row.stepRuns.length
          ? `, gsl step: ${row.stepRuns.map((run) => (run.refused ? "refused" : "ok")).join("/")}`
          : ""),
    );
  return `${lines.join("\n")}\n`;
}

NodeFS.mkdirSync(out, { recursive: true });
if (values.regrade?.length) {
  // The build check again on the projects runs left, for these cases, after the check changed: no agent runs.
  const rows: Row[] = [];
  for (const row of done()) {
    const fixture = implicitCases.find((each) => each.id === row.case);
    if (!fixture || !values.regrade.includes(row.case)) {
      rows.push(row);
      continue;
    }
    const work = NodePath.join(out, "projects", row.model, `${row.case}-${row.sample}`);
    const project = NodePath.join(work, "project");
    const facts = projectFacts(
      project,
      NodeFS.readFileSync(NodePath.join(work, "stream.jsonl"), "utf8"),
    );
    const made = decision(facts);
    const decisionPass = decisionPasses(fixture.expected, made);
    const build = await checkBuild(project, fixture);
    const problems = buildProblems(fixture.checks, build, made);
    rows.push({
      ...row,
      expected: fixture.expected,
      decision: made,
      decisionPass,
      finalText: facts.finalText,
      build,
      problems,
      pass: decisionPass && problems.length === 0,
    });
    console.log(
      `regraded ${row.model} ${row.case}-${row.sample}: ${problems.join("; ") || "builds right"}`,
    );
  }
  NodeFS.writeFileSync(resultsFile, rows.map((row) => `${JSON.stringify(row)}\n`).join(""));
} else if (!values["summary-only"]) {
  const finished = new Set(done().map((row) => `${row.model}/${row.case}/${row.sample}`));
  const queue = models
    .flatMap((model) =>
      cases.flatMap((fixture) =>
        Array.from({ length: samples }, (_, index) => ({ model, fixture, sample: index + 1 })),
      ),
    )
    .filter((job) => !finished.has(`${job.model}/${job.fixture.id}/${job.sample}`));
  const workers = Array.from({ length: Number(values.jobs) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      // A PAUSE file in the output folder holds new runs while others need the machine; runs under way finish.
      if (NodeFS.existsSync(NodePath.join(out, "PAUSE"))) {
        console.log("stopping: paused (remove PAUSE and run again to go on)");
        return;
      }
      const spent = done().reduce((sum, row) => sum + row.costUsd, 0);
      if (spent >= budget) {
        console.log(`stopping: $${spent.toFixed(2)} spent of the $${budget} budget`);
        return;
      }
      const row = await runOne(job.model, job.fixture, job.sample);
      NodeFS.appendFileSync(resultsFile, `${JSON.stringify(row)}\n`);
      console.log(
        `${row.model} ${row.case}-${row.sample}: ${row.pass ? "pass" : "FAIL"}${row.timedOut ? " timed-out" : ""} ${row.decision} ` +
          `${row.problems.join("; ")} $${row.costUsd.toFixed(2)} ${row.seconds}s`,
      );
    }
  });
  await Promise.all(workers);
}
// The server the agents started for this run stops with it.
NodeChildProcess.spawnSync(cadLink, ["server", "stop"], { env: { ...process.env, ...cadEnv } });
NodeFS.writeFileSync(NodePath.join(out, "summary.md"), summary(done()));
console.log(`summary: ${NodePath.join(out, "summary.md")}`);
