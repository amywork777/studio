// @effect-diagnostics nodeBuiltinImport:off
// Runs from boot.ts before any Effect runtime exists, so it stays on Node built-ins.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { studioEngineEnv, studioPath } from "./studioEngine.ts";

/**
 * Points the Studio app at the bundle in its resources (`Contents/Resources/studio`, or
 * `resources\studio` on Windows) on each start, before anything reads the environment: a home and
 * profile apart from T3 Code's `~/.t3`, so the apps never share state or a single-instance lock.
 * Anything already set in the environment wins, so a test can point elsewhere; no bundle, no change.
 */
export function applyStudioAppBundle(input: {
  readonly resourcesPath: string | undefined;
  readonly homeDirectory: string;
  readonly env: Record<string, string | undefined>;
  /** The system the app runs on: the running one, unless a test names another. */
  readonly platform?: NodeJS.Platform;
}): void {
  if (input.resourcesPath === undefined || input.resourcesPath === "") return;
  const bundle = NodePath.join(input.resourcesPath, "studio");
  const settings = readSettings(NodePath.join(bundle, "studio.json"));
  if (settings === null) return;
  const { env } = input;
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Runs before any Effect runtime.
  const platform = input.platform ?? process.platform;
  const home = env.T3CODE_HOME?.trim() || NodePath.join(input.homeDirectory, settings.home);
  // uv's CPython keeps its program in `bin` on a Mac and at its top on Windows.
  const python =
    platform === "win32"
      ? NodePath.join(bundle, "python", "python.exe")
      : NodePath.join(bundle, "python", "bin", "python3");
  // Windows paths go in with forward slashes, which Windows takes and JSON needs no escapes for.
  const forPlugin = (path: string) => (platform === "win32" ? path.replaceAll("\\", "/") : path);
  setDefault(env, "T3CODE_HOME", home);
  setDefault(env, "VITE_APP_BASE_NAME", settings.name);
  if (settings.version !== undefined) setDefault(env, "T3CODE_APP_VERSION", settings.version);
  if (settings.textToCad !== undefined) {
    setDefault(env, "STUDIO_TEXT_TO_CAD_VERSION", settings.textToCad);
  }
  setDefault(env, "T3CODE_DESKTOP_PROFILE", settings.profile);
  // New projects go somewhere a person sees; the server makes the folder on first use.
  setDefault(
    env,
    "STUDIO_NEW_PROJECTS_DIR",
    NodePath.join(input.homeDirectory, "Documents", "Studio"),
  );
  setDefault(env, "T3CODE_DEFAULT_PLUGINS", settings.plugins.join(","));
  // A build made with a usage receiver sends anonymous usage counts there, which Settings can turn off.
  if (settings.usageUrl !== undefined) setDefault(env, "T3CODE_USAGE_URL", settings.usageUrl);
  for (const [name, value] of Object.entries(studioEngineEnv(home, { dev: false }))) {
    setDefault(env, name, value);
  }
  env.PATH = studioPath(env.CAD_LAUNCHER_DIR!, env.PATH);
  // The app's Python writes no `.pyc` into the signed app, whose seal a new file breaks; the build
  // compiled them already (scripts/build-studio-app.sh). Its agents' and engine's Pythons inherit it.
  setDefault(env, "PYTHONDONTWRITEBYTECODE", "1");
  const samples = NodePath.join(bundle, "sample");
  if (NodeFS.existsSync(samples)) setDefault(env, "T3CODE_SAMPLES_DIR", samples);
  // The library's wheel, which an integration made on first use (kicad's) installs from.
  const wheels = NodePath.join(bundle, "wheels");
  if (NodeFS.existsSync(wheels)) setDefault(env, "CAD_UPDATE_FIND_LINKS", wheels);
  try {
    trustBundledTools(bundle);
    // A folder of Studio's own name: T3 Code's plugin store keys a marketplace by its folder name.
    const marketplace = NodePath.join(home, "studio-app-plugins");
    writeFilledCopy(NodePath.join(bundle, "marketplace"), marketplace, {
      "@@STUDIO_PYTHON@@": forPlugin(python),
    });
    setDefault(env, "T3CODE_PLUGIN_MARKETPLACE", marketplace);
    writeStudioCommands(env.CAD_LAUNCHER_DIR!, python, bundle, platform);
  } catch (error) {
    // Studio still opens; it just has no CAD tools this time, and says why in its log.
    // @effect-diagnostics-next-line globalConsole:off - Runs before any Effect logger exists.
    console.error("[studio] Could not set up the CAD tools:", error);
  }
}

