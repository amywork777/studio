// @effect-diagnostics nodeBuiltinImport:off -- renders through the plugin's own CLI and caches PNG files on disk.
/**
 * Pictures of every model in a project for Studio's project page, rendered by text-to-cad's own
 * `cad <type> snapshot` from the same release as the plugin's `cad-mcp`, a batch of one type a run.
 * Cached by file size and time, or by a model's build, so a page renders only what changed.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { expandPluginRoot, type PluginServerConfig } from "@t3tools/plugins";

/** How big a picture is: a project page's tile, sharp at twice its size. */
const WIDTH = 480;
const HEIGHT = 360;
/** A batch of cold renders (a kernel warming up) can take this long. */
const RUN_MS = 4 * 60_000;

/** The files the CAD server renders, by ending. */
const RENDERABLE = /\.(?:step|stp|xbf|stl|3mf|glb|dxf|urdf|srdf|sdf)$/i;

/** The files drawn on their own paper. */
const DRAWING = /\.dxf$/i;

/** A CAD document id: a model's, which its script's run prints (the library's `ids.is_id`). */
const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Each renderable ending's document type, as `cad <type> snapshot` names it (`cad.registry`). */
const DOCUMENT_TYPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\.(?:step|stp)$/i, "step"],
  [/\.xbf$/i, "xbf"],
  [/\.stl$/i, "stl"],
  [/\.3mf$/i, "threemf"],
  [/\.glb$/i, "glb"],
  [/\.dxf$/i, "dxf"],
  [/\.urdf$/i, "urdf"],
  [/\.srdf$/i, "srdf"],
  [/\.sdf$/i, "sdf"],
];

/** The type `cad <type> snapshot` draws a document of: a model by its id, a file by its ending. */
export function documentType(path: string): string | null {
  if (DOCUMENT_ID.test(path)) return "model";
  return DOCUMENT_TYPES.find(([ending]) => ending.test(path))?.[1] ?? null;
}

export interface SnapshotLaunch {
  readonly command: string;
  /** The CAD command's arguments, up to the document type: `… cad`, `-m cad_server.cli`. */
  readonly args: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  /** A release before 0.11, whose `cad snapshot` takes a document of any type. */
  readonly typeless?: true;
}

/** A release's version as its pin names it (`==0.10.4`), or null for none. */
const releaseOf = (pin: string | undefined) => /^==(\d+)\.(\d+)/.exec(pin ?? "");

/**
 * The snapshot command for a plugin's CAD server: a release's `uvx … --from cad-mcp==<v> cad-mcp`
 * becomes `uvx … --from cad-server==<v> cad`, and a Python's `-m cad_mcp` becomes
 * `-m cad_server.cli`. Null for a server that is not CAD's.
 */
export function snapshotLaunch(
  plugin: { readonly root: string; readonly servers: Readonly<Record<string, PluginServerConfig>> },
  environment: Readonly<Record<string, string | undefined>>,
): SnapshotLaunch | null {
  for (const config of Object.values(plugin.servers)) {
    if (config.command === null) continue;
    const found = cadArgs(config.args);
    if (found === null) continue;
    const { args, typeless } = found;
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(environment))
      if (value !== undefined) env[key] = value;
    for (const [key, value] of Object.entries(config.env))
      env[key] = expandPluginRoot(value, plugin.root);
    env.PLUGIN_ROOT = plugin.root;
    env.CLAUDE_PLUGIN_ROOT = plugin.root;
    return {
      command: expandPluginRoot(config.command, plugin.root),
      args: args.map((arg) => expandPluginRoot(arg, plugin.root)),
      env,
      cwd: plugin.root,
      ...(typeless ? { typeless: true as const } : {}),
    };
  }
  return null;
}

/** The CAD command's arguments for a CAD server's launch arguments; null for another server's. */
function cadArgs(
  args: ReadonlyArray<string>,
): { readonly args: string[]; readonly typeless: boolean } | null {
  const last = args.at(-1);
  if (last === "cad_mcp" && args.at(-2) === "-m")
    return { args: [...args.slice(0, -2), "-m", "cad_server.cli"], typeless: false };
  if (last !== "cad-mcp") return null;
  const from = args.indexOf("--from");
  const release = from === -1 ? undefined : /^cad-mcp(==.+)$/.exec(args[from + 1] ?? "")?.[1];
  if (release === undefined) return null;
  const version = releaseOf(release);
  return {
    args: [
      ...args.slice(0, from),
      "--from",
      `cad-server${release}`,
      ...args.slice(from + 2, -1),
      "cad",
    ],
    typeless: version !== null && Number(version[1]) === 0 && Number(version[2]) < 11,
  };
}

/** The arguments that draw a batch of one document type: `<type> snapshot`, or before 0.11 `snapshot`. */
const snapshotOf = (launch: SnapshotLaunch, type: string) =>
  launch.typeless === true ? [...launch.args, "snapshot"] : [...launch.args, type, "snapshot"];

export const isRenderable = (path: string) => RENDERABLE.test(path);

/**
 * How a picture is drawn, in what it is cached by: a picture drawn another way is a new picture,
 * not the old one kept. Now a part on nothing, the tile's own ground in each theme behind it.
 */
