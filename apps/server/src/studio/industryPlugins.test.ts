// @effect-diagnostics nodeBuiltinImport:off -- copies studio-plugins/ to a scratch folder on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as PluginService from "../plugins/PluginService.ts";
import { layerFor } from "../plugins/PluginService.testFixtures.ts";

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
  });
});