interface StudioSettings {
  readonly name: string;
  readonly home: string;
  readonly profile: string;
  readonly plugins: ReadonlyArray<string>;
  /** Studio's version, which the build was given; absent in a build older than this field. */
  readonly version?: string;
  /** The text-to-cad version the build included. */
  readonly textToCad?: string;
  /** Studio's usage receiver (`infra/usage`), which counts go to; absent in a build made without one. */
  readonly usageUrl?: string;
}

/**
 * Studio's own `cad` (and `cad.cmd`), never an installed one that updates itself past Studio's pin;
 * `studio-install-freecad` (`scripts/studio_freecad.py`) and on a Mac, until it has run, a stand-in
 * `freecadcmd`. `-B`: the bundled Python writes no `.pyc` into the signed app.
 */
function writeStudioCommands(
  folder: string,
  python: string,
  bundle: string,
  platform: NodeJS.Platform,
): void {
  const quote = (path: string) => `'${path.replaceAll("'", `'"'"'`)}'`;
  writeIfChanged(
    NodePath.join(folder, "cad"),
    `#!/bin/sh\nexec ${quote(python)} -P -B -m cad_server.cli "$@"\n`,
    0o755,
  );
  writeIfChanged(
    NodePath.join(folder, "studio-install-freecad"),
    `#!/bin/sh\nexec ${quote(python)} -P -B ${quote(NodePath.join(bundle, "tools", "studio_freecad.py"))} "$@"\n`,
    0o755,
  );
  writeIfChanged(
    NodePath.join(folder, "cad.cmd"),
    `@"${python}" -P -B -m cad_server.cli %*\r\n`,
    0o644,
  );
  if (platform === "darwin") writeFreecadStandIn(NodePath.join(folder, "freecadcmd"));
}

// scripts/studio_freecad.py's STAND_IN, which `studio-install-freecad` knows by its mark and replaces.
const STAND_IN_MARK =
  "# Studio's freecadcmd until studio-install-freecad installs FreeCAD for Studio.";
const STAND_IN = `#!/bin/sh\n${STAND_IN_MARK}\necho 'FreeCAD is not installed for Studio: ask the person whether to install it (a download of about 650 MB), then run studio-install-freecad.' >&2\nexit 1\n`;

/**
 * A `freecadcmd` that exits at once saying FreeCAD is not installed for Studio, first on PATH, so
 * cad's CAM never falls through to a FreeCAD in Applications whose first run waits on macOS's
 * question. Never over Studio's FreeCAD (a link to a file that is there) or a file of someone
 * else's; a link left by a deleted FreeCAD, which cad would skip, is replaced.
 */
function writeFreecadStandIn(file: string): void {
  let entry: NodeFS.Stats | null = null;
  try {
    entry = NodeFS.lstatSync(file);
  } catch {
    entry = null;
  }
  if (entry?.isSymbolicLink()) {
    if (NodeFS.existsSync(file)) return;
    NodeFS.rmSync(file);
  } else if (entry !== null && !NodeFS.readFileSync(file, "utf8").includes(STAND_IN_MARK)) {
    return;
  }
  writeIfChanged(file, STAND_IN, 0o755);
}

function writeIfChanged(file: string, content: string, mode: number): void {
  let current: string | null = null;
  try {
    current = NodeFS.readFileSync(file, "utf8");
  } catch {
    current = null;
  }
  if (current !== content) {
    NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
    NodeFS.writeFileSync(file, content);
  }
  NodeFS.chmodSync(file, mode);
}

