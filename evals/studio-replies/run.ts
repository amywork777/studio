#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import { ProviderInstanceId, type StudioProject } from "@t3tools/contracts";
import { studioProjectContext } from "@t3tools/shared/studioProjects";
import {
  CLAUDE_PROVIDER,
  makeClaudeQueryOptions,
} from "../../apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import { type CommandFixture, gradeReply, studioReplyCases, type TurnStep } from "./cases.ts";

const { values } = NodeUtil.parseArgs({
  options: {
    model: { type: "string", default: "claude-haiku-5-5" },
    case: { type: "string", multiple: true },
    samples: { type: "string", default: "3" },
    out: { type: "string" },
  },
});
if (!values.out) throw new Error("Use --out <directory>.");
const model = values.model;
const samples = Number(values.samples);
const cases = studioReplyCases.filter(
  (testCase) => !values.case?.length || values.case.includes(testCase.id),
);
if (cases.length === 0) throw new Error(`No case matches ${values.case?.join(", ")}.`);

const projectIn = (folder: string): StudioProject => ({
  name: "Pan-tilt camera mount",
  template: "part",
  brief: {
    purpose: "Holds a small camera on two hobby servos for a rover.",
    requirements: "Safety factor of at least 2 on every part.",
    units: "mm",
    material: "6061-T6 aluminium",
    process: "CNC machining",
    quantity: "10",
    links: "",
    notes: "",
  },
  folders: [folder],
  createdAt: "2026-11-01T00:00:00.000Z",
});

// What a Studio project's Claude thread is told, from this checkout's text.
const appendFor = (folder: string) => {
  const { systemPrompt } = makeClaudeQueryOptions({
    modelSelection: { instanceId: ProviderInstanceId.make(CLAUDE_PROVIDER), model },
    nativeThreadId: "studio-replies-eval",
    resume: false,
    cwd: folder,
    projectContext: studioProjectContext(projectIn(folder), folder),
  });
  return typeof systemPrompt === "object" && "append" in systemPrompt
    ? (systemPrompt.append ?? "")
    : "";
};

const repo = NodePath.resolve(import.meta.dirname, "../..");
const scratch = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "studio-replies-"));
process.on("exit", () => NodeFS.rmSync(scratch, { recursive: true, force: true }));

// Studio's copy of text-to-cad's skills, laid out as the app's plugin is (scripts/studio_cad_plugin.py).
const plugin = NodePath.join(scratch, "plugin");
if (cases.some((testCase) => testCase.skills)) {
  NodeChildProcess.execFileSync("python3", [
    "-I",
    "-c",
    [
      "import sys",
      "from pathlib import Path",
      "sys.path.insert(0, sys.argv[1])",
      "from studio_cad_plugin import lay_out",
      "from studio_job_skills import add_job_skills",
      "lay_out(Path(sys.argv[2]), Path(sys.argv[3]), '0.0.0', 'python3')",
      "add_job_skills(Path(sys.argv[3]))",
    ].join("\n"),
    NodePath.join(repo, "scripts"),
    NodePath.join(repo, "text-to-cad"),
    plugin,
  ]);
}

// A command answered from its fixtures, each call logged (`name args`) for `mustRun`.
const stub = (name: string, fixtures: ReadonlyArray<CommandFixture>, log: string) =>
  [
    "#!/usr/bin/env node",
    `const fixtures = ${JSON.stringify(fixtures)};`,
    // A script on stdin (`python3 - <<EOF`) is part of what was run.
    "const args = process.argv.slice(2).join(' ') + (process.argv[2] === '-' ? ' ' + require('node:fs').readFileSync(0, 'utf8') : '');",
    `require('node:fs').appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(name)} + ' ' + args.replace(/\\n/g, ' ') + '\\n');`,
    // How many calls each fixture has answered, for one with `times`.
    `const counts = ${JSON.stringify(log)} + '.' + ${JSON.stringify(name)} + '.json';`,
    "let answered = {};",
    "try { answered = JSON.parse(require('node:fs').readFileSync(counts, 'utf8')); } catch {}",
    "const at = fixtures.findIndex((fixture, index) => new RegExp(fixture.args).test(args) && (fixture.times === undefined || (answered[index] ?? 0) < fixture.times));",
    "const hit = fixtures[at];",
    "if (hit) { answered[at] = (answered[at] ?? 0) + 1; require('node:fs').writeFileSync(counts, JSON.stringify(answered)); }",
    "const out = process.argv[process.argv.indexOf('--out') + 1];",
    "if (hit?.writes && process.argv.includes('--out')) {",
    "  require('node:fs').mkdirSync(out, { recursive: true });",
    "  for (const [file, text] of Object.entries(hit.writes)) require('node:fs').writeFileSync(require('node:path').join(out, file), text);",
    "}",
    "if (hit) { process.stdout.write(hit.stdout); process.stderr.write(hit.stderr ?? ''); process.exitCode = hit.code ?? 0; }",
    `else { process.stderr.write(${JSON.stringify(name)} + ': not answered in this eval: ' + args + '\\n'); process.exit(2); }`,
    "",
  ].join("\n");

// The turn as it went: the reply, and each text the agent wrote and each command it ran, in order.
type Turn = { readonly reply: string; readonly steps: ReadonlyArray<TurnStep> };

