import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";

import type * as PluginStore from "../plugins/PluginStore.ts";
import { PluginStore as PluginStoreService } from "../plugins/PluginStore.ts";
import * as AntigravityStudio from "./antigravityStudio.ts";

const plugin = (id: string, skillsDir: string | null): PluginStore.EnabledPlugin => ({
  id,
  root: skillsDir ?? `/plugins/${id}`,
  format: "claude",
  servers: {},
  skillsDir,
  listings: {},
});

/** A plugin folder holding `skills` as `<name>/SKILL.md` folders, as Studio installs one. */
const pluginWithSkills = Effect.fn("pluginWithSkills")(function* (
  root: string,
  skills: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const skill of skills) {
    yield* fs.makeDirectory(path.join(root, "skills", skill), { recursive: true });
    yield* fs.writeFileString(
      path.join(root, "skills", skill, "SKILL.md"),
      `---\nname: ${skill}\ndescription: The ${skill} skill.\n---\n`,
    );
  }
  return path.join(root, "skills");
});

it.layer(NodeServices.layer)("AntigravityStudio", (it) => {
  it.effect("hands Antigravity each enabled plugin's skills and takes back a disabled one's", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "studio-antigravity-plugins-" });
      const profile = path.join(root, "profile");
      const cad = yield* pluginWithSkills(path.join(root, "text-to-cad"), ["cad", "fea"]);
      const physics = yield* pluginWithSkills(path.join(root, "universalagi"), ["physics"]);
      // Each plugin's folder, with the skills folders its manifest hands agy.
      const listed = Effect.fn("listed")(function* () {
        const folder = path.join(profile, "config", "plugins");
        if (!(yield* fs.exists(folder))) return {};
        const handed: Record<string, ReadonlyArray<string>> = {};
        for (const name of (yield* fs.readDirectory(folder)).toSorted()) {
          const text = yield* fs
            .readFileString(path.join(folder, name, "plugin.json"))
            .pipe(Effect.option);
          if (Option.isSome(text)) handed[name] = JSON.parse(text.value).skills;
        }
        return handed;
      });

      assert.deepEqual(yield* listed(), {});
      yield* AntigravityStudio.syncPluginSkills(profile, [
        plugin("text-to-cad", cad),
        plugin("universalagi", physics),
        plugin("no-skills", null),
      ]);
      assert.deepEqual(yield* listed(), {
        "text-to-cad": [cad],
        universalagi: [physics],
      });
      const plugins = path.join(profile, "config", "plugins");
      assert.deepEqual((yield* fs.readDirectory(plugins)).toSorted(), [
        "text-to-cad",
        "universalagi",
      ]);
      assert.strictEqual(
        yield* fs.readFileString(path.join(plugins, "text-to-cad", "plugin.json")),
        AntigravityStudio.pluginManifest("text-to-cad", cad),
      );
      assert.notProperty(
        JSON.parse(yield* fs.readFileString(path.join(plugins, "text-to-cad", "plugin.json"))),
        "$schema",
      );

      // Something Studio did not write stays where it is, with its folder.
      yield* fs.writeFileString(path.join(plugins, "universalagi", "notes.txt"), "kept");
      yield* AntigravityStudio.syncPluginSkills(profile, [plugin("text-to-cad", cad)]);
      assert.deepEqual(yield* listed(), { "text-to-cad": [cad] });
      assert.deepEqual(yield* fs.readDirectory(path.join(plugins, "universalagi")), ["notes.txt"]);

      yield* AntigravityStudio.syncPluginSkills(profile, []);
      assert.deepEqual(yield* fs.readDirectory(plugins), ["universalagi"]);
    }).pipe(Effect.scoped),
  );

  it.effect("rewrites a manifest whose skills folder moved and leaves a current one alone", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const profile = yield* fs.makeTempDirectoryScoped({ prefix: "studio-antigravity-moved-" });
      const manifest = path.join(profile, "config", "plugins", "text-to-cad", "plugin.json");

      yield* AntigravityStudio.syncPluginSkills(profile, [plugin("text-to-cad", "/old/skills")]);
      yield* AntigravityStudio.syncPluginSkills(profile, [plugin("text-to-cad", "/new/skills")]);
      assert.strictEqual(
        yield* fs.readFileString(manifest),
        AntigravityStudio.pluginManifest("text-to-cad", "/new/skills"),
      );
      const before = yield* fs.stat(manifest);
      yield* AntigravityStudio.syncPluginSkills(profile, [plugin("text-to-cad", "/new/skills")]);
      assert.deepEqual((yield* fs.stat(manifest)).mtime, before.mtime);
    }).pipe(Effect.scoped),
  );

  it.effect("follows the plugin store into the profile", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "studio-antigravity-follow-" });
      const profile = path.join(root, "profile");
      const plugins = path.join(profile, "config", "plugins");
      const cad = yield* pluginWithSkills(path.join(root, "text-to-cad"), ["cad"]);
      const physics = yield* pluginWithSkills(path.join(root, "universalagi"), ["physics"]);
      let enabled = [plugin("text-to-cad", cad)];
      const release = yield* Deferred.make<void>();
      const synced = yield* Deferred.make<void>();
      // One change, which waits for the test, then the end of the stream, after its sync.
      const changes = Stream.concat(
        Stream.fromEffect(
          Deferred.await(release).pipe(
            Effect.andThen(
              Effect.sync(() => {
                enabled = [plugin("universalagi", physics)];
              }),
            ),
          ),
        ),
        Stream.fromEffect(Deferred.succeed(synced, undefined)).pipe(Stream.drain),
      );

      yield* AntigravityStudio.followPluginSkills(profile).pipe(
        Effect.provide(
          Layer.mock(PluginStoreService)({
            enabledPlugins: Effect.sync(() => enabled),
            changes,
          }),
        ),
      );
      assert.deepEqual(yield* fs.readDirectory(plugins), ["text-to-cad"]);

      yield* Deferred.succeed(release, undefined);
      yield* Deferred.await(synced);
      assert.deepEqual(yield* fs.readDirectory(plugins), ["universalagi"]);
      assert.strictEqual(
        yield* fs.readFileString(path.join(plugins, "universalagi", "plugin.json")),
        AntigravityStudio.pluginManifest("universalagi", physics),
      );
    }).pipe(Effect.scoped),
  );

  it.effect("writes nothing where there is no plugin store", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const profile = yield* fs.makeTempDirectoryScoped({ prefix: "studio-antigravity-none-" });

      yield* AntigravityStudio.followPluginSkills(profile);
      assert.isFalse(yield* fs.exists(path.join(profile, "config")));
    }).pipe(Effect.scoped),
  );
});
