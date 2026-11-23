// Studio: every agent's `cad` is Studio's own. Run once at startup from `server.ts`, after `fixPath`; every
// provider copies the server's environment, so this is the one place for all of them.
import { keepStudioCadFirst } from "@t3tools/shared/studioCadPath";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/** The zsh startup files, in the order zsh reads them; each of Studio's runs the person's own first. */
export const ZSH_STARTUP_FILES = [".zshenv", ".zprofile", ".zshrc", ".zlogin"] as const;
/** Studio's `BASH_ENV`, which a non-interactive bash reads before its command. */
export const BASH_ENV_FILE = "bash_env";

// zsh: "$CAD_LAUNCHER_DIR" first on PATH, once (zsh splits no unquoted word, so the array form; (b) quotes the folder
// as a pattern).
const ZSH_CAD_FIRST = `if [[ -n "\${CAD_LAUNCHER_DIR-}" ]]; then
  path=("$CAD_LAUNCHER_DIR" "\${(@)path:#\${(b)CAD_LAUNCHER_DIR}}")
  export PATH
fi`;
// POSIX sh (bash's BASH_ENV): the same.
const CAD_FIRST = `if [ -n "\${CAD_LAUNCHER_DIR-}" ]; then
  __studio_rest=
  __studio_ifs=$IFS
  IFS=:
  for __studio_entry in $PATH; do
    [ "$__studio_entry" = "$CAD_LAUNCHER_DIR" ] || __studio_rest="\${__studio_rest:+$__studio_rest:}$__studio_entry"
  done
  IFS=$__studio_ifs
  PATH="$CAD_LAUNCHER_DIR\${__studio_rest:+:$__studio_rest}"
  export PATH
  unset __studio_rest __studio_ifs __studio_entry
fi`;

/**
 * One of Studio's zsh startup files: the person's own (from `STUDIO_USER_ZDOTDIR` or `$HOME`, with their
 * `ZDOTDIR` while it runs, and one their `.zshenv` moves to kept), then Studio's `cad` first. `ZDOTDIR` is
 * Studio's again after, so zsh reads Studio's next file; history stays theirs.
 */
export function zshStartupFile(file: (typeof ZSH_STARTUP_FILES)[number]): string {
  const follow =
    file === ".zshenv"
      ? `  [ "$ZDOTDIR" = "$__studio_user" ] || export STUDIO_USER_ZDOTDIR="$ZDOTDIR"\n`
      : "";
  const history =
    file === ".zshrc"
      ? `[ "\${HISTFILE-}" = "$__studio_self/.zsh_history" ] && HISTFILE="$__studio_user/.zsh_history"\n`
      : "";
  return `# Studio: the person's own ${file}, then Studio's cad first on PATH (apps/server/src/studio/studioAgentShell.ts).
__studio_self="$ZDOTDIR"
__studio_user="\${STUDIO_USER_ZDOTDIR:-$HOME}"
if [ -r "$__studio_user/${file}" ]; then
  ZDOTDIR="$__studio_user"
  source "$__studio_user/${file}"
${follow}  ZDOTDIR="$__studio_self"
fi
${history}${ZSH_CAD_FIRST}
unset __studio_self __studio_user
`;
}

/** Studio's `BASH_ENV`: the person's own (`STUDIO_USER_BASH_ENV`), then Studio's `cad` first. */
export function bashEnvFile(): string {
  return `# Studio: the person's own BASH_ENV, then Studio's cad first on PATH (apps/server/src/studio/studioAgentShell.ts).
if [ -n "\${STUDIO_USER_BASH_ENV-}" ] && [ -r "$STUDIO_USER_BASH_ENV" ]; then
  . "$STUDIO_USER_BASH_ENV"
fi
${CAD_FIRST}
`;
}

/**
 * What the agents' environment takes so their shells start through Studio's files in `dir`: `ZDOTDIR` and
 * `BASH_ENV` at them, the person's own kept as `STUDIO_USER_ZDOTDIR` / `STUDIO_USER_BASH_ENV` (never
 * Studio's own from an earlier start). Nothing outside Studio's app (`CAD_LAUNCHER_DIR` unset) or on Windows.
 */
export function agentShellEnvironment(
  env: NodeJS.ProcessEnv,
  dir: string,
  platform: NodeJS.Platform,
  join: (...parts: ReadonlyArray<string>) => string,
): Record<string, string> | null {
  if (platform === "win32" || !env.CAD_LAUNCHER_DIR?.trim()) return null;
  const bashEnv = join(dir, BASH_ENV_FILE);
  const patch: Record<string, string> = { ZDOTDIR: dir, BASH_ENV: bashEnv };
  const userZdotdir = env.ZDOTDIR === dir ? env.STUDIO_USER_ZDOTDIR : env.ZDOTDIR;
  if (userZdotdir?.trim()) patch.STUDIO_USER_ZDOTDIR = userZdotdir;
  const userBashEnv = env.BASH_ENV === bashEnv ? env.STUDIO_USER_BASH_ENV : env.BASH_ENV;
  if (userBashEnv?.trim()) patch.STUDIO_USER_BASH_ENV = userBashEnv;
  return patch;
}

/**
 * Studio's `cad` first on the server's `PATH` (which `fixPath` built from the login shell, its entries
 * first), and its shell startup files under `stateDir/shell`, which a profile that puts another `cad` first
 * cannot get past (Codex's command shell reads the person's `.zshenv` and `.zprofile`). A failed write
 * leaves the shells as they were.
 */
export const installStudioAgentShell = Effect.fn("Studio.installAgentShell")(function* (
  stateDir: string,
) {
  const env = yield* HostProcess.Environment;
  const platform = yield* HostProcess.Platform;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  keepStudioCadFirst(env, platform);
  const dir = path.join(stateDir, "shell");
  const patch = agentShellEnvironment(env, dir, platform, path.join);
  if (patch === null) return;
  const written = yield* Effect.gen(function* () {
    yield* fileSystem.makeDirectory(dir, { recursive: true });
    for (const file of ZSH_STARTUP_FILES) {
      yield* fileSystem.writeFileString(path.join(dir, file), zshStartupFile(file));
    }
    yield* fileSystem.writeFileString(path.join(dir, BASH_ENV_FILE), bashEnvFile());
    return true;
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning("Studio could not write its agents' shell files", error).pipe(
        Effect.as(false),
      ),
    ),
  );
  if (!written) return;
  if (patch.STUDIO_USER_ZDOTDIR === undefined) delete env.STUDIO_USER_ZDOTDIR;
  if (patch.STUDIO_USER_BASH_ENV === undefined) delete env.STUDIO_USER_BASH_ENV;
  Object.assign(env, patch);
});
