// How a Studio project's thread runs on Claude, called from `ClaudeAdapterV2.ts` with one line each.
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

/** The thread's Studio project, as `makeClaudeQueryOptions` takes it: its other folders and context. */
export const projectQueryInput = (
  runtimePolicy: ProviderAdapter.ProviderAdapterV2RuntimePolicy,
) => ({
  ...(runtimePolicy.additionalDirectories === undefined
    ? {}
    : { additionalDirectories: runtimePolicy.additionalDirectories }),
  ...(runtimePolicy.projectContext === undefined
    ? {}
    : { projectContext: runtimePolicy.projectContext }),
});

/**
 * A Studio project's thread leaves out the person's own Claude settings (their plugins, MCP servers
 * and CLAUDE.md in ~/.claude), as its Codex thread does; Studio's plugins come through the `plugins`
 * option (`PluginStore.withClaudePlugins`), not from there.
 */
export const projectSettingSources = (projectContext: string | undefined) =>
  projectContext === undefined ? {} : { settingSources: ["project" as const, "local" as const] };

/**
 * A fork that names itself (Studio, by VITE_APP_BASE_NAME) keeps the conversation whole without
 * asking when Claude offers to compact on return: the agent's token bookkeeping is not the person's
 * question.
 */
export const continuesWithoutAsking = Config.String("VITE_APP_BASE_NAME").pipe(
  Config.withDefault(""),
  Effect.map((forkName) => forkName.trim() !== ""),
  Effect.orElseSucceed(() => false),
);