const isVersion = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9A-Za-z.+-]{1,64}$/.test(value);

function readSettings(file: string): StudioSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(NodeFS.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { name, home, profile, plugins, version, textToCad, usageUrl } = parsed as Record<
    string,
    unknown
  >;
  if (typeof name !== "string" || typeof home !== "string" || typeof profile !== "string") {
    return null;
  }
  const names = Array.isArray(plugins)
    ? plugins.filter((plugin) => typeof plugin === "string")
    : [];
  return {
    name,
    home,
    profile,
    plugins: names,
    ...(isVersion(version) ? { version } : {}),
    ...(isVersion(textToCad) ? { textToCad } : {}),
    ...(typeof usageUrl === "string" && /^https:\/\/[^\s"]+$/.test(usageUrl) ? { usageUrl } : {}),
  };
}

function setDefault(env: Record<string, string | undefined>, name: string, value: string): void {
  if (!env[name]?.trim()) env[name] = value;
}

function filesIn(root: string, folder = ""): string[] {
  return NodeFS.readdirSync(NodePath.join(root, folder), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = NodePath.join(folder, entry.name);
      if (entry.isDirectory()) return filesIn(root, relative);
      return entry.isFile() ? [relative] : [];
    },
  );
}

/**
 * `content` with the app's paths in it: as a JSON string's text in a `.json` file, and elsewhere
 * (the skills' commands) in quotes when the path has a space, as under a Windows user folder named
 * like "Amy Zhou".
 */
function filled(content: Buffer, values: Readonly<Record<string, string>>, file: string): Buffer {
  if (!content.includes("@@STUDIO_")) return content;
  const json = file.endsWith(".json");
  let text = content.toString("utf8");
  for (const [token, value] of Object.entries(values)) {
    const written = json
      ? JSON.stringify(value).slice(1, -1)
      : /\s/.test(value)
        ? `"${value}"`
        : value;
    text = text.replaceAll(token, written);
  }
  return Buffer.from(text, "utf8");
}

/**
 * Copies `source` to `target` with the app's paths filled in, writing only what changed and
 * removing what the bundle no longer has, so the plugin's fingerprint (and T3 Code's install of
 * it) moves only when the plugin or the app's place does.
 */
export function writeFilledCopy(
  source: string,
  target: string,
  values: Readonly<Record<string, string>>,
): void {
  const wanted = new Set(filesIn(source));
  for (const file of wanted) {
    const from = NodePath.join(source, file);
    const to = NodePath.join(target, file);
    const content = filled(NodeFS.readFileSync(from), values, file);
    let current: Buffer | null = null;
    try {
      current = NodeFS.readFileSync(to);
    } catch {
      current = null;
    }
    if (current === null || !current.equals(content)) {
      NodeFS.mkdirSync(NodePath.dirname(to), { recursive: true });
      NodeFS.writeFileSync(to, content);
    }
    NodeFS.chmodSync(to, NodeFS.statSync(from).mode);
  }
  if (!NodeFS.existsSync(target)) return;
  for (const file of filesIn(target)) {
    if (!wanted.has(file)) NodeFS.rmSync(NodePath.join(target, file), { force: true });
  }
}

/**
 * The bundled Python, with the FEA solver and the libraries it carries, came in the same download as Studio, which the person let
 * open (Open Anyway). Clearing the download's quarantine mark from them keeps macOS from stopping
 * each of those programs again on its own. A no-op once cleared, and on a build that was never
 * downloaded.
 */
function trustBundledTools(bundle: string): void {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Runs before any Effect runtime.
  if (process.platform !== "darwin") return;
  const folder = NodePath.join(bundle, "python");
  const marked = NodeChildProcess.spawnSync("xattr", ["-p", "com.apple.quarantine", folder], {
    stdio: "ignore",
  });
  if (marked.status !== 0) return;
  NodeChildProcess.spawnSync("xattr", ["-dr", "com.apple.quarantine", folder], {
    stdio: "ignore",
  });
}
