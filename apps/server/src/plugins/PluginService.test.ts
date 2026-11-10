// @effect-diagnostics nodeBuiltinImport:off -- fixtures are plugin folders and git repositories on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as PluginService from "./PluginService.ts";
import { draftThreadId, fixture, git, layerFor, threadId } from "./PluginService.testFixtures.ts";
import * as PluginStore from "./PluginStore.ts";

describe("plugins", () => {
  it.layer(NodeServices.layer)((it) => {
    it.effect(
      "installs from a folder marketplace, lists views, opens one, and hides app-only tools from agents",
      () => {
        const files = fixture();
        return Effect.gen(function* () {
          const plugins = yield* PluginService.PluginService;
          const store = yield* PluginStore.PluginStore;

          const catalog = yield* plugins.catalog({ query: "" });
          assert.deepEqual(
            catalog.entries.map((entry) => [entry.key, entry.compatibility.level]),
            [["local-market/demo", "works"]],
          );
          assert.strictEqual(catalog.catalogs[0]?.state, "ready");

          const installed = yield* plugins.install("local-market/demo");
          assert.strictEqual(installed.id, "demo");
          assert.deepEqual(installed.skills, ["parts"]);
          assert.deepEqual(installed.skillDetails, [
            { name: "parts", displayName: null, description: "", defaultPrompt: null },
          ]);
          assert.deepEqual(installed.servers, [
            { name: "main", transport: "stdio", state: "ready", error: null },
          ]);
          assert.deepEqual(
            installed.views.map((view) => [view.tool, view.entrypoints]),
            [
              ["show", [{ type: "file", extensions: ["step"] }]],
              ["sync", [{ type: "thread" }]],
            ],
          );
          const after = yield* plugins.catalog({ query: "demo" });
          assert.strictEqual(after.entries[0]?.installedId, "demo");

          // The environment scope's view: the tool's result and its UI resource.
          const document = yield* plugins.openView({
            threadId: null,
            pluginId: "demo",
            server: "main",
            tool: "show",
            arguments: { part: 1 },
          });
          assert.strictEqual(document.html, "<p>demo view</p>");
          assert.deepEqual(document.csp, { connectDomains: ["https://api.example.com"] });
          assert.deepEqual(document.toolInput, { part: 1 });

          // A file opens against the thread's workspace, never outside it.
          const file = yield* plugins.openView({
            threadId,
            pluginId: "demo",
            server: "main",
            tool: "show",
            arguments: {},
            file: "parts/bracket.step",
          });
          const absolute = NodePath.join(files.work, "parts", "bracket.step");
          assert.deepEqual(file.toolInput, {
            file: { name: "bracket.step", resourceUri: `file://${absolute}` },
          });
          const echoed = JSON.parse(
            (file.toolResult as { content: Array<{ text: string }> }).content[0]!.text,
          );
          assert.deepEqual(echoed.meta, { "openai/resource": { path: absolute } });
          const outside = yield* plugins
            .openView({
              threadId,
              pluginId: "demo",
              server: "main",
              tool: "show",
              arguments: {},
              file: "../market/demo/server.mjs",
            })
            .pipe(Effect.flip);
          assert.strictEqual(outside.reason, "request_failed");

          // A view opened in a new thread, which the server has no record of yet, names its
          // file by its absolute path: it works in the project that holds it, and its requests
          // after go on working there. One named any other way is refused.
          const drafted = yield* plugins.openView({
            threadId: draftThreadId,
            pluginId: "demo",
            server: "main",
            tool: "show",
            arguments: {},
            file: absolute,
          });
          assert.deepEqual(drafted.toolInput, file.toolInput);
          const draftSync = yield* plugins.request({
            threadId: draftThreadId,
            pluginId: "demo",
            server: "main",
            method: "tools/call",
            params: { name: "sync", arguments: {} },
          });
          assert.include(JSON.stringify(draftSync.result), "sync");
          const gone = yield* plugins
            .openView({
              threadId: ThreadId.make("thread-draft-unnamed"),
              pluginId: "demo",
              server: "main",
              tool: "show",
              arguments: {},
              file: "parts/bracket.step",
            })
            .pipe(Effect.flip);
          assert.strictEqual(gone.reason, "thread_not_found");
          // One that opens no file (a model by its document id) names its project's folder instead.
          const byFolder = yield* plugins.openView({
            threadId: ThreadId.make("thread-draft-document"),
            pluginId: "demo",
            server: "main",
            tool: "show",
            arguments: { part: 1 },
            workspace: files.work,
          });
          assert.deepEqual(byFolder.toolInput, { part: 1 });
          const noProject = yield* plugins
            .openView({
              threadId: ThreadId.make("thread-draft-elsewhere"),
              pluginId: "demo",
              server: "main",
              tool: "show",
              arguments: {},
              workspace: NodePath.join(files.work, "parts"),
            })
            .pipe(Effect.flip);
          assert.strictEqual(noProject.reason, "thread_not_found");

          // A view's own request may call an app-only tool.
          const sync = yield* plugins.request({
            threadId,
            pluginId: "demo",
            server: "main",
            method: "tools/call",
            params: { name: "sync", arguments: {} },
          });
          assert.include(JSON.stringify(sync.result), "sync");

          // Agents see every tool but the app-only one, namespaced by plugin.
          const agentTools = yield* plugins.agentTools;
          assert.deepEqual(
            agentTools.map((tool) => tool.name),
            ["demo__show", "demo__plain"],
          );
          const called = (yield* plugins.callAgentTool({
            threadId,
            name: "demo__plain",
            arguments: { text: "hi" },
          })) as { content: Array<{ text: string }> };
          assert.deepEqual(JSON.parse(called.content[0]!.text).arguments, { text: "hi" });
          const refused = yield* plugins
            .callAgentTool({ threadId, name: "demo__sync", arguments: {} })
            .pipe(Effect.result);
          assert.isTrue(refused._tag === "Failure" && refused.failure.reason === "not_found");

          // Providers load the plugin's skills from its folder.
          const enabled = yield* store.enabledPlugins;
          assert.deepEqual(
            enabled.map((plugin) => plugin.skillsDir),
            [NodePath.join(files.market, "demo", "skills")],
          );

          const off = yield* plugins.setEnabled("demo", false);
          assert.deepEqual([off.enabled, off.views, off.servers[0]?.state], [false, [], "idle"]);
          assert.deepEqual(yield* plugins.agentTools, []);
          const on = yield* plugins.setEnabled("demo", true);
          assert.strictEqual(on.views.length, 2);

          yield* plugins.uninstall("demo");
          assert.deepEqual((yield* plugins.list).plugins, []);
        }).pipe(
          Effect.provide(
            layerFor(
              [{ type: "folder", path: files.market }],
              NodePath.join(files.dir, "t3"),
              files.work,
            ),
          ),
          Effect.ensuring(
            Effect.sync(() => NodeFS.rmSync(files.dir, { recursive: true, force: true })),
          ),
        );
      },
    );

    it.effect("reports a server that fails to start only while it is failing", () => {
      const files = fixture();
      return Effect.gen(function* () {
        const plugins = yield* PluginService.PluginService;
        yield* plugins.install("local-market/demo");
        yield* plugins.setEnabled("demo", false);
        NodeFS.writeFileSync(NodePath.join(files.market, "demo", "server.mjs"), "process.exit(1);");
        const failing = yield* plugins.setEnabled("demo", true);
        assert.strictEqual(failing.servers[0]?.state, "error");
        assert.isNotNull(failing.error);
        assert.strictEqual(failing.error, failing.servers[0]?.error);
        // Its view says why the server did not start, not that the view is missing.
        const unopened = yield* plugins
          .openView({
            threadId: null,
            pluginId: "demo",
            server: "main",
            tool: "show",
            arguments: {},
          })
          .pipe(Effect.flip);
        assert.strictEqual(unopened.reason, "server_failed");
        assert.include(unopened.message, "did not start");
        // Turned off, it is no longer failing: its last start's error is not reported.
        const off = yield* plugins.setEnabled("demo", false);
        assert.deepEqual([off.servers[0]?.state, off.error], ["idle", null]);
      }).pipe(
        Effect.provide(
          layerFor(
            [{ type: "folder", path: files.market }],
            NodePath.join(files.dir, "t3"),
            files.work,
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => NodeFS.rmSync(files.dir, { recursive: true, force: true })),
        ),
      );
    });

    it.effect("says a call that ran past the server's tool timeout timed out", () => {
      const files = fixture();
      NodeFS.writeFileSync(
        NodePath.join(files.market, "demo", ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            main: {
              command: process.execPath,
              args: ["${PLUGIN_ROOT}/server.mjs"],
              tool_timeout_sec: 1,
            },
          },
        }),
      );
      return Effect.gen(function* () {
        const plugins = yield* PluginService.PluginService;
        yield* plugins.install("local-market/demo");
        const late = yield* plugins
          .request({
            threadId,
            pluginId: "demo",
            server: "main",
            method: "tools/call",
            params: { name: "wait", arguments: {} },
          })
          .pipe(Effect.flip);
        assert.deepEqual(
          [late.reason, late.message],
          ["timed_out", "The plugin did not answer in 1 second."],
        );
      }).pipe(
        Effect.provide(
          layerFor(
            [{ type: "folder", path: files.market }],
            NodePath.join(files.dir, "t3"),
            files.work,
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => NodeFS.rmSync(files.dir, { recursive: true, force: true })),
        ),
      );
    });

    it.effect("lists a failed server again on its own once it works, with no one asking", () => {
      const files = fixture();
      const server = NodePath.join(files.market, "demo", "server.mjs");
      const working = NodeFS.readFileSync(server, "utf8");
      return Effect.gen(function* () {
        const plugins = yield* PluginService.PluginService;
        yield* plugins.install("local-market/demo");
        yield* plugins.setEnabled("demo", false);
        NodeFS.writeFileSync(server, "process.exit(1);");
        const failing = yield* plugins.setEnabled("demo", true);
        assert.strictEqual(failing.servers[0]?.state, "error");
        assert.deepEqual(yield* plugins.agentTools, []);
        // The server is fixed outside Studio (its runtime finished installing, say).
        NodeFS.writeFileSync(server, working);
        const listed = yield* plugins.changes.pipe(
          Stream.mapEffect(() => plugins.list),
          Stream.filter(({ plugins: [demo] }) => demo?.servers[0]?.state === "ready"),
          Stream.runHead,
          Effect.forkScoped,
        );
        yield* Effect.yieldNow;
        // Seen failing at the next check, then retried once its first wait is over.
        yield* TestClock.adjust("1 minute");
        yield* Fiber.join(listed);
        assert.deepEqual(
          (yield* plugins.agentTools).map((tool) => tool.name),
          ["demo__show", "demo__plain"],
        );
      }).pipe(
        Effect.provide(
          layerFor(
            [{ type: "folder", path: files.market }],
            NodePath.join(files.dir, "t3"),
            files.work,
          ),
        ),
        Effect.scoped,
        Effect.ensuring(
          Effect.sync(() => NodeFS.rmSync(files.dir, { recursive: true, force: true })),
        ),
      );
    });

    it.effect(
      "installs from a git marketplace into its own cache at the marketplace's commit",
      () => {
        const files = fixture();
        const base = NodePath.join(files.dir, "t3");
        return Effect.gen(function* () {
          const plugins = yield* PluginService.PluginService;
          const first = yield* plugins.catalog({ query: "" });
          // The first read never waits on the network.
          assert.strictEqual(first.catalogs[0]?.state, "fetching");
          const marketId = first.catalogs[0]!.id;
          const installed = yield* plugins.install(`${marketId}/demo`);
          const commit = git(files.market, "rev-parse", "HEAD");
          assert.strictEqual(installed.commit, commit);
          assert.strictEqual(installed.updateAvailable, false);
          // Cache folder names are shortened, so read the one market folder the install made.
          const cache = NodePath.join(base, "userdata", "plugins", "cache");
          const [marketDir] = NodeFS.readdirSync(cache);
          const root = NodePath.join(cache, marketDir!, "demo", commit.slice(0, 12));
          assert.isTrue(NodeFS.existsSync(NodePath.join(root, "server.mjs")));
          assert.strictEqual(installed.views.length, 2);
          yield* plugins.uninstall("demo");
          assert.isFalse(NodeFS.existsSync(root));
        }).pipe(
          Effect.provide(
            layerFor([{ type: "git", repository: `file://${files.bare}` }], base, files.work),
          ),
          Effect.ensuring(
            Effect.sync(() => NodeFS.rmSync(files.dir, { recursive: true, force: true })),
          ),
        );
      },
    );
  });
});
