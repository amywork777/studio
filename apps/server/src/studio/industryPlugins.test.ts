// @effect-diagnostics nodeBuiltinImport:off -- copies studio-plugins/ to a scratch folder on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";

import * as ClaudeAdapterV2 from "../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import * as PluginService from "../plugins/PluginService.ts";
import { layerFor } from "../plugins/PluginService.testFixtures.ts";
import * as PluginStore from "../plugins/PluginStore.ts";
import * as ClaudeStudio from "./claudeStudio.ts";
import * as CodexStudio from "./codexStudio.ts";

const OWN = NodePath.join(import.meta.dirname, "..", "..", "..", "..", "studio-plugins");
const INDUSTRIES = ["apparel", "footwear", "jewelry", "packaging", "woodworking"];

/** Studio's plugins as the launcher lays them out (`scripts/studio.ts`): a folder of that name. */
function launched() {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "studio-industries-"));
  const market = NodePath.join(dir, "studio-plugins");
  NodeFS.cpSync(OWN, market, { recursive: true });
  return { dir, market };
}

// The Toolbox page finds the industries by one search of the catalog and installs each by its key
// in Studio's own catalog (`apps/web/src/components/workbench/industries.ts`).
describe("Studio's industry plugins in the catalog", () => {
  it.layer(NodeServices.layer)((it) => {
    it.effect("are found by their category and install with their skill, turned on", () => {
      const files = launched();
      return Effect.gen(function* () {
        const plugins = yield* PluginService.PluginService;
        const found = yield* plugins.catalog({ query: "industry" });
        assert.deepEqual(
          found.entries
            .filter((entry) =>
              entry.marketplaces.some((each) => each.id === "local-studio-plugins"),
            )
            .map((entry) => entry.name)
            .toSorted(),
          INDUSTRIES,
        );
        const installed = yield* plugins.install("local-studio-plugins/woodworking");
        assert.deepEqual(
          [installed.id, installed.skills, installed.enabled],
          ["woodworking", ["woodworking"], true],
        );
      }).pipe(
        Effect.provide(
          layerFor(
            [{ type: "folder", path: files.market }],
            NodePath.join(files.dir, "t3"),
            NodePath.join(files.dir, "work"),
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => NodeFS.rmSync(files.dir, { recursive: true, force: true })),
        ),
      );
    });

    // The switch on the Toolbox page says the agent gets the skill: it does at the chat's next
    // turn, with Studio and the agent's process left running.
    it.effect("reach an open chat's agent when turned on, and leave it when turned off", () => {
      const files = launched();
      return Effect.gen(function* () {
        const plugins = yield* PluginService.PluginService;
        const pluginStore = yield* PluginStore.PluginStore;
        const store = Option.some(pluginStore);

        // Codex: one app-server started with a chat open, one not started yet.
        const sets = yield* Queue.unbounded<ReadonlyArray<string>>();
        const codex = yield* CodexStudio.pluginSkills(store, (roots) => Queue.offer(sets, roots));
        yield* codex.load;
        yield* codex.follow(Effect.succeed(true));
        const unstartedSets = yield* Queue.unbounded<ReadonlyArray<string>>();
        const unstarted = yield* CodexStudio.pluginSkills(store, (roots) =>
          Queue.offer(unstartedSets, roots),
        );
        yield* unstarted.follow(Effect.succeed(false));
        // Both are listening before anything changes, as an app-server is long before a switch.
        yield* Effect.yieldNow.pipe(Effect.repeat({ times: 10 }));
        // Claude: a chat's live process, opened with what was on (nothing).
        const idle = () => Effect.succeed(false);
        const live = {
          plugins: yield* ClaudeStudio.turnPlugins(store, "native-thread", null, idle),
          nativeThreadId: "native-thread",
          stopping: false,
        };
        assert.deepEqual(live.plugins, []);
        const keyFor = (roots: ReadonlyArray<string>) =>
          ClaudeAdapterV2.claudeEffectiveQueryPolicyKey(
            ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy({
              runtimeMode: "full-access",
              interactionMode: "default",
              cwd: "/workspace",
            }),
            {},
            {},
            roots,
          );

        const installed = yield* plugins.install("local-studio-plugins/woodworking");
        const root = (yield* pluginStore.enabledPlugins).find(
          (plugin) => plugin.id === installed.id,
        )?.root;
        assert.isDefined(root);

        // Codex is given the pack's skills folder, which it reads at the thread's next turn.
        const skills = NodePath.join(root!, "skills");
        assert.isTrue(NodeFS.existsSync(NodePath.join(skills, "woodworking", "SKILL.md")));
        assert.deepEqual(yield* Queue.take(sets), [skills]);
        // One not started yet is given nothing until it starts, then what is on by then.
        assert.strictEqual(yield* Queue.size(unstartedSets), 0);
        yield* unstarted.load;
        assert.deepEqual(yield* Queue.take(unstartedSets), [skills]);

        // Claude's next turn runs with the pack, on a process opened anew for it.
        const next = yield* ClaudeStudio.turnPlugins(store, "native-thread", live, idle);
        assert.deepEqual(next, [root]);
        assert.notEqual(keyFor(next), keyFor(live.plugins));
        assert.deepEqual(
          PluginStore.withClaudePlugins(next, {} as { readonly plugins?: ReadonlyArray<unknown> })
            .plugins,
          [{ type: "local", path: root, skipMcpDiscovery: true }],
        );
        // A process running background work is kept as it is, and so are its plugins.
        const busy = yield* ClaudeStudio.turnPlugins(store, "native-thread", live, () =>
          Effect.succeed(true),
        );
        assert.deepEqual(busy, live.plugins);
        assert.strictEqual(keyFor(busy), keyFor(live.plugins));

        // Turned off, it leaves both: Codex is given no folders, Claude's next process no plugin.
        yield* plugins.setEnabled(installed.id, false);
        assert.deepEqual(yield* Queue.take(sets), []);
        assert.strictEqual(yield* Queue.size(sets), 0);
        const on = { ...live, plugins: next };
        assert.deepEqual(yield* ClaudeStudio.turnPlugins(store, "native-thread", on, idle), []);
      }).pipe(
        Effect.scoped,
        Effect.provide(
          layerFor(
            [{ type: "folder", path: files.market }],
            NodePath.join(files.dir, "t3"),
            NodePath.join(files.dir, "work"),
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => NodeFS.rmSync(files.dir, { recursive: true, force: true })),
        ),
      );
    });
  });
});
