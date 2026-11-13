/**
 * Codex ignores `notifications/tools/list_changed`, so a provider can keep a stale tool list for its
 * whole session. When the plugin tools agents see change, every live provider session is released
 * once idle (`releaseWhenIdle`) and its thread's next turn resumes with the current tools.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ProviderSessionManager from "../orchestration-v2/ProviderSessionManager.ts";
import * as PluginService from "./PluginService.ts";

/** What an agent sees of the tools: each one's name and definition, as `tools.ts` registers it. */
export const toolsSignature = (tools: ReadonlyArray<PluginService.AgentTool>) =>
  JSON.stringify(
    tools
      .map((tool) => {
        const { _meta: _ignored, ...definition } = tool.tool;
        return [tool.name, definition] as const;
      })
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const plugins = yield* PluginService.PluginService;
    const sessions = yield* ProviderSessionManager.ProviderSessionManagerV2;
    const signature = plugins.agentTools.pipe(Effect.map(toolsSignature));
    let seen = yield* signature;
    yield* plugins.changes.pipe(
      Stream.runForEach(() =>
        Effect.gen(function* () {
          const now = yield* signature;
          if (now === seen) return;
          seen = now;
          yield* sessions.releaseWhenIdle;
        }),
      ),
      Effect.forkScoped,
    );
  }),
);
