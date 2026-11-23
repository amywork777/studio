// @effect-diagnostics nodeBuiltinImport:off - reads the drivers' sources and a temporary state folder.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { mergeProviderInstanceEnvironment } from "@t3tools/provider-core/server/instanceEnvironment";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";

import { BUILT_IN_DRIVERS } from "../provider/builtInDrivers.ts";
import { installStudioAgentShell } from "./studioAgentShell.ts";

const REPO = NodePath.resolve(import.meta.dirname, "..", "..", "..", "..");

/**
 * Where each built-in driver builds its processes' environment, audited: every one inherits the server's
 * (`HostProcess.Environment`, the live `process.env`), merged through `mergeProviderInstanceEnvironment` or
 * by spawning without an env of its own. So Studio's agent shell, installed into the server's environment
 * at startup, reaches all of them. A new driver fails here until someone checks its spawns and adds it.
 */
const DRIVER_SOURCES: Readonly<Record<string, ReadonlyArray<string>>> = {
  codex: [
    "apps/server/src/provider/Drivers/CodexDriver.ts",
    "apps/server/src/provider/Drivers/CodexManagedProvider.ts",
    "apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts",
  ],
  claudeAgent: [
    "apps/server/src/provider/Drivers/ClaudeDriver.ts",
    "apps/server/src/provider/Drivers/ClaudeHome.ts",
    "apps/server/src/provider/Drivers/ClaudeExecutable.ts",
  ],
  cursor: ["packages/provider-cursor/src/server"],
  grok: ["packages/provider-grok/src/server"],
  fx: ["packages/provider-fx/src/server"],
  opencode: ["packages/provider-opencode/src/server"],
  antigravity: ["apps/server/src/provider/Drivers/AntigravityDriver.ts"],
  kiro: ["packages/provider-kiro/src/server"],
  pi: ["packages/provider-pi/src/server"],
  muse: ["packages/provider-muse/src/server"],
  acpRegistry: ["packages/provider-acp-registry/src/server", "packages/provider-acp/src/server"],
};

/** What would give a provider's processes an environment that is not the server's. */
const BYPASSES = [/\benv:\s*\{\s*\}/, /readEnvironmentFromLoginShell/, /\bprocess\.env\s*=/];
// `extendEnv: false` passes only an env given whole: allowed where the driver takes it from the server's
// (`mergeProviderInstanceEnvironment`, as Antigravity's and Pi's spawns do), a bypass anywhere else.
const WHOLE_ENV = /extendEnv:\s*false/;
const FROM_SERVER = /mergeProviderInstanceEnvironment\(/;

const sourcesOf = (entry: string): ReadonlyArray<string> => {
  const full = NodePath.join(REPO, entry);
  if (!NodeFS.statSync(full).isDirectory()) return [full];
  return NodeFS.readdirSync(full, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(ts|tsx|js|mjs)$/.test(file) && !/\.test\.|\.browser\./.test(file))
    .map((file) => NodePath.join(full, file));
};

describe("every provider's agents get Studio's cad first", () => {
  it("knows how each built-in driver builds its processes' environment", () => {
    const kinds = BUILT_IN_DRIVERS.map((driver) => String(driver.driverKind)).toSorted();
    expect(kinds, "audit a new driver's spawn environment, then add it to DRIVER_SOURCES").toEqual(
      Object.keys(DRIVER_SOURCES).toSorted(),
    );
  });

  it("finds no driver that gives its processes an environment apart from the server's", () => {
    const found = Object.entries(DRIVER_SOURCES).flatMap(([kind, entries]) => {
      const texts = entries
        .flatMap(sourcesOf)
        .map((file) => [file, NodeFS.readFileSync(file, "utf8")] as const);
      const fromServer = texts.some(([, text]) => FROM_SERVER.test(text));
      return texts.flatMap(([file, text]) =>
        [...BYPASSES, ...(fromServer ? [] : [WHOLE_ENV])]
          .filter((pattern) => pattern.test(text))
          .map((pattern) => `${kind}: ${NodePath.relative(REPO, file)} matches ${pattern}`),
      );
    });
    expect(found).toEqual([]);
  });

  it.effect(
    "puts the server's environment, which every provider merges, on Studio's cad and shell files",
    () =>
      Effect.gen(function* () {
        const state = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "studio-agent-state-"));
        const env: NodeJS.ProcessEnv = {
          HOME: "/Users/a",
          PATH: "/Users/a/.local/bin:/usr/bin:/s/bin:/bin",
          CAD_LAUNCHER_DIR: "/s/bin",
          ZDOTDIR: "/Users/a/.config/zsh",
        };
        yield* installStudioAgentShell(state).pipe(
          Effect.provideService(HostProcess.Environment, env),
          Effect.provideService(HostProcess.Platform, "darwin"),
        );
        const merged = yield* mergeProviderInstanceEnvironment(
          [{ name: "SOME_PROVIDER_KEY", value: "x", sensitive: false }],
          env,
        );
        const shell = NodePath.join(state, "shell");
        expect([
          merged.PATH,
          merged.ZDOTDIR,
          merged.BASH_ENV,
          merged.STUDIO_USER_ZDOTDIR,
          NodeFS.readdirSync(shell).toSorted(),
        ]).toEqual([
          "/s/bin:/Users/a/.local/bin:/usr/bin:/bin",
          shell,
          NodePath.join(shell, "bash_env"),
          "/Users/a/.config/zsh",
          [".zlogin", ".zprofile", ".zshenv", ".zshrc", "bash_env"],
        ]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
