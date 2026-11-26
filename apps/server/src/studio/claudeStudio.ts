// How a Studio project's thread runs on Claude, called from `ClaudeAdapterV2.ts` with one line each.
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import * as PluginStore from "../plugins/PluginStore.ts";

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

/**
 * The plugins a turn's Claude process runs with: those enabled now. A process keeps the ones it was
 * opened with, so they are part of the key a live process is kept by, and a plugin turned on or off
 * replaces the thread's process at its next turn. One running background work keeps its own until
 * that is done, since replacing it would kill the work.
 */
export const turnPlugins = Effect.fn("ClaudeStudio.turnPlugins")(function* <
  Live extends {
    readonly plugins: ReadonlyArray<string>;
    readonly nativeThreadId: string;
    readonly stopping: boolean;
  },
  E,
  R,
>(
  pluginStore: Option.Option<PluginStore.PluginStore["Service"]>,
  nativeThreadId: string,
  live: Live | null,
  runsBackgroundWork: (live: Live) => Effect.Effect<boolean, E, R>,
) {
  const enabled = yield* PluginStore.claudePluginRoots(pluginStore);
  if (live === null || live.nativeThreadId !== nativeThreadId || live.stopping) return enabled;
  const same =
    enabled.length === live.plugins.length &&
    enabled.every((root, at) => root === live.plugins[at]);
  return same || !(yield* runsBackgroundWork(live)) ? enabled : live.plugins;
});
