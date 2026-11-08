/**
 * The Nodes prototype's graph: a project's parts as nodes, wired by what their scripts import, so
 * one part can be changed on its own and the parts that use it follow. Plain functions, no React.
 *
 * The idea is ComfyUI's (a node per step, edits that rerun only what follows), brought to code CAD,
 * where a part is its script and an assembly is a script that imports its parts.
 */

import type { ProjectFile } from "../projectFiles";

/** A part of the project as the graph needs it: a cadgen model, or a shared script parts import. */
export interface GraphPart {
  /** What opens it: a model's document id, or a shared script's path. */
  readonly id: string;
  readonly name: string;
  /** Its script, relative to the folder, with forward slashes. */
  readonly script: string;
  readonly kind: "Part" | "Assembly" | "Shared";
  /** When the engine last built it (seconds, as a string); null before it says, and for shared scripts. */
  readonly updated: string | null;
}

export interface GraphNode extends GraphPart {
  /** Its column: 0 for what uses nothing of the project's, then one past the deepest thing it uses. */
  readonly column: number;
  /** Its place in its column. */
  readonly row: number;
}

export interface GraphEdge {
  /** The node used. */
  readonly from: string;
  /** The node that uses it. */
  readonly to: string;
}

export interface NodeGraph {
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
}

/**
 * The graph's parts from the parts the project's Overview lists (`overviewParts`), so both show
 * the same parts. A cadgen model brings its script; a STEP made by a script is matched to the
 * script of its name (`motor_plate.step` to `parts/motor_plate.py`), the one beside it first. A
 * STEP no script makes (an imported motor, say) is a node with no wires.
 */
export function graphParts(
  files: ReadonlyArray<ProjectFile>,
  paths: ReadonlyArray<string>,
): ReadonlyArray<GraphPart> {
  const scripts = paths.filter((path) => path.toLowerCase().endsWith(".py"));
  const folderOf = (path: string) => path.split("/").slice(0, -1).join("/");
  const scriptFor = (file: ProjectFile) => {
    if (file.script !== undefined) return file.script;
    const named = scripts.filter((script) => stem(script) === fileStem(file.path));
    return named.find((script) => folderOf(script) === folderOf(file.path)) ?? named[0] ?? null;
  };
  return files.map((file): GraphPart => {
    const script = scriptFor(file);
    const assembly = file.kind === "Assembly" || /(?:^|\/)assembl/i.test(script ?? file.path);
    return {
      id: file.path,
      name: file.title,
      script: script ?? file.path,
      kind: assembly ? "Assembly" : "Part",
      updated: file.version ?? null,
    };
  });
}

const fileStem = (path: string) =>
  (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "").toLowerCase();

const FROM_IMPORT = /^\s*from\s+([A-Za-z_][\w.]*)\s+import\s/gm;
const PLAIN_IMPORT =
  /^\s*import\s+([A-Za-z_][\w.]*(?:\s+as\s+\w+)?(?:\s*,\s*[A-Za-z_][\w.]*(?:\s+as\s+\w+)?)*)/gm;

/** The top-level module names a Python script imports, in order, each once. */
export function scriptImports(source: string): ReadonlyArray<string> {
  const names: string[] = [];
  const add = (name: string) => {
    const top = name.split(".")[0] ?? "";
    if (top !== "" && !names.includes(top)) names.push(top);
  };
  for (const match of source.matchAll(FROM_IMPORT)) add(match[1] ?? "");
  for (const match of source.matchAll(PLAIN_IMPORT)) {
    for (const part of (match[1] ?? "").split(",")) add(part.trim().split(/\s+/)[0] ?? "");
  }
  return names;
}

const stem = (script: string) =>
  (script.split("/").pop() ?? script).replace(/\.py$/i, "").toLowerCase();

