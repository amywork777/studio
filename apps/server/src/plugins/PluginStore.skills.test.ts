// @effect-diagnostics nodeBuiltinImport:off -- fixtures are plugin folders on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { MY_SKILLS_PLUGIN_ID } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";

import { fixture, layerFor } from "./PluginService.testFixtures.ts";
import * as PluginStore from "./PluginStore.ts";

describe("the person's own skills", () => {
  it.layer(NodeServices.layer)((it) => {
    it.effect("reach every agent, and a plugin's stay as they shipped", () => {
      const files = fixture();
      return Effect.gen(function* () {
        const store = yield* PluginStore.PluginStore;
        yield* store.install("local-market/demo");

        // Nothing is listed until there is a skill to list.
        assert.deepEqual(
          (yield* store.list).map((plugin) => plugin.id),
          ["demo"],
        );

        const added = yield* store.createSkill({
          title: "Check wall thickness",
          description: "For 3D printed parts",
        });
        assert.strictEqual(added.skill, "check-wall-thickness");

        const mine = yield* store.get(MY_SKILLS_PLUGIN_ID);
        assert.deepEqual(mine.skills, [added.skill]);
        assert.strictEqual(mine.skillDetails?.[0]?.description, "For 3D printed parts");

        // A new chat hands this folder to Codex, and the plugin's root to Claude.
        const roots = yield* PluginStore.codexSkillRoots(Option.some(store));
        const myRoot = roots.find((root) => root.includes(MY_SKILLS_PLUGIN_ID));
        assert.isDefined(myRoot);
        assert.isTrue(NodeFS.existsSync(NodePath.join(myRoot!, added.skill, "SKILL.md")));
        const claude = PluginStore.withClaudePlugins(
          yield* PluginStore.claudePluginRoots(Option.some(store)),
          { plugins: [] as ReadonlyArray<{ readonly path: string }> },
        );
        assert.isTrue(claude.plugins.some((plugin) => plugin.path.includes(MY_SKILLS_PLUGIN_ID)));

        // A save shows in the list at once.
        const text = "---\nname: check-wall-thickness\ndescription: Changed\n---\n\n# Steps\n";
        yield* store.saveSkill({
          skill: added.skill,
          title: "Check wall thickness",
          description: "Changed",
          instructions: "# Steps\n",
        });
        const saved = yield* store.get(MY_SKILLS_PLUGIN_ID);
        assert.strictEqual(saved.skillDetails?.[0]?.description, "Changed");
        const read = yield* store.readSkill({
          pluginId: MY_SKILLS_PLUGIN_ID,
          skill: added.skill,
          file: null,
        });
        assert.strictEqual(read.text, text);

        // Editing a plugin's skill is editing a copy.
        const copy = yield* store.copySkill({ pluginId: "demo", skill: "parts" });
        assert.strictEqual(copy.skill, "my-parts");
        assert.deepEqual((yield* store.get("demo")).skills, ["parts"]);
        assert.deepEqual((yield* store.get(MY_SKILLS_PLUGIN_ID)).skills, [added.skill, "my-parts"]);

        yield* store.removeSkill(copy.skill);
        assert.deepEqual((yield* store.get(MY_SKILLS_PLUGIN_ID)).skills, [added.skill]);

        // The way out of an own skill is Remove: uninstalling would hide them all.
        assert.isTrue(Exit.isFailure(yield* Effect.exit(store.uninstall(MY_SKILLS_PLUGIN_ID))));
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(store.readSkill({ pluginId: "demo", skill: "..", file: null })),
          ),
        );
      }).pipe(
        Effect.provide(layerFor([{ type: "folder", path: files.market }], files.dir, files.work)),
      );
    });
  });
});
