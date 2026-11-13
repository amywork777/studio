// @effect-diagnostics nodeBuiltinImport:off -- fixtures are plugin folders and git repositories on disk.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as PluginService from "./PluginService.ts";
import * as PluginStore from "./PluginStore.ts";

/**
 * A stdio MCP server in plain Node: `show` renders a view (and opens .step
 * files), `sync` is for the view alone, `plain` has no view, and `wait` never answers.
 */
const SERVER = String.raw`
import readline from "node:readline";
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const tools = [
  { name: "show", description: "Show the part", inputSchema: { type: "object" },
    _meta: { ui: { resourceUri: "ui://demo/view" }, "openai/ui": { entrypoints: [{ type: "file", extensions: [".step"] }] } } },
  { name: "sync", description: "View state", inputSchema: { type: "object" }, _meta: { ui: { resourceUri: "ui://demo/view", visibility: ["app"] } } },
  { name: "plain", description: "Echo", inputSchema: { type: "object", properties: { text: { type: "string" } } } },
];
// The CAD server's app capability: each home launch delivers a new one, and cad_http refuses the first.
let homes = 0;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  const reply = (result) => send({ jsonrpc: "2.0", id: message.id, result });
  switch (message.method) {
    case "initialize":
      return reply({ protocolVersion: message.params.protocolVersion, capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "demo", version: "1.0.0" },
        instructions: JSON.stringify({ ext: message.params.capabilities.extensions ?? null, cwd: process.cwd(), root: process.env.PLUGIN_ROOT }) });
    case "tools/list": return reply({ tools });
    case "tools/call":
      if (message.params.name === "wait") return;
      if (message.params.name === "cad_home")
        return reply({ content: [], _meta: { "dev.texttocad/httpToken": "token-" + ++homes } });
      if (message.params.name === "cad_http" && message.params.arguments.headers?.["x-cad-app"] === "token-1")
        return reply({ isError: true, content: [{ type: "text", text: "This CAD view was opened before CAD restarted." }] });
      if (message.params.name === "plain" && message.params.arguments.text === "launch")
        return reply({ content: [{ type: "text", text: "{}" }], _meta: { "dev.texttocad/httpToken": "secret", other: 1 } });
      return reply({ content: [{ type: "text", text: JSON.stringify({ name: message.params.name, arguments: message.params.arguments, meta: message.params._meta ?? null }) }] });
    case "resources/read":
      return reply({ contents: [{ uri: message.params.uri, mimeType: "text/html;profile=mcp-app", text: "<p>demo view</p>",
        _meta: { ui: { csp: { connectDomains: ["https://api.example.com"] } } } }] });
    default:
      return send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "no such method" } });
  }
});
`;

function write(file: string, content: string | object) {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(
    file,
    typeof content === "string" ? content : JSON.stringify(content, null, 2),
  );
}

export function git(cwd: string, ...args: ReadonlyArray<string>) {
  return NodeChildProcess.execFileSync(
    "git",
    [
      "-c",
      "user.email=t@example.com",
      "-c",
      "user.name=t",
      "-c",
      "init.defaultBranch=main",
      ...args,
    ],
    { cwd, encoding: "utf8" },
  ).trim();
}

/** A marketplace folder with the `demo` plugin, and a bare git repository of the same. */
export function fixture() {
  const dir = NodeFS.realpathSync(
    NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-plugins-")),
  );
  const market = NodePath.join(dir, "market");
  write(NodePath.join(market, ".claude-plugin", "marketplace.json"), {
    name: "demo-market",
    plugins: [{ name: "demo", source: "./demo", description: "A demo plugin" }],
  });
  const plugin = NodePath.join(market, "demo");
  write(NodePath.join(plugin, ".codex-plugin", "plugin.json"), {
    name: "demo",
    version: "1.0.0",
    interface: { displayName: "Demo" },
  });
  write(NodePath.join(plugin, ".mcp.json"), {
    mcpServers: { main: { command: process.execPath, args: ["${PLUGIN_ROOT}/server.mjs"] } },
  });
  write(NodePath.join(plugin, "server.mjs"), SERVER);
  write(NodePath.join(plugin, "skills", "parts", "SKILL.md"), "---\nname: parts\n---\n");
  git(market, "init", "-q");
  git(market, "add", "-A");
  git(market, "commit", "-q", "-m", "first");
  const bare = NodePath.join(dir, "remote", "market.git");
  NodeFS.mkdirSync(NodePath.dirname(bare), { recursive: true });
  NodeChildProcess.execFileSync("git", ["clone", "-q", "--bare", market, bare]);
  const work = NodePath.join(dir, "work");
  write(NodePath.join(work, "parts", "bracket.step"), "ISO-10303-21;");
  return { dir, market, bare, work };
}

export const threadId = ThreadId.make("thread-plugins");

// A new thread: still a draft in its client, so the server has no record of it.
export const draftThreadId = ThreadId.make("thread-draft");

/**
 * The thread and project lookups the service makes: every thread but a draft one has its
 * worktree at `work`, and the environment's one project is rooted at `work`.
 */
const layerThreads = (work: string) =>
  Layer.mergeAll(
    Layer.succeed(
      ThreadManagementService.ThreadManagementService,
      // Only getThreadRecords is reached.
      ThreadManagementService.ThreadManagementService.of({
        getThreadRecords: (id: ThreadId) =>
          id.startsWith("thread-draft")
            ? Effect.fail("not found")
            : Effect.succeed({ thread: { worktreePath: work, projectId: "p" } }),
      } as unknown as ThreadManagementService.ThreadManagementService["Service"]),
    ),
    Layer.succeed(
      ProjectStore.ProjectStoreV2,
      ProjectStore.ProjectStoreV2.of({
        get: () => Effect.succeedNone,
        list: () => Effect.succeed([{ workspaceRoot: work }]),
      } as unknown as ProjectStore.ProjectStoreV2["Service"]),
    ),
  );

export const layerFor = (
  sources: ReadonlyArray<PluginStore.MarketplaceSource>,
  base: string,
  work: string,
) =>
  PluginService.layer.pipe(
    Layer.provideMerge(PluginStore.layerWith(sources)),
    Layer.provide(layerThreads(work)),
    Layer.provide(ServerConfig.layerTest(process.cwd(), base)),
  );
