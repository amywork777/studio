// @effect-diagnostics nodeBuiltinImport:off
// Runs from boot.ts before any Effect runtime exists, so it stays on Node built-ins.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/**
 * The Studio app (`scripts/build-studio-app.sh`) carries a bundle in its resources
 * (`Contents/Resources/studio` on a Mac, `resources\studio` on Windows):
 * the CAD tools with a Python of their own, their plugin laid out as a marketplace, the plugin's
 * page, and the settings the app starts with (`studio.json`). On each start, before anything reads
 * the environment, this points the app at that bundle, as `scripts/studio.ts` does for a checkout:
 *
 * - Studio's own home (`T3CODE_HOME`) and Electron profile (`T3CODE_DESKTOP_PROFILE`), apart from
 *   T3 Code's `~/.t3`, so the two apps never share state or a single-instance lock.
 * - Its name (`VITE_APP_BASE_NAME`), which the desktop and the server read at runtime.
 * - The CAD plugin, copied into the home with this copy of the app's paths filled in (the app can
 *   live anywhere), then offered and turned on (`T3CODE_PLUGIN_MARKETPLACE`,
 *   `T3CODE_DEFAULT_PLUGINS`).
 *
 * The computer needs no Node of its own: with none on PATH, cadgen runs its mesh and DXF builders on
 * the Node Playwright ships inside the bundled Python, finding it itself, on a Mac or on Windows.
 *
 * Anything already set in the environment wins, so a test can point the app elsewhere. Without a
 * bundle (T3 Code, or Studio run from a checkout) it does nothing.
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
  setDefault(env, "T3CODE_DESKTOP_PROFILE", settings.profile);
  setDefault(env, "T3CODE_DEFAULT_PLUGINS", settings.plugins.join(","));
  try {
    trustBundledTools(bundle);
    // A folder of Studio's own name: T3 Code's plugin store keys a marketplace by its folder name.
    const marketplace = NodePath.join(home, "studio-app-plugins");
    writeFilledCopy(NodePath.join(bundle, "marketplace"), marketplace, {
      "@@STUDIO_PYTHON@@": forPlugin(python),
      "@@STUDIO_PAGE@@": forPlugin(NodePath.join(bundle, "page")),
    });
    setDefault(env, "T3CODE_PLUGIN_MARKETPLACE", marketplace);
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
}

function readSettings(file: string): StudioSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(NodeFS.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { name, home, profile, plugins } = parsed as Record<string, unknown>;
  if (typeof name !== "string" || typeof home !== "string" || typeof profile !== "string") {
    return null;
  }
  const names = Array.isArray(plugins)
    ? plugins.filter((plugin) => typeof plugin === "string")
    : [];
  return { name, home, profile, plugins: names };
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
 * The bundled Python and its libraries came in the same download as Studio, which the person let
 * open (Open Anyway). Clearing the download's quarantine mark from them keeps macOS from stopping
 * each of those programs again on its own. A no-op once cleared, and on a build that was never
 * downloaded.
 */
function trustBundledTools(bundle: string): void {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Runs before any Effect runtime.
  if (process.platform !== "darwin") return;
  const python = NodePath.join(bundle, "python");
  const marked = NodeChildProcess.spawnSync("xattr", ["-p", "com.apple.quarantine", python], {
    stdio: "ignore",
  });
  if (marked.status !== 0) return;
  NodeChildProcess.spawnSync("xattr", ["-dr", "com.apple.quarantine", python], { stdio: "ignore" });
}
