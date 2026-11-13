#!/usr/bin/env node
/**
 * Studio's SolidCraft server: SolidCraft's engine behind one MCP server per thread, so the agent and
 * the editor tab share the live design. Engine tools pass through; `editor_*` tools are the tab's
 * own, and a hand edit saves, exports STEP and is reported on the agent's next SolidCraft call.
 * Usage: server.mjs --cli <solidcraft-cli> [--connect HOST:PORT] [--allow-path DIR]...
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";
import * as NodeURL from "node:url";

const here = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const EDITOR_URI = "ui://solidcraft/editor";
/** The page is one inlined file; data and blob URLs are all it loads (Studio's CSP for views). */
const RESOURCE_META = {
  ui: {
    prefersBorder: false,
    csp: { connectDomains: ["data:", "blob:"], resourceDomains: ["data:", "blob:"] },
  },
};
const EDITOR_FILE = NodePath.join(here, "..", "editor", "editor.html");
const MCP_APP_MIME = "text/html;profile=mcp-app";

function option(name) {
  const values = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && process.argv[i + 1] !== undefined)
      values.push(process.argv[i + 1]);
  }
  return values;
}

const cli = option("--cli")[0];
if (!cli) {
  process.stderr.write("studio solidcraft server: --cli <solidcraft-cli> is required\n");
  process.exit(2);
}
const connect = option("--connect")[0];
const scratch = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "studio-solidcraft-"));
const engineArgs = [
  "mcp",
  ...(connect ? ["--connect", connect] : []),
  "--allow-path",
  scratch,
  ...option("--allow-path").flatMap((folder) => ["--allow-path", folder]),
];
const engine = NodeChildProcess.spawn(cli, engineArgs, { stdio: ["pipe", "pipe", "inherit"] });
engine.on("exit", (code) => process.exit(code ?? 1));
process.on("exit", () => NodeFS.rmSync(scratch, { recursive: true, force: true }));

const send = (stream, message) => stream.write(`${JSON.stringify(message)}\n`);
const toHost = (message) => send(process.stdout, message);
const toEngine = (message) => send(engine.stdin, message);

// Calls of our own to the engine, on ids the host never uses.

let nextId = 0;
const pending = new Map();
function engineRequest(method, params) {
  const id = `studio-${(nextId += 1)}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    toEngine({ jsonrpc: "2.0", id, method, params });
  });
}

/** A SolidCraft tool's reply as JSON (its text content), or an Error with its message. */
async function tool(name, args = {}) {
  const result = await engineRequest("tools/call", { name, arguments: args });
  const text = (result.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  if (result.isError) throw new Error(text || `${name} failed`);
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}
const command = (id, params = {}) => tool("execute", { command: id, params });

// Hand edits, saved as they are made and noted for the agent.

/** What the engineer changed since the agent's last SolidCraft call, in words. */
let handEdits = [];

async function designPath() {
  const design = await tool("inspect_design", { measure: false, sketches: false });
  return typeof design.path === "string" && design.path.length > 0 ? design.path : null;
}

/** Saves a design that has a file, and writes its STEP beside it for Studio's viewer and checks. */
async function keep() {
  const file = await designPath();
  if (file === null) return { saved: false };
  await tool("save", {});
  const step = file.replace(/\.solidcraft$/i, ".step");
  try {
    await tool("export", { path: step });
  } catch (error) {
    return { saved: true, step: null, stepError: String(error.message ?? error) };
  }
  return { saved: true, step };
}

async function parameters() {
  const list = await command("parameters.list", {});
  return Array.isArray(list.parameters) ? list.parameters : [];
}

const describeParameter = (parameter) => {
  if (parameter.source === "feature" && parameter.feature) {
    return `the ${parameter.input ?? "input"} of ${parameter.feature} (${parameter.name})`;
  }
  if (parameter.source === "sketch") return `the sketch dimension ${parameter.name}`;
  return parameter.name;
};

async function readMesh() {
  const file = NodePath.join(scratch, "model.stl");
  NodeFS.rmSync(file, { force: true });
  try {
    await tool("export", { path: file });
    return NodeFS.readFileSync(file).toString("base64");
  } catch {
    return null;
  }
}

/** Opens the design unless it is the one open already: opening a view calls its tool again. */
async function openOnce(file) {
  if (typeof file !== "string" || file.length === 0) return;
  const current = await designPath();
  if (current === null || NodePath.resolve(current) !== NodePath.resolve(file))
    await tool("open", { path: file });
}

/** The file a view was opened on: a file tab's `file.resourceUri`, or the host's resource path. */
function fileArgument(args, meta) {
  const fromMeta = meta?.["openai/resource"]?.path;
  if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta;
  const uri = args?.file?.resourceUri;
  if (typeof uri === "string" && uri.startsWith("file://")) return NodeURL.fileURLToPath(uri);
  return typeof args?.path === "string" && args.path.length > 0 ? args.path : null;
}

/** The design as the editor shows it; `unchanged` when the editor already has this revision. */
async function editorState(args) {
  await openOnce(args.open);
  const design = await tool("inspect_design", { measure: false, sketches: true });
  if (args.revision !== undefined && args.revision === design.revision && !args.force) {
    return { unchanged: true, revision: design.revision };
  }
  const bodies = Array.isArray(design.bodies) ? design.bodies : [];
  return {
    unchanged: false,
    revision: design.revision,
    name: design.name,
    path: design.path ?? null,
    dirty: design.dirty === true,
    units: design.units ?? "mm",
    marker: design.marker,
    canUndo: Array.isArray(design.undo) ? design.undo.length > 0 : Boolean(design.undo),
    canRedo: Array.isArray(design.redo) ? design.redo.length > 0 : Boolean(design.redo),
    timeline: design.timeline ?? [],
    sketches: design.sketches ?? [],
    parameters: await parameters(),
    mesh: bodies.some((body) => body.visible !== false) ? await readMesh() : null,
  };
}

async function editorChange(args) {
  const before = (await parameters()).find((parameter) => parameter.name === args.name);
  const result = await command("parameters.change", {
    name: args.name,
    expression: args.expression,
  });
  const errors = Array.isArray(result.errors) ? result.errors : [];
  if (before) {
    handEdits.push(
      `set ${describeParameter(before)} from \`${before.expression}\` to \`${args.expression}\``,
    );
  }
  return { ok: errors.length === 0, errors, ...(await keep()) };
}

