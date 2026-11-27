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
import { gradeReply, studioReplyCases } from "./cases.ts";

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

// Claude Code itself runs each turn in the case's project folder, able only to look: the reply is graded.
const reply = (prompt: string, folder: string) =>
  new Promise<string>((resolve, reject) => {
    NodeChildProcess.execFile(
      "claude",
      [
        "-p",
        "--model",
        model,
        "--append-system-prompt",
        appendFor(folder),
        "--tools",
        "Read,Glob,Grep",
        "--setting-sources",
        "project,local",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-session-persistence",
        "--output-format",
        "json",
        prompt,
      ],
      { cwd: folder, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return reject(error);
        const result = JSON.parse(stdout) as { result?: string; total_cost_usd?: number };
        cost += result.total_cost_usd ?? 0;
        resolve(result.result ?? "");
      },
    );
  });

let cost = 0;
const rows = await Promise.all(
  cases.flatMap((testCase) =>
    Array.from({ length: samples }, async (_, sample) => {
      const folder = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "studio-replies-"));
      for (const [file, content] of Object.entries(testCase.files ?? {})) {
        NodeFS.mkdirSync(NodePath.dirname(NodePath.join(folder, file)), { recursive: true });
        NodeFS.writeFileSync(NodePath.join(folder, file), content);
      }
      const text = await reply(testCase.prompt, folder).finally(() =>
        NodeFS.rmSync(folder, { recursive: true, force: true }),
      );
      return { id: testCase.id, kind: testCase.kind, sample, ...gradeReply(testCase, text), text };
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
