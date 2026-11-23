/**
 * Studio's own `cad` command's folder (`CAD_LAUNCHER_DIR`, set by the app for its bundled CAD tools) first on
 * `PATH`, once. The server rebuilds `PATH` from the person's login shell, whose profile may put their own
 * text-to-cad (`~/.local/bin/cad`) ahead; an agent's `cad` would then be another version than Studio's
 * engine, which refuses it. Providers copy the server's environment, so this runs once after that rebuild.
 */
export function studioCadFirstPath(
  path: string | undefined,
  launcherDir: string | undefined,
  platform: NodeJS.Platform,
): string | undefined {
  const folder = launcherDir?.trim();
  if (!folder) return path;
  const windows = platform === "win32";
  const delimiter = windows ? ";" : ":";
  const same = (entry: string) => {
    const a = entry.replace(/[\\/]+$/, "");
    const b = folder.replace(/[\\/]+$/, "");
    return windows ? a.toLowerCase() === b.toLowerCase() : a === b;
  };
  const rest = (path ?? "").split(delimiter).filter((entry) => entry !== "" && !same(entry));
  return [folder, ...rest].join(delimiter);
}

/** `studioCadFirstPath` on a process environment, keeping one `PATH` spelling on Windows. */
export function keepStudioCadFirst(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): void {
  const launcherDir = env.CAD_LAUNCHER_DIR;
  if (!launcherDir?.trim()) return;
  const keys = Object.keys(env).filter((key) =>
    platform === "win32" ? key.toUpperCase() === "PATH" : key === "PATH",
  );
  const current = keys.map((key) => env[key]).find((value) => value !== undefined);
  const next = studioCadFirstPath(current, launcherDir, platform);
  for (const key of keys) delete env[key];
  if (next !== undefined) env.PATH = next;
}
