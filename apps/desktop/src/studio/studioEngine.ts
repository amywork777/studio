// @effect-diagnostics nodeBuiltinImport:off
// Read by boot.ts (through studioAppBundle.ts) before any Effect runtime exists, and by
// scripts/studio.ts, so it stays on Node built-ins.
import * as NodePath from "node:path";

/**
 * Studio's CAD engine's port: the packaged app's, and a checkout's (every `scripts/studio.ts` run)
 * one past it. Both are outside the ports a user's own CAD server rolls
 * through from its 3245 (64 past it), so neither engine ever lands on the other's port, where the
 * one starting would retire the one idle there.
 */
export const STUDIO_ENGINE_PORT = 3345;
export const STUDIO_DEV_ENGINE_PORT = 3346;

/**
 * Studio's CAD server's state, cache, engine and port under its own home, apart from a user's own
 * (3245). `CAD_UPDATE_CHECK=0`: cad (0.11.12+) never updates itself, or a global cad, past the pin.
 * `CAD_TELEMETRY=0`: no text-to-cad telemetry, as channel `dev` gave before 0.11.12 dropped it.
 * `CAD_STUDIO_ENGINE=1`: a `cad mcp` started here runs Studio's own server, never a global cad's.
 */
export function studioEngineEnv(home: string, options: { readonly dev: boolean }) {
  const cad = NodePath.join(home, "cad");
  return {
    CAD_STATE_DIR: NodePath.join(cad, "state"),
    CAD_CACHE_DIR: NodePath.join(cad, "cache"),
    CAD_ENGINE_DIR: NodePath.join(cad, "engine"),
    CAD_ENGINE_PORT: String(options.dev ? STUDIO_DEV_ENGINE_PORT : STUDIO_ENGINE_PORT),
    CAD_LAUNCHER_DIR: NodePath.join(home, "bin"),
    CAD_UPDATE_CHECK: "0",
    CAD_TELEMETRY: "0",
    CAD_STUDIO_ENGINE: "1",
  };
}

/**
 * A checkout's Studio's (`scripts/studio.ts`, every mode): its CAD server in the checkout's home,
 * `~/.text-to-cad-studio-dev` unless `TEXT_TO_CAD_STUDIO_HOME` moves it, on the checkout's port, so a
 * Studio run from a checkout never shares an engine with the packaged app.
 */
export function checkoutEngineEnv(
  env: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
) {
  const home =
    env.TEXT_TO_CAD_STUDIO_HOME?.trim() || NodePath.join(homeDirectory, ".text-to-cad-studio-dev");
  return studioEngineEnv(home, { dev: true });
}

/** `PATH` with Studio's `cad` command's folder first, once. */
export function studioPath(launcherDir: string, path: string | undefined): string {
  const rest = (path ?? "").split(NodePath.delimiter).filter((entry) => entry !== launcherDir);
  return [launcherDir, ...rest].filter((entry) => entry !== "").join(NodePath.delimiter);
}