// Claude Code itself runs each turn in the case's project folder. It can only look, unless the case
// gives it commands: then it can also write files and run those commands, and nothing else.
const reply = (testCase: (typeof cases)[number], folder: string, bin: string) =>
  new Promise<Turn>((resolve, reject) => {
    const commands = Object.keys(testCase.commands ?? {});
    NodeChildProcess.execFile(
      "claude",
      [
        "-p",
        "--model",
        model,
        "--append-system-prompt",
        appendFor(folder),
        "--tools",
        [
          "Read",
          "Glob",
          "Grep",
          ...(commands.length > 0 ? ["Write", "Edit", "Bash"] : []),
          ...(testCase.skills ? ["Skill"] : []),
        ].join(","),
        ...(commands.length > 0
          ? ["--allowedTools", "Write", "Edit", ...commands.map((name) => `Bash(${name}:*)`)]
          : []),
        "--setting-sources",
        "project,local",
        "--strict-mcp-config",
        ...(testCase.skills ? ["--plugin-dir", plugin] : ["--disable-slash-commands"]),
        "--no-session-persistence",
        "--output-format",
        "stream-json",
        "--verbose",
        "--",
        testCase.prompt,
      ],
      {
        cwd: folder,
        env: {
          ...process.env,
          PATH: `${bin}${NodePath.delimiter}${process.env.PATH ?? ""}`,
          // Sourced before each Bash command, after the person's shell profile, which can put a real `cad` first.
          CLAUDE_ENV_FILE: NodePath.join(bin, "env.sh"),
        },
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error) return reject(error);
        type Line = {
          type?: string;
          result?: string;
          total_cost_usd?: number;
          message?: {
            content?: ReadonlyArray<{ type?: string; text?: string; input?: { command?: string } }>;
          };
        };
        const lines = stdout
          .split("\n")
          .filter((line) => line.trim().startsWith("{"))
          .map((line) => JSON.parse(line) as Line);
        const result = lines.findLast((line) => line.type === "result");
        cost += result?.total_cost_usd ?? 0;
        const steps = lines
          .filter((line) => line.type === "assistant")
          .flatMap((line) => line.message?.content ?? [])
          .flatMap((block): Array<TurnStep> =>
            block.type === "text" && block.text
              ? [{ text: block.text }]
              : block.type === "tool_use" && block.input?.command
                ? [{ command: block.input.command }]
                : [],
          );
        resolve({ reply: result?.result ?? "", steps });
      },
    );
  });

// The text files the agent wrote or changed in the project folder, by path: the case's own files left as they were are not.
const writtenIn = (folder: string, given: Readonly<Record<string, string>>) =>
  Object.fromEntries(
    (NodeFS.readdirSync(folder, { recursive: true, encoding: "utf8" }) as Array<string>)
      .map((file) => file.split(NodePath.sep).join("/"))
      .filter(
        (file) =>
          /\.(?:py|json|md|txt)$/i.test(file) &&
          NodeFS.statSync(NodePath.join(folder, file)).isFile(),
      )
      .map((file) => [file, NodeFS.readFileSync(NodePath.join(folder, file), "utf8")] as const)
      .filter(([file, text]) => given[file] !== text),
  );

let cost = 0;
const rows = await Promise.all(
  cases.flatMap((testCase) =>
    Array.from({ length: samples }, async (_, sample) => {
      const folder = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "studio-replies-"));
      for (const [file, content] of Object.entries(testCase.files ?? {})) {
        NodeFS.mkdirSync(NodePath.dirname(NodePath.join(folder, file)), { recursive: true });
        NodeFS.writeFileSync(NodePath.join(folder, file), content);
      }
      const bin = NodeFS.mkdtempSync(NodePath.join(scratch, "bin-"));
      const log = NodePath.join(bin, "ran.log");
      NodeFS.writeFileSync(log, "");
      NodeFS.writeFileSync(
        NodePath.join(bin, "env.sh"),
        `export PATH=${JSON.stringify(bin)}:"$PATH"\n`,
      );
      for (const [name, fixtures] of Object.entries(testCase.commands ?? {})) {
        NodeFS.writeFileSync(NodePath.join(bin, name), stub(name, fixtures, log), { mode: 0o755 });
      }
      let written: Record<string, string> = {};
      const turn = await reply(testCase, folder, bin).finally(() => {
        written = writtenIn(folder, testCase.files ?? {});
        NodeFS.rmSync(folder, { recursive: true, force: true });
      });
      const ran = NodeFS.readFileSync(log, "utf8").split("\n").filter(Boolean);
      return {
        id: testCase.id,
        kind: testCase.kind,
        sample,
        ...gradeReply(testCase, turn.reply, ran, written, turn.steps),
        ran,
        written,
        text: turn.reply,
        steps: turn.steps,
      };
    }),
  ),
);

NodeFS.mkdirSync(values.out, { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(values.out, "results.jsonl"),
  rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
);
const summary = [
  `# studio-replies on ${model}`,
  "",
  "| Case | Kind | Passes |",
  "| ---- | ---- | ------ |",
  ...cases.map((testCase) => {
    const own = rows.filter((row) => row.id === testCase.id);
    return `| ${testCase.id} | ${testCase.kind} | ${own.filter((row) => row.pass).length}/${own.length} |`;
  }),
  "",
  `Cost: $${cost.toFixed(2)}`,
].join("\n");
NodeFS.writeFileSync(NodePath.join(values.out, "summary.md"), summary + "\n");
process.stdout.write(summary + "\n");
