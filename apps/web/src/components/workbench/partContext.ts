/**
 * The part, board or assembly a text-to-cad viewer shows, as the workbench's
 * context strip names it: what it is, its units, its material and its last
 * build. The viewer's own sync (`cad_sync`, relayed by the frame) says which
 * document it shows (a file's path, or a cadgen 0.8 model's document id) and its
 * revision; the viewer's routes, reached through `cad_http` as the view reaches
 * them, say the rest once per revision: the engine's document (its parts, so
 * part or assembly, and its materials), its build (`/version`), and when
 * Recents last saw it change (`updated`). Nothing is guessed: a fact the server
 * does not hold is left out, or said to be missing.
 */

import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";
import { isAbsolutePath, workspaceRelativeFilePath } from "@t3tools/shared/path";

import { folderResult, humanName } from "./partNames";
import { classifyProjectFile } from "./projectFiles";

/** What a thread's viewer shows, from its last sync. */
export interface ShownView {
  /** The plugin and server the view belongs to, which answer `cad_http`. */
  readonly pluginId: string;
  readonly server: string;
  /** A file's absolute path, or a model's document id (`isDocumentId`). */
  readonly path: string;
  /** Moves whenever the document does: the catalog's revision, else the viewer's own. */
  readonly revision: string;
}

export type PartBuild =
  | { readonly state: "building" }
  | { readonly state: "failed"; readonly error: string | null }
  /** `built`: the engine built the model then; `saved`: only the file's own time is known. */
  | { readonly state: "built" | "saved"; readonly at: number };

export interface PartContext {
  readonly path: string;
  readonly name: string;
  /** "Part", "Assembly", "Board", "FEA study"... */
  readonly kind: string;
  /** The units the viewer reads the file in, or null where the file alone does not say. */
  readonly units: string | null;
  /** Named materials the model declares: empty when it declares none, null until read. */
  readonly materials: ReadonlyArray<string> | null;
  readonly build: PartBuild | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A path's last segment, on either separator. */
export const fileName = (path: string) =>
  path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1) || path;

/**
 * Compound endings first: results are named after the model they came from
 * (`bracket.fea.glb`); 0.11's, after their folder (`studies/tip-load/result.glb`, `folderResult`). Units are the viewer's: CAD files in millimetres,
 * robot descriptions in metres (`renderOptions.js`); a DXF carries its own,
 * which only its drawing payload reads, and a schematic has none.
 */
const KINDS: ReadonlyArray<{
  readonly ending: string;
  readonly kind: string;
  readonly units: string | null;
}> = [
  { ending: ".fea.glb", kind: "FEA study", units: "mm" },
  { ending: ".cam.glb", kind: "CAM job", units: "mm" },
  { ending: ".harness.yml", kind: "Harness", units: null },
  { ending: ".kicad_pcb", kind: "Board", units: "mm" },
  { ending: ".kicad_sch", kind: "Schematic", units: null },
  { ending: ".step", kind: "Part", units: "mm" },
  { ending: ".stp", kind: "Part", units: "mm" },
  { ending: ".xbf", kind: "Part", units: "mm" },
  { ending: ".stl", kind: "Mesh", units: "mm" },
  { ending: ".3mf", kind: "Mesh", units: "mm" },
  { ending: ".glb", kind: "Mesh", units: "mm" },
  { ending: ".dxf", kind: "Drawing", units: null },
  { ending: ".urdf", kind: "Robot", units: "m" },
  { ending: ".srdf", kind: "Planning groups", units: "m" },
  { ending: ".sdf", kind: "Simulation model", units: "m" },
];

/**
 * What a mesh in a study's folder is, as the project files it (`classifyProjectFile`): its result,
 * or the FEA study it holds. Null for any other file. `root` is the project's folder, which an
 * absolute path is read from: without it, only a path in the project can be told.
 */
export function studyMeshKind(path: string, root: string | null): string | null {
  if (!/\.(?:stl|3mf|glb|obj)$/i.test(path)) return null;
  const inProject = workspaceRelativeFilePath(path, root) ?? path;
  if (isAbsolutePath(inProject)) return null;
  const filed = classifyProjectFile(inProject);
  return filed?.group === "Analysis" ? filed.kind : null;
}

/**
 * What the document is and what it is called ("L bracket"): a file from its path, a model by the
 * name the engine gives it (its function's), either one part or an assembly as its document's parts
 * say (`readDocumentKind`). A mesh in a study's folder is a result (`studyMeshKind`), so its jobs
 * are a result's.
 */
