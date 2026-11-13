// @effect-diagnostics nodeBuiltinImport:off - a launcher that only sets the environment and runs the dev runner.
/**
 * `node scripts/studio.ts [dev|dev:desktop]`: T3 Code as text-to-cad Studio, with the `text-to-cad/`
 * submodule as plugin marketplace, `brand/`, samples, and state in `~/.text-to-cad-studio`. Env:
 * TEXT_TO_CAD_ROOT (another checkout), TEXT_TO_CAD_STUDIO_HOME (state), TEXT_TO_CAD_DEV=1 (the
 * checkout's CAD working copy), STUDIO_SOLIDCRAFT=1 (offer SolidCraft; `_APP=1` bridges the app).
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { checkoutEngineEnv, studioPath } from "../apps/desktop/src/studio/studioEngine.ts";
import { buildEditorPage } from "./editor-pages.ts";

const appRoot = NodePath.dirname(import.meta.dirname);
const checkout = NodePath.resolve(
  process.env.TEXT_TO_CAD_ROOT?.trim() || NodePath.join(appRoot, "text-to-cad"),
);
if (!NodeFS.existsSync(NodePath.join(checkout, ".claude-plugin", "marketplace.json"))) {
  process.stderr.write(
    `No text-to-cad at ${checkout}. It lives in this repository at text-to-cad/; TEXT_TO_CAD_ROOT points at another checkout.\n`,
  );
  process.exit(1);
}

const mode = process.argv[2] ?? "dev";
if (mode !== "dev" && mode !== "dev:desktop") {
  process.stderr.write(`Usage: node scripts/studio.ts [dev|dev:desktop]\n`);
  process.exit(1);
}
const dev = process.env.TEXT_TO_CAD_DEV?.trim() === "1";
const home =
  process.env.TEXT_TO_CAD_STUDIO_HOME?.trim() ||
  NodePath.join(NodeOS.homedir(), dev ? ".text-to-cad-studio-dev" : ".text-to-cad-studio");
// The checkout's own CAD state, engine and `cad` command, in the checkout's home on its own port, so
// it never shares an engine with the packaged app. TEXT_TO_CAD_STUDIO_ENGINE_PORT moves the port so a
// second checkout's Studio can run beside a running one.
const enginePort = process.env.TEXT_TO_CAD_STUDIO_ENGINE_PORT?.trim();
const engineEnv = {
  ...checkoutEngineEnv(process.env, NodeOS.homedir()),
  ...(enginePort ? { CAD_ENGINE_PORT: enginePort } : {}),
};
const cadEnv = {
  ...process.env,
  ...engineEnv,
  // The text-to-cad this checkout runs, which projects are stamped with, as a built app's is.
  STUDIO_TEXT_TO_CAD_VERSION: NodeFS.readFileSync(
    NodePath.join(checkout, "VERSION"),
    "utf8",
  ).trim(),
  PATH: studioPath(engineEnv.CAD_LAUNCHER_DIR, process.env.PATH),
};
// The checkout's development plugin: its skills and server on its .venv, its page built fresh.
let marketplace = checkout;
if (dev) {
  process.stderr.write(`Building the development plugin from ${checkout}...\n`);
  // The checkout's own Python (its .venv, as new as the CAD tools need), else the system's, which on a
  // Mac with only Apple's command line tools is too old.
  const venvPython = NodePath.join(checkout, ".venv", "bin", "python");
  const built = NodeChildProcess.spawnSync(
    NodeFS.existsSync(venvPython) ? venvPython : "python3",
    [NodePath.join(appRoot, "scripts", "studio-dev-plugin.py"), checkout],
    {
      cwd: appRoot,
      env: cadEnv,
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const folder = built.stdout.trim().split("\n").at(-1) ?? "";
  if (built.status !== 0 || folder === "") process.exit(built.status || 1);
  marketplace = folder;
  // The engine serves the CAD page from the folder it started with, and it outlives this launcher:
  // left running, it would keep serving the last build's page.
  NodeChildProcess.spawnSync(
    NodeFS.existsSync(venvPython) ? venvPython : "python3",
    ["-m", "cad_server.engine", "stop"],
    { cwd: appRoot, env: cadEnv, stdio: ["ignore", "ignore", "inherit"] },
  );
}

// Studio's own plugins (studio-plugins/), copied fresh each start with this computer's paths
// written into their MCP configs, so nothing in the repository names a path on one computer.
const own = NodePath.join(home, "studio-plugins");
NodeFS.rmSync(own, { recursive: true, force: true });
NodeFS.cpSync(NodePath.join(appRoot, "studio-plugins"), own, { recursive: true });
const markets = [marketplace];
const defaults = ["text-to-cad"];
const writeConfig = (plugin: string, name: string, args: ReadonlyArray<string>) =>
  NodeFS.writeFileSync(
    NodePath.join(own, plugin, "codex.mcp.json"),
    JSON.stringify({ mcpServers: { [name]: { command: process.execPath, args } } }, null, 2),
  );

// SolidCraft (a parametric CAD engine) behind an editor page of its own, only when asked:
// STUDIO_SOLIDCRAFT=1, with it installed in Applications. STUDIO_SOLIDCRAFT_APP=1 bridges its
// engine to the SolidCraft app instead of running it headless.
const SOLIDCRAFT_APP = process.env.SOLIDCRAFT_APP?.trim() || "/Applications/SolidCraft.app";
const SOLIDCRAFT_PORT = "7878";
const bridged = process.env.STUDIO_SOLIDCRAFT_APP?.trim() === "1";
if (process.env.STUDIO_SOLIDCRAFT?.trim() === "1" && NodeFS.existsSync(SOLIDCRAFT_APP)) {
  const projects =
    process.env.STUDIO_PROJECTS_DIR?.trim() || NodePath.join(NodeOS.homedir(), "studio-projects");
  const allowed = [
    projects,
    ...(process.env.SOLIDCRAFT_ALLOW_PATHS?.split(NodePath.delimiter) ?? []),
  ]
    .map((folder) => folder.trim())
    .filter(Boolean);
  await buildEditorPage(
    appRoot,
    NodePath.join(appRoot, "studio-plugins", "solidcraft", "editor"),
    NodePath.join(own, "solidcraft", "editor", "editor.html"),
  );
  writeConfig("solidcraft", "solidcraft", [
    NodePath.join(own, "solidcraft", "server", "server.mjs"),
    "--cli",
    NodePath.join(SOLIDCRAFT_APP, "Contents", "MacOS", "solidcraft-cli"),
    ...(bridged ? ["--connect", `127.0.0.1:${SOLIDCRAFT_PORT}`] : []),
    ...allowed.flatMap((folder) => ["--allow-path", folder]),
  ]);
  defaults.push("solidcraft");
  if (bridged) {
    // Opens SolidCraft beside Studio, ready for the agent; one already open keeps its own window.
    NodeChildProcess.spawn("open", ["-a", SOLIDCRAFT_APP, "--args", "--control", SOLIDCRAFT_PORT], {
      stdio: "ignore",
      detached: true,
    }).unref();
  }
} else {
  // Left out entirely, so its skills never point the agent at tools that are not there.
  NodeFS.rmSync(NodePath.join(own, "solidcraft"), { recursive: true, force: true });
  const listing = NodePath.join(own, ".claude-plugin", "marketplace.json");
  const market = JSON.parse(NodeFS.readFileSync(listing, "utf8"));
  market.plugins = market.plugins.filter(
    (plugin: { name: string }) => plugin.name !== "solidcraft",
  );
  NodeFS.writeFileSync(listing, JSON.stringify(market, null, 2));
}
if (defaults.length > 1) markets.push(own);

// text-to-cad's name, mark, icons and accent (brand/README.md).
const brandDir = NodePath.join(appRoot, "brand");
const brand = JSON.parse(NodeFS.readFileSync(NodePath.join(brandDir, "brand.json"), "utf8"));

const run = NodeChildProcess.spawnSync(
  process.execPath,
  [
    NodePath.join(appRoot, "scripts", "dev-runner.ts"),
    mode,
    "--home-dir",
    home,
    ...process.argv.slice(3),
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
    env: {
      ...cadEnv,
      T3CODE_PLUGIN_MARKETPLACE: markets.join(NodePath.delimiter),
      T3CODE_DEFAULT_PLUGINS: defaults.join(","),
      VITE_APP_BASE_NAME: brand.name,
      T3CODE_BRAND_DIR: brandDir,
      T3CODE_SAMPLES_DIR: NodePath.join(appRoot, "studio-sample"),
    },
  },
);
process.exit(run.status ?? 1);