/** A shared script's name as a person reads it: `sizes.py` is "Sizes", `motor_specs.py` "Motor specs". */
export function sharedName(script: string): string {
  const words = stem(script).replace(/[_-]+/g, " ").trim();
  return words === "" ? script : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The project's graph from its models and its scripts' text (`sources`, by script path). A script
 * the models import that is not a model itself (shared sizes, say) is a node too. Checks, exports
 * and drawings, which import parts but are not used by any, are left out.
 */
export function buildNodeGraph(
  models: ReadonlyArray<GraphPart>,
  sources: ReadonlyMap<string, string>,
): NodeGraph {
  const scriptsByStem = new Map<string, string>();
  for (const script of sources.keys()) {
    if (script.toLowerCase().endsWith(".py")) scriptsByStem.set(stem(script), script);
  }
  for (const model of models) scriptsByStem.set(stem(model.script), model.script);

  // What each script uses of the project's own scripts.
  const usesOf = (script: string): ReadonlyArray<string> =>
    scriptImports(sources.get(script) ?? "")
      .map((name) => scriptsByStem.get(name.toLowerCase()))
      .filter((used): used is string => used !== undefined && used !== script);

  const parts = new Map<string, GraphPart>();
  const byScript = new Map<string, GraphPart[]>();
  const addPart = (part: GraphPart) => {
    parts.set(part.id, part);
    byScript.set(part.script, [...(byScript.get(part.script) ?? []), part]);
  };
  for (const model of models) addPart(model);

  // Shared scripts: anything a part uses, directly or through another shared script.
  const queue = models.map((model) => model.script);
  const seen = new Set(queue);
  while (queue.length > 0) {
    const script = queue.shift() as string;
    for (const used of usesOf(script)) {
      if (seen.has(used)) continue;
      seen.add(used);
      queue.push(used);
      if (!byScript.has(used)) {
        addPart({ id: used, name: sharedName(used), script: used, kind: "Shared", updated: null });
      }
    }
  }

  const edges: GraphEdge[] = [];
  for (const part of parts.values()) {
    for (const used of usesOf(part.script)) {
      for (const from of byScript.get(used) ?? []) {
        if (!edges.some((edge) => edge.from === from.id && edge.to === part.id)) {
          edges.push({ from: from.id, to: part.id });
        }
      }
    }
  }

  // Columns by the longest chain of uses, so every wire runs left to right. A loop of imports
  // (which Python itself refuses) stops at the parts already on the chain.
  const columns = new Map<string, number>();
  const columnOf = (id: string, chain: ReadonlySet<string>): number => {
    const known = columns.get(id);
    if (known !== undefined) return known;
    const inputs = edges.filter((edge) => edge.to === id && !chain.has(edge.from));
    const next = new Set(chain).add(id);
    const column =
      inputs.length === 0 ? 0 : 1 + Math.max(...inputs.map((edge) => columnOf(edge.from, next)));
    columns.set(id, column);
    return column;
  };

  const order = (a: GraphPart, b: GraphPart) =>
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name);
  const rows = new Map<number, number>();
  const nodes = [...parts.values()]
    .map((part) => ({ part, column: columnOf(part.id, new Set()) }))
    .toSorted((a, b) => a.column - b.column || order(a.part, b.part))
    .map(({ part, column }) => {
      const row = rows.get(column) ?? 0;
      rows.set(column, row + 1);
      return { ...part, column, row };
    });
  return { nodes, edges };
}

const KIND_ORDER: Record<GraphPart["kind"], number> = { Shared: 0, Part: 1, Assembly: 2 };

/** Every node that uses `id`, directly or through others: what rebuilds after it changes. */
export function downstream(graph: NodeGraph, id: string): ReadonlyArray<string> {
  const found: string[] = [];
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const edge of graph.edges) {
      if (edge.from === current && edge.to !== id && !found.includes(edge.to)) {
        found.push(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return found;
}

/** The nodes `id` uses directly. */
export function upstream(graph: NodeGraph, id: string): ReadonlyArray<string> {
  return graph.edges.filter((edge) => edge.to === id).map((edge) => edge.from);
}

/**
 * The message that changes one node: the ask, the part named by its link, what it must meet, and
 * what it uses and what uses it, with the rule that only this part's script is edited.
 */
export function nodePrompt(input: {
  readonly link: string;
  readonly kind: GraphPart["kind"];
  readonly ask: string;
  readonly context: ReadonlyArray<string>;
  readonly uses: ReadonlyArray<string>;
  readonly usedBy: ReadonlyArray<string>;
}): string {
  const what = input.kind === "Shared" ? "these shared values" : "this part";
  const lines = [`Change only ${input.link}: ${input.ask.trim()}`];
  if (input.context.length > 0) {
    lines.push("", `What ${what} must meet:`, ...input.context.map((line) => `- ${line}`));
  }
  if (input.uses.length > 0) lines.push("", `It uses: ${input.uses.join(", ")}.`);
  if (input.usedBy.length > 0) lines.push(`Used by: ${input.usedBy.join(", ")}.`);
  lines.push(
    "",
    input.usedBy.length > 0
      ? `Edit only this script. Then rebuild it and what uses it. If one of those no longer fits, say which and why, and don't change it.`
      : `Edit only this script, then rebuild it.`,
  );
  return lines.join("\n");
}