export function describePart(
  path: string,
  documentKind: string | null,
  documentName: string | null = null,
  root: string | null = null,
): Pick<PartContext, "name" | "kind" | "units"> {
  const solid = (kind: string) =>
    kind === "Part" && documentKind === "assembly" ? "Assembly" : kind;
  if (isDocumentId(path)) {
    return { name: humanName(documentName ?? "part"), kind: solid("Part"), units: "mm" };
  }
  // A 0.11 study's or CAM job's `result.glb`, named for its folder (`folderResult`).
  const result = folderResult(workspaceRelativeFilePath(path, root) ?? path);
  if (result !== null) return { name: result.name ?? "Result", kind: result.kind, units: "mm" };
  const file = fileName(path);
  const lower = file.toLowerCase();
  const match = KINDS.find((entry) => lower.endsWith(entry.ending) && lower !== entry.ending);
  if (match === undefined) return { name: file, kind: "File", units: null };
  const name = humanName(file.slice(0, file.length - match.ending.length));
  return { name, kind: studyMeshKind(path, root) ?? solid(match.kind), units: match.units };
}

/** What a view's `cad_sync` says it shows; null for any other call, or a view on its home. */
export function readViewSync(call: {
  readonly pluginId: string;
  readonly server: string;
  readonly name: string;
  readonly arguments: unknown;
  readonly result: unknown;
}): ShownView | null {
  if (call.name !== "cad_sync" || !isRecord(call.arguments)) return null;
  const { model, state, closed } = call.arguments;
  if (closed === true || typeof model !== "string" || model.length === 0) return null;
  const reply = isRecord(call.result) ? call.result.structuredContent : null;
  const catalog = isRecord(reply) && isRecord(reply.catalog) ? reply.catalog : null;
  const viewRevision = isRecord(state) ? state.revision : undefined;
  return {
    pluginId: call.pluginId,
    server: call.server,
    path: model,
    revision:
      typeof catalog?.revision === "string"
        ? catalog.revision
        : typeof viewRevision === "string" || typeof viewRevision === "number"
          ? String(viewRevision)
          : "",
  };
}

/** The files the engine reads as documents: a model is one by its id already. */
const ENGINE_FILE = /\.(?:step|stp|xbf)$/i;

/**
 * How the engine's document of what a view shows is reached: a model's by its id; a STEP's or an
 * xbf's by the id opening it answers (`POST /api/v1/documents`, `readOpenedDocument`); any other
 * file has none.
 */
export function documentOf(
  path: string,
): { readonly id: string } | { readonly file: string } | null {
  if (isDocumentId(path)) return { id: path };
  return ENGINE_FILE.test(path) ? { file: path } : null;
}

/** The document `POST /api/v1/documents` answers once the engine holds the file; null while it reads it. */
export function readOpenedDocument(
  reply: unknown,
): { readonly id: string; readonly kind: string } | null {
  if (!isRecord(reply) || reply.state === "reading") return null;
  const { id, kind } = reply;
  return typeof id === "string" && id !== "" && typeof kind === "string" && kind !== ""
    ? { id, kind }
    : null;
}

/** Where a document of `kind` is read (`/api/v1/documents/<kind>/<id>`): its `structure` below it. */
export function documentApi(document: { readonly id: string; readonly kind: string }): string {
  return `/api/v1/documents/${document.kind}/${encodeURIComponent(document.id)}`;
}

/**
 * A document's structure (`/api/v1/documents/<kind>/<id>/structure`) as a part or an assembly: more
 * than one part placed, as the engine counts them (`folder_models.py`). A model of one solid has that
 * solid as its root's one child, so a child alone does not make an assembly.
 */
export function readDocumentKind(structure: unknown): "part" | "assembly" | null {
  if (!isRecord(structure) || !isRecord(structure.tree)) return null;
  const { instances } = structure;
  return Array.isArray(instances) && instances.length > 1 ? "assembly" : "part";
}

/** The name the engine gives a document: a model's its function's, a file's its own. */
export function readDocumentName(structure: unknown): string | null {
  return isRecord(structure) && typeof structure.name === "string" && structure.name !== ""
    ? structure.name
    : null;
}

/** The names of the materials a document's parts are made of, once each. */
export function readMaterials(structure: unknown): string[] {
  if (!isRecord(structure) || !Array.isArray(structure.prototypes)) return [];
  const names = new Set<string>();
  for (const prototype of structure.prototypes) {
    const material = isRecord(prototype) ? prototype.material : null;
    if (isRecord(material) && typeof material.name === "string" && material.name.trim() !== "") {
      names.add(material.name.trim());
    }
  }
  return [...names];
}

