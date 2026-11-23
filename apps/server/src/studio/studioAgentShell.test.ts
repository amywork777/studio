// @effect-diagnostics nodeBuiltinImport:off - runs Studio's shell files in a real zsh and bash.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  BASH_ENV_FILE,
  ZSH_STARTUP_FILES,
  agentShellEnvironment,
  bashEnvFile,
  zshStartupFile,
} from "./studioAgentShell.ts";

const has = (shell: string) => {
  try {
    NodeChildProcess.execFileSync(shell, ["-c", "true"]);
    return true;
  } catch {
    return false;
  }
};

/** A person whose profile puts their own `cad` first, and Studio's files beside them. */
function setup() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "studio-agent-shell-"));
  const home = NodePath.join(root, "home");
  const mine = NodePath.join(home, ".local", "bin");
  const studio = NodePath.join(root, "studio", "bin");
  const shim = NodePath.join(root, "studio", "shell");
  for (const dir of [mine, studio, shim]) NodeFS.mkdirSync(dir, { recursive: true });
  for (const [dir, version] of [
    [mine, "0.11.15"],
    [studio, "0.11.16"],
  ] as const) {
    NodeFS.writeFileSync(NodePath.join(dir, "cad"), `#!/bin/sh\necho cad ${version}\n`, {
      mode: 0o755,
    });
  }
  const prepend = 'export PATH="$HOME/.local/bin:$PATH"\n';
  for (const file of [".zshenv", ".zprofile", ".zshrc", ".bashenv"]) {
    NodeFS.writeFileSync(NodePath.join(home, file), `${prepend}export SAW_${file.slice(1)}=1\n`);
  }
  for (const file of ZSH_STARTUP_FILES) {
    NodeFS.writeFileSync(NodePath.join(shim, file), zshStartupFile(file));
  }
  NodeFS.writeFileSync(NodePath.join(shim, BASH_ENV_FILE), bashEnvFile());
  const env = {
    HOME: home,
    PATH: `${studio}:/usr/bin:/bin`,
    CAD_LAUNCHER_DIR: studio,
    ZDOTDIR: shim,
    BASH_ENV: NodePath.join(shim, BASH_ENV_FILE),
    STUDIO_USER_BASH_ENV: NodePath.join(home, ".bashenv"),
  };
  const run = (shell: string, args: ReadonlyArray<string>, extra: Record<string, string> = {}) =>
    NodeChildProcess.execFileSync(shell, [...args], {
      env: { ...env, ...extra },
      encoding: "utf8",
      // A socket on stdin makes bash read ~/.bashrc as a remote shell's instead of BASH_ENV.
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  return { root, home, studio, shim, env, run };
}

// Shells this machine lacks (a Windows runner) have nothing to check.
const HAS_ZSH = has("zsh");
const HAS_BASH = has("bash");

describe("Studio's agent shell", () => {
  it("gives zsh Studio's cad after the person's .zshenv, .zprofile and .zshrc put theirs first", () => {
    if (!HAS_ZSH) return;
    const { run, studio } = setup();
    const ask =
      "command -v cad; cad; printf %s \"$PATH\" | tr : '\\n' | grep -c -x -F " +
      JSON.stringify(studio);
    for (const args of [["-c"], ["-lc"], ["-ic"], ["-lic"]]) {
      expect(
        run("zsh", [...args, ask])
          .split("\n")
          .slice(-3),
      ).toEqual([`${studio}/cad`, "cad 0.11.16", "1"]);
    }
    // The person's own files still ran.
    expect(run("zsh", ["-lic", "echo $SAW_zshenv$SAW_zprofile$SAW_zshrc"]).split("\n").at(-1)).toBe(
      "111",
    );
  });

  it("reads the person's own ZDOTDIR, and one their .zshenv moves to, not $HOME's", () => {
    if (!HAS_ZSH) return;
    const { run, home, root } = setup();
    const theirs = NodePath.join(root, "theirs");
    const config = NodePath.join(home, ".config", "zsh");
    NodeFS.mkdirSync(theirs, { recursive: true });
    NodeFS.mkdirSync(config, { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(theirs, ".zshenv"),
      `export FROM=theirs\nZDOTDIR=${config}\n`,
    );
    NodeFS.writeFileSync(NodePath.join(config, ".zprofile"), "export LATER=config\n");
    expect(
      run("zsh", ["-lc", "echo $FROM $LATER ${SAW_zshenv:-no}"], { STUDIO_USER_ZDOTDIR: theirs }),
    ).toBe("theirs config no");
  });

  it("gives a non-interactive bash Studio's cad after the person's own BASH_ENV", () => {
    if (!HAS_BASH) return;
    const { run, studio } = setup();
    expect(run("bash", ["-c", "command -v cad; cad; echo $SAW_bashenv"]).split("\n")).toEqual([
      `${studio}/cad`,
      "cad 0.11.16",
      "1",
    ]);
  });
});

describe("the agents' shell environment", () => {
  const join = (...parts: ReadonlyArray<string>) => parts.join("/");

  it("points zsh and bash at Studio's files and keeps the person's own", () => {
    expect(
      agentShellEnvironment(
        { CAD_LAUNCHER_DIR: "/s/bin", ZDOTDIR: "/me/zsh", BASH_ENV: "/me/env" },
        "/s/shell",
        "darwin",
        join,
      ),
    ).toEqual({
      ZDOTDIR: "/s/shell",
      BASH_ENV: "/s/shell/bash_env",
      STUDIO_USER_ZDOTDIR: "/me/zsh",
      STUDIO_USER_BASH_ENV: "/me/env",
    });
  });

  it("never keeps Studio's own files as the person's on a second start, and does nothing outside the app or on Windows", () => {
    const again = {
      CAD_LAUNCHER_DIR: "/s/bin",
      ZDOTDIR: "/s/shell",
      BASH_ENV: "/s/shell/bash_env",
      STUDIO_USER_ZDOTDIR: "/me/zsh",
    };
    expect(agentShellEnvironment(again, "/s/shell", "linux", join)).toEqual({
      ZDOTDIR: "/s/shell",
      BASH_ENV: "/s/shell/bash_env",
      STUDIO_USER_ZDOTDIR: "/me/zsh",
    });
    expect(agentShellEnvironment({ ZDOTDIR: "/me" }, "/s/shell", "darwin", join)).toBeNull();
    expect(
      agentShellEnvironment({ CAD_LAUNCHER_DIR: "C:\\s" }, "C:\\shell", "win32", join),
    ).toBeNull();
  });
});