const PICTURE_LOOK = "model-alone";

/** Where a picture is cached: named by what it shows, so an edit or a build is a new picture. */
const cached = (cacheDir: string, key: string) =>
  NodePath.join(
    cacheDir,
    `${NodeCrypto.createHash("sha256").update(`${PICTURE_LOOK}\n${key}`).digest("hex").slice(0, 32)}.png`,
  );

/** A file's picture: by the file and its size and time. */
export function pictureFile(cacheDir: string, absolute: string, stat: NodeFS.Stats): string {
  return cached(cacheDir, `${absolute}\n${stat.size}\n${stat.mtimeMs}`);
}

function run(launch: SnapshotLaunch, type: string, jobFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(
      launch.command,
      [
        ...snapshotOf(launch, type),
        "--job",
        jobFile,
        "--width",
        String(WIDTH),
        "--height",
        String(HEIGHT),
      ],
      {
        cwd: launch.cwd,
        env: launch.env,
        stdio: ["ignore", "ignore", "pipe"],
        timeout: RUN_MS,
        killSignal: "SIGTERM",
      },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split("\n").at(-1) || `snapshot exited with ${code}`));
    });
  });
}

// One render at a time per project: a page that asks again while one runs waits for it.
const running = new Map<string, Promise<unknown>>();

interface PicturesInput {
  readonly launch: SnapshotLaunch;
  readonly cwd: string;
  /** Workspace-relative files, and models by their document id. */
  readonly paths: ReadonlyArray<string>;
  /** Each model's build (its Recents `updated`), by id: what its picture is cached by. */
  readonly versions?: Readonly<Record<string, string>> | undefined;
  readonly cacheDir: string;
}

/**
 * Base64 PNGs of `paths` under `cwd`; null for a file that is gone or will not render, or a model
 * whose build is not named. Uncached ones render in one batch per document type, and a failed batch
 * falls back to one by one, so a broken file costs only its own picture.
 */
export async function renderModelPictures(
  input: PicturesInput,
): Promise<Array<{ readonly path: string; readonly png: string | null }>> {
  const previous = running.get(input.cwd) ?? Promise.resolve();
  const turn = previous.catch(() => undefined).then(() => render(input));
  running.set(input.cwd, turn);
  try {
    return await turn;
  } finally {
    if (running.get(input.cwd) === turn) running.delete(input.cwd);
  }
}

async function render(input: PicturesInput) {
  NodeFS.mkdirSync(input.cacheDir, { recursive: true });
  const root = NodePath.resolve(input.cwd);
  const files = input.paths.map((path) => {
    if (DOCUMENT_ID.test(path)) {
      // The engine draws a model from the document it holds; its build names the picture.
      const version = input.versions?.[path];
      return {
        path,
        absolute: path,
        picture: version === undefined ? null : cached(input.cacheDir, `${path}\n${version}`),
      };
    }
    const absolute = NodePath.resolve(root, path);
    // Workspace files only.
    if (!absolute.startsWith(`${root}${NodePath.sep}`) || !isRenderable(path)) {
      return { path, absolute, picture: null };
    }
    try {
      return {
        path,
        absolute,
        picture: pictureFile(input.cacheDir, absolute, NodeFS.statSync(absolute)),
      };
    } catch {
      return { path, absolute, picture: null };
    }
  });
  const missing = files.filter(
    (file): file is typeof file & { picture: string } =>
      file.picture !== null && !NodeFS.existsSync(file.picture),
  );
  const job = (file: { readonly absolute: string; readonly picture: string }) => ({
    input: file.absolute,
    outputs: [{ path: file.picture }],
    // A part on nothing, the viewer's ground the tile's. A drawing keeps its paper: its dark ink on
    // nothing would be lost on a dark tile.
    output: { padding: 0.08, ...(DRAWING.test(file.absolute) ? {} : { transparent: true }) },
  });
  const runJobs = async (type: string, jobs: ReadonlyArray<ReturnType<typeof job>>) => {
    const jobFile = NodePath.join(input.cacheDir, `job-${NodeCrypto.randomUUID()}.json`);
    NodeFS.writeFileSync(jobFile, JSON.stringify(jobs));
    try {
      await run(input.launch, type, jobFile);
    } finally {
      NodeFS.rmSync(jobFile, { force: true });
    }
  };
  // One batch a document type, in the order the page asked for them; before 0.11, one in all.
  const batches = new Map<string, Array<(typeof missing)[number]>>();
  for (const file of missing) {
    const type = input.launch.typeless === true ? "" : (documentType(file.path) ?? "");
    if (input.launch.typeless !== true && type === "") continue;
    batches.set(type, [...(batches.get(type) ?? []), file]);
  }
  for (const [type, files] of batches) {
    try {
      await runJobs(type, files.map(job));
    } catch {
      for (const file of files) {
        if (NodeFS.existsSync(file.picture)) continue;
        await runJobs(type, [job(file)]).catch(() => undefined);
      }
    }
  }
  return files.map((file) => {
    if (file.picture === null || !NodeFS.existsSync(file.picture))
      return { path: file.path, png: null };
    return { path: file.path, png: NodeFS.readFileSync(file.picture).toString("base64") };
  });
}