const samePath = (a: string, b: string) => a.replaceAll("\\", "/") === b.replaceAll("\\", "/");

/**
 * When Recents last saw the document change (`GET /api/v1/documents`, `updated`, seconds), as
 * epoch milliseconds: a file's own time, a model's last build. A model is listed by its id.
 */
export function readUpdated(recents: unknown, path: string): number | null {
  const list = isRecord(recents) && Array.isArray(recents.documents) ? recents.documents : [];
  for (const recent of list) {
    if (!isRecord(recent)) continue;
    const named =
      recent.id === path || (typeof recent.path === "string" && samePath(recent.path, path));
    if (!named) continue;
    return typeof recent.updated === "number" ? recent.updated * 1000 : null;
  }
  return null;
}

/**
 * The last build, from the document's version (`/api/v1/documents/<id>/version`: a model's build in
 * flight, or the last one that failed, in its own words) and Recents' time: a build in flight or
 * failed is the news, else when it was built (a model) or saved (a file).
 */
export function readBuild(
  version: unknown,
  updated: number | null,
  model: boolean,
): PartBuild | null {
  if (isRecord(version)) {
    if (isRecord(version.failed)) {
      return {
        state: "failed",
        error: typeof version.failed.error === "string" ? version.failed.error : null,
      };
    }
    if (version.building !== null && version.building !== undefined) return { state: "building" };
  }
  return updated === null ? null : { state: model ? "built" : "saved", at: updated };
}

/** How long one ask of a model's build state waits for it to move (`/version`'s `wait`). */
export const BUILD_WAIT_SECONDS = 20;

/**
 * The next ask of a model's build state (`GET /api/v1/documents/<id>/version`): answered once its
 * version or its build's progress moves past what `last` said (a build starting, a frame of it, its
 * end or its failure), or after `BUILD_WAIT_SECONDS`; the first ask, with no `last`, at once.
 */
export function buildPollUrl(id: string, last: unknown): string {
  const base = `/api/v1/documents/${encodeURIComponent(id)}/version?wait=${BUILD_WAIT_SECONDS}`;
  if (!isRecord(last) || typeof last.version !== "string") return base;
  const progress = typeof last.progress === "number" ? `&progress=${last.progress}` : "";
  return `${base}&after=${encodeURIComponent(last.version)}${progress}`;
}

/**
 * A shown model's build, as its part strip says it: the build state the live ask last heard
 * (`buildPollUrl`) over the one its revision's facts read, so a build in flight, or one that failed
 * and left the engine holding the version before it, is the news, not when it was last built.
 */
export function partBuild(
  live: unknown,
  read: { readonly version: unknown; readonly updated: number | null } | null,
  model: boolean,
): PartBuild | null {
  if (read === null && live === null) return null;
  return readBuild(isRecord(live) ? live : (read?.version ?? null), read?.updated ?? null, model);
}

/**
 * A `cad_http` call's arguments: a GET of `url`, or with `body` a POST of it as JSON, carrying the
 * viewer's guard (`x-cad-viewer`), which the CAD server asks of every request that changes something.
 */
export function cadHttpArguments(url: string, body?: unknown) {
  if (body === undefined) return { method: "GET", url };
  let binary = "";
  for (const byte of new TextEncoder().encode(JSON.stringify(body)))
    binary += String.fromCharCode(byte);
  return {
    method: "POST",
    url,
    headers: { "content-type": "application/json", "x-cad-viewer": "1" },
    body: btoa(binary),
  };
}

/**
 * A `cad_http` reply's JSON body: base64, gzipped when large (`encoding: "gzip"`). A 201 is read too
 * (a document opened); a 202 (still reading) and anything else is null.
 */
export async function readTunnelJson(result: unknown): Promise<unknown> {
  const reply = isRecord(result) ? result.structuredContent : null;
  const answered = isRecord(reply) && (reply.status === 200 || reply.status === 201);
  if (!answered || typeof reply.body !== "string") return null;
  const binary = atob(reply.body);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const text =
    reply.encoding === "gzip"
      ? await new Response(
          new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
        ).text()
      : new TextDecoder().decode(bytes);
  return JSON.parse(text) as unknown;
}

/**
 * One load per key while it runs: a caller asking for a key already loading gets that load's
 * promise, and once it settles the next caller loads afresh. The panel bar, the Toolbox, the
 * composer's strip and a document's title block each read the part in front (`usePartContext`),
 * and so its facts are read once per revision.
 */
export function sharedLoad<T>(
  inFlight: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const running = inFlight.get(key);
  if (running !== undefined) return running;
  const started = load().finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}