async function editorTimeline(args) {
  const feature = args.feature;
  if (args.action === "rename") {
    await command("timeline.rename", { feature, name: args.name });
    handEdits.push(`renamed the feature ${feature} to ${args.name}`);
  } else if (args.action === "suppress") {
    await command("timeline.suppress", { feature, suppressed: args.suppressed });
    handEdits.push(`${args.suppressed ? "suppressed" : "unsuppressed"} the feature ${feature}`);
  } else if (args.action === "roll_to") {
    await command("timeline.roll_to", feature ? { feature } : {});
    handEdits.push(
      feature ? `rolled the timeline back to after ${feature}` : "rolled the timeline to the end",
    );
  } else {
    throw new Error(`unknown timeline action ${args.action}`);
  }
  return { ok: true, ...(await keep()) };
}

async function editorHistory(direction) {
  await command(direction === "undo" ? "edit.undo" : "edit.redo", {});
  handEdits.push(direction === "undo" ? "undid the last change" : "redid a change");
  return { ok: true, ...(await keep()) };
}

// Our tools, beside SolidCraft's.

const appOnly = { ui: { visibility: ["app"] } };
const TOOLS = [
  {
    name: "editor_open",
    title: "Part editor",
    description:
      "Shows the design in Studio's editor tab beside the thread, where the engineer sees the model and changes its dimensions, parameters and timeline by hand. Call it once a design is open or made, with `path` to open a .solidcraft file first.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "A .solidcraft design to open first" } },
    },
    // A thread view too: the panel's + menu opens the editor on whatever design is open.
    _meta: { ui: { resourceUri: EDITOR_URI }, "openai/ui": { entrypoints: [{ type: "thread" }] } },
  },
  {
    name: "editor_file",
    title: "Part editor",
    description: "Studio's editor, opened on a .solidcraft file from the project.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "object",
          properties: { name: { type: "string" }, resourceUri: { type: "string" } },
        },
      },
    },
    _meta: {
      ui: { resourceUri: EDITOR_URI, visibility: ["app"] },
      "openai/ui": { entrypoints: [{ type: "file", extensions: ["solidcraft"] }] },
    },
  },
  {
    name: "editor_state",
    description: "Studio's editor: the open design's timeline, sketches, parameters and mesh.",
    inputSchema: {
      type: "object",
      properties: {
        revision: { description: "The revision the editor has; unchanged designs answer briefly" },
        open: { type: "string", description: "A .solidcraft design to open first" },
        force: { type: "boolean" },
      },
    },
    _meta: appOnly,
  },
  {
    name: "editor_change",
    description: "Studio's editor: the engineer changes a parameter or dimension by hand.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, expression: { type: "string" } },
      required: ["name", "expression"],
    },
    _meta: appOnly,
  },
  {
    name: "editor_timeline",
    description: "Studio's editor: the engineer renames, suppresses or rolls back to a feature.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["rename", "suppress", "roll_to"] },
        feature: { type: "string" },
        name: { type: "string" },
        suppressed: { type: "boolean" },
      },
      required: ["action"],
    },
    _meta: appOnly,
  },
  {
    name: "editor_undo",
    description: "Studio's editor: undo.",
    inputSchema: { type: "object", properties: {} },
    _meta: appOnly,
  },
  {
    name: "editor_redo",
    description: "Studio's editor: redo.",
    inputSchema: { type: "object", properties: {} },
    _meta: appOnly,
  },
];
const OURS = new Set(TOOLS.map((entry) => entry.name));

