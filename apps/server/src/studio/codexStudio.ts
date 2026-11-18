// How a Studio project's thread runs on Codex, called from `CodexAdapterV2.ts` with one line each.
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import type * as CodexSchema from "effect-codex-app-server/schema";
import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import * as PluginStore from "../plugins/PluginStore.ts";

type RuntimePolicy = ProviderAdapter.ProviderAdapterV2RuntimePolicy;

/**
 * A workspace-write sandbox also lets the agent write the thread's other
 * Studio project folders. Read-only and full-access sandboxes are left alone:
 * one writes nowhere, the other everywhere.
 */
export function withWritableRoots(
  sandboxPolicy: CodexSchema.V2TurnStartParams__SandboxPolicy | null,
  roots: ReadonlyArray<string> | undefined,
): CodexSchema.V2TurnStartParams__SandboxPolicy | null {
  if (sandboxPolicy?.type !== "workspaceWrite" || roots === undefined || roots.length === 0) {
    return sandboxPolicy;
  }
  return { ...sandboxPolicy, writableRoots: [...(sandboxPolicy.writableRoots ?? []), ...roots] };
}

/** The Studio project's context, as a turn's additional context; it goes in with or without T3's MCP server. */
export function projectAdditionalContext(runtimePolicy: RuntimePolicy) {
  return runtimePolicy.projectContext === undefined
    ? undefined
    : {
        t3_code_project: {
          kind: "application" as const,
          value: runtimePolicy.projectContext,
        },
      };
}

/**
 * A Studio project's thread works only with Studio's tools: the person's own
 * Codex plugins and apps are off, and so is each MCP server in their Codex
 * config (`personalMcpServers`, from `config/read`). The thread's config only
 * adds to theirs, so each is switched off by name.
 */
const CODEX_STUDIO_THREAD_CONFIG = {
  "features.plugins": false,
  "features.apps": false,
} as const;

/** What a thread's config adds in a Studio project; `ownServers` are T3's, which stay on. */
export function studioThreadConfig(
  runtimePolicy: RuntimePolicy | undefined,
  personalMcpServers: ReadonlyArray<string> | undefined,
  ownServers: ReadonlyArray<string>,
) {
  if (runtimePolicy?.projectContext === undefined) return {};
  return {
    ...CODEX_STUDIO_THREAD_CONFIG,
    // Leaf keys, so each of the person's own servers keeps its config and is only switched off.
    ...Object.fromEntries(
      (personalMcpServers ?? [])
        .filter((name) => !ownServers.includes(name))
        .map((name) => [`mcp_servers.${name}.enabled`, false]),
    ),
  };
}

/** The MCP servers a Codex `config/read` names, from its effective config. */
export function codexConfigMcpServers(config: unknown): ReadonlyArray<string> {
  if (typeof config !== "object" || config === null) return [];
  const servers = (config as { readonly mcp_servers?: unknown }).mcp_servers;
  return typeof servers === "object" && servers !== null ? Object.keys(servers) : [];
}

/**
 * A Studio project's threads start without the person's own Codex MCP servers
 * (`studioThreadConfig`), named from the effective config, read once for this
 * app-server. A config that cannot be read turns none off.
 */
export const personalMcpServersFor = Effect.fn("CodexStudio.personalMcpServersFor")(function* <E>(
  readConfig: Effect.Effect<{ readonly config: unknown }, E>,
) {
  const personalMcpServers = yield* Effect.cached(
    readConfig.pipe(
      Effect.map((response) => codexConfigMcpServers(response.config)),
      Effect.orElseSucceed((): ReadonlyArray<string> => []),
    ),
  );
  return (runtimePolicy: RuntimePolicy | undefined) =>
    runtimePolicy?.projectContext === undefined
      ? Effect.succeed<ReadonlyArray<string>>([])
      : personalMcpServers;
});

/** Points a freshly started Codex app-server at the enabled plugins' skills; a failure leaves them out. */
export const loadPluginSkills = Effect.fn("CodexStudio.loadPluginSkills")(function* <E>(
  pluginStore: Option.Option<PluginStore.PluginStore["Service"]>,
  setExtraRoots: (extraRoots: Array<string>) => Effect.Effect<unknown, E>,
) {
  const roots = yield* PluginStore.codexSkillRoots(pluginStore);
  if (roots.length > 0) yield* setExtraRoots([...roots]).pipe(Effect.ignore);
});
