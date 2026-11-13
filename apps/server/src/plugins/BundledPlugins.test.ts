// @effect-diagnostics nodeBuiltinImport:off -- fixtures are plugin folders on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as BundledPlugins from "./BundledPlugins.ts";
import * as PluginService from "./PluginService.ts";

function write(file: string, content: object) {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, JSON.stringify(content, null, 2));
}

/** A checkout shaped like text-to-cad: the repository is its own marketplace and plugin (`./`). */
function checkout() {
  const dir = NodeFS.realpathSync(
    NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-bundled-")),
  );
  const repo = NodePath.join(dir, "text-to-cad");
  write(NodePath.join(repo, ".claude-plugin", "marketplace.json"), {
    name: "earthtojake",
    plugins: [{ name: "text-to-cad", source: "./", description: "Design 3D models" }],
  });
  write(NodePath.join(repo, ".codex-plugin", "plugin.json"), {
    name: "text-to-cad",
    version: "1.0.0",
    skills: "./skills/",
  });
  NodeFS.mkdirSync(NodePath.join(repo, "skills", "cad"), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(repo, "skills", "cad", "SKILL.md"), "---\nname: cad\n---\n");
  return { dir, repo };
}

const layerThreads = Layer.mergeAll(
  Layer.succeed(
    ThreadManagementService.ThreadManagementService,
    ThreadManagementService.ThreadManagementService.of(
      {} as unknown as ThreadManagementService.ThreadManagementService["Service"],
    ),
  ),
  Layer.succeed(
    ProjectStore.ProjectStoreV2,
    ProjectStore.ProjectStoreV2.of({
      get: () => Effect.succeedNone,
    } as unknown as ProjectStore.ProjectStoreV2["Service"]),
  ),
);

const layerFor = (env: Record<string, string>, base: string) => {
  const config = ConfigProvider.layer(ConfigProvider.fromEnv({ env }));
  return PluginService.layer.pipe(
    Layer.provideMerge(BundledPlugins.storeLayer.pipe(Layer.provide(config))),
    Layer.provide(layerThreads),
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), base)),
    Layer.provideMerge(config),
  );
};

describe("bundled plugin updates", () => {
  it("updates a default whose folder changed since the last start, not one installed now", () => {
    assert.deepEqual(
      BundledPlugins.staleDefaults(
        { "m/a": "1", "m/b": "2", "m/c": "3", "m/d": "4" },
        { "m/a": "1", "m/b": "old", "m/c": "old" },
        new Set(["m/c"]),
      ),
      ["m/b", "m/d"],
    );
  });

  it("lists again a default that is on and whose server failed at its last start", () => {
    const plugin = (id: string, enabled: boolean, ...states: Array<string>) => ({
      id,
      enabled,
      servers: states.map((state) => ({ state })),
    });
    assert.deepEqual(
      BundledPlugins.failedDefaults(
        [
          plugin("text-to-cad", true, "error"),
          plugin("off", false, "error"),
          plugin("fine", true, "ready", "idle"),
          plugin("theirs", true, "error"),
        ],
        ["text-to-cad", "off", "fine"],
      ),
      ["text-to-cad"],
    );
  });
});

describe("bundled plugins", () => {
  it.layer(NodeServices.layer)((it) => {
    it.effect("installs a checkout's plugin once, and an uninstall sticks", () => {
      const { dir, repo } = checkout();
      const base = NodePath.join(dir, "home");
      const env = {
        T3CODE_PLUGIN_MARKETPLACE: repo,
        T3CODE_DEFAULT_PLUGINS: "text-to-cad, missing",
      };
      const listIds = Effect.gen(function* () {
        const plugins = yield* PluginService.PluginService;
        return (yield* plugins.list).plugins.map((plugin) => [plugin.id, plugin.enabled]);
      });
      return Effect.gen(function* () {
        assert.deepEqual(BundledPlugins.defaultPluginKeys([repo], ["text-to-cad"]), [
          "local-text-to-cad/text-to-cad",
        ]);

        // First start: installed and on.
        yield* Effect.gen(function* () {
          yield* BundledPlugins.offerDefaults;
          assert.deepEqual(yield* listIds, [["text-to-cad", true]]);
          // A plugin that failed to install is not recorded, so the next start tries again.
          assert.deepEqual(
            JSON.parse(
              NodeFS.readFileSync(
                NodePath.join(
                  (yield* ServerConfig.ServerConfig).stateDir,
                  "plugins",
                  "offered.json",
                ),
                "utf8",
              ),
            ),
            ["local-text-to-cad/text-to-cad"],
          );
          const plugins = yield* PluginService.PluginService;
          yield* plugins.uninstall("text-to-cad");
        }).pipe(Effect.provide(layerFor(env, base)));

        // Next start: the user's uninstall stands.
        yield* Effect.gen(function* () {
          yield* BundledPlugins.offerDefaults;
          assert.deepEqual(yield* listIds, []);
        }).pipe(Effect.provide(layerFor(env, base)));

        // Without the variables nothing is offered.
        yield* Effect.gen(function* () {
          yield* BundledPlugins.offerDefaults;
          assert.deepEqual(yield* listIds, []);
        }).pipe(Effect.provide(layerFor({}, NodePath.join(dir, "other-home"))));
      }).pipe(
        Effect.ensuring(Effect.sync(() => NodeFS.rmSync(dir, { recursive: true, force: true }))),
      );
    });

    it.effect("installs each default from the folder that lists it", () => {
      const { dir, repo } = checkout();
      // The app's own marketplace: a folder of plugins beside the checkout's.
      const own = NodePath.join(dir, "studio-plugins");
      write(NodePath.join(own, ".claude-plugin", "marketplace.json"), {
        name: "studio-plugins",
        plugins: [{ name: "solidcraft", source: "./solidcraft", description: "Edit parts" }],
      });
      write(NodePath.join(own, "solidcraft", ".codex-plugin", "plugin.json"), {
        name: "solidcraft",
        version: "1.0.0",
        skills: "./skills/",
      });
      const env = {
        T3CODE_PLUGIN_MARKETPLACE: [repo, own].join(NodePath.delimiter),
        T3CODE_DEFAULT_PLUGINS: "text-to-cad,solidcraft",
      };
      return Effect.gen(function* () {
        assert.deepEqual(BundledPlugins.defaultPluginKeys([repo, own], ["solidcraft"]), [
          "local-studio-plugins/solidcraft",
        ]);
        const home = NodePath.join(dir, "home");
        const installed = Effect.gen(function* () {
          yield* BundledPlugins.offerDefaults;
          const plugins = yield* PluginService.PluginService;
          return (yield* plugins.list).plugins
            .map((plugin) => [plugin.id, plugin.enabled])
            .toSorted();
        });
        assert.deepEqual(yield* installed.pipe(Effect.provide(layerFor(env, home))), [
          ["solidcraft", true],
          ["text-to-cad", true],
        ]);
        // A start that no longer names it removes it; naming it again offers it again.
        const without = { ...env, T3CODE_DEFAULT_PLUGINS: "text-to-cad" };
        assert.deepEqual(yield* installed.pipe(Effect.provide(layerFor(without, home))), [
          ["text-to-cad", true],
        ]);
        assert.deepEqual(yield* installed.pipe(Effect.provide(layerFor(env, home))), [
          ["solidcraft", true],
          ["text-to-cad", true],
        ]);
      }).pipe(
        Effect.ensuring(Effect.sync(() => NodeFS.rmSync(dir, { recursive: true, force: true }))),
      );
    });
  });
});
