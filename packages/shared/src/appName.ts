/**
 * The app's name in words people and agents read. A fork names itself with `VITE_APP_BASE_NAME`
 * (Studio): its desktop app and server find it in their environment, and a browser client, which
 * has none, passes its own build's name to `nameApp` as it starts. Without either it is T3 Code.
 */
let appBaseName = globalThis.process?.env?.VITE_APP_BASE_NAME?.trim() || "T3 Code";

export function appName(): string {
  return appBaseName;
}

export function nameApp(name: string): void {
  const trimmed = name.trim();
  if (trimmed !== "") appBaseName = trimmed;
}