const INSTRUCTIONS = [
  "In Studio, the engineer sees this design in Studio's editor tab and changes it by hand there.",
  "Call `editor_open` once a design is open or made, so they can see it.",
  "When they changed it since your last call, your next call's result begins by saying what they changed: keep their changes.",
].join(" ");

async function callOurs(name, args, meta) {
  switch (name) {
    case "editor_open":
    case "editor_file": {
      await openOnce(fileArgument(args, meta));
      const design = await tool("inspect_design", { measure: false, sketches: false });
      return {
        content: [
          { type: "text", text: `Showing ${design.name ?? "the design"} in Studio's editor.` },
        ],
        structuredContent: { path: design.path ?? null, name: design.name ?? null },
      };
    }
    case "editor_state":
      return { content: [], structuredContent: await editorState(args) };
    case "editor_change":
      return { content: [], structuredContent: await editorChange(args) };
    case "editor_timeline":
      return { content: [], structuredContent: await editorTimeline(args) };
    case "editor_undo":
      return { content: [], structuredContent: await editorHistory("undo") };
    case "editor_redo":
      return { content: [], structuredContent: await editorHistory("redo") };
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

function editorResource() {
  let text;
  try {
    text = NodeFS.readFileSync(EDITOR_FILE, "utf8");
  } catch {
    text =
      "<!doctype html><p style='font-family:sans-serif'>The editor is not built. Restart Studio.</p>";
  }
  return { uri: EDITOR_URI, mimeType: MCP_APP_MIME, text, _meta: RESOURCE_META };
}

// The relay: the host's requests go to the engine unless they are ours; the engine's replies come
// back, with ours added where the host lists tools and resources.

/** Host request ids whose replies we change on the way back: initialize, tools/list. */
const amend = new Map();

async function answer(id, work) {
  try {
    toHost({ jsonrpc: "2.0", id, result: await work() });
  } catch (error) {
    toHost({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: String(error.message ?? error) }], isError: true },
    });
  }
}

NodeReadline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (line.trim() === "") return;
  const message = JSON.parse(line);
  const isRequest = message.method !== undefined && message.id !== undefined;
  if (!isRequest) {
    toEngine(message);
    return;
  }
  const { id, method, params } = message;
  if (method === "tools/call" && OURS.has(params?.name)) {
    void answer(id, () => callOurs(params.name, params.arguments ?? {}, params._meta));
    return;
  }
  if (method === "resources/list") {
    toHost({
      jsonrpc: "2.0",
      id,
      result: {
        resources: [
          { uri: EDITOR_URI, name: "Part editor", mimeType: MCP_APP_MIME, _meta: RESOURCE_META },
        ],
      },
    });
    return;
  }
  if (method === "resources/templates/list") {
    toHost({ jsonrpc: "2.0", id, result: { resourceTemplates: [] } });
    return;
  }
  if (method === "resources/read") {
    if (params?.uri === EDITOR_URI)
      toHost({ jsonrpc: "2.0", id, result: { contents: [editorResource()] } });
    else
      toHost({
        jsonrpc: "2.0",
        id,
        error: { code: -32002, message: `no resource ${params?.uri}` },
      });
    return;
  }
  if (method === "tools/call" && handEdits.length > 0) {
    // The agent's first SolidCraft call after hand edits learns what they were.
    const note = `Since your last call the engineer changed the design by hand in Studio's editor: ${handEdits.join("; ")}. Keep these changes.`;
    handEdits = [];
    amend.set(id, { kind: "note", note });
  } else if (method === "initialize" || method === "tools/list") {
    amend.set(id, { kind: method });
  }
  toEngine(message);
});

NodeReadline.createInterface({ input: engine.stdout }).on("line", (line) => {
  if (line.trim() === "") return;
  const message = JSON.parse(line);
  const own = message.id !== undefined && message.method === undefined && pending.get(message.id);
  if (own) {
    pending.delete(message.id);
    if (message.error) own.reject(new Error(message.error.message));
    else own.resolve(message.result);
    return;
  }
  const change =
    message.method === undefined && message.id !== undefined ? amend.get(message.id) : undefined;
  if (change && message.result) {
    amend.delete(message.id);
    if (change.kind === "initialize") {
      message.result.capabilities = { ...message.result.capabilities, resources: {} };
      message.result.instructions = [message.result.instructions, INSTRUCTIONS]
        .filter(Boolean)
        .join("\n\n");
    } else if (change.kind === "tools/list") {
      message.result.tools = [...(message.result.tools ?? []), ...TOOLS];
    } else if (change.kind === "note") {
      message.result.content = [
        { type: "text", text: change.note },
        ...(message.result.content ?? []),
      ];
    }
  }
  toHost(message);
});
