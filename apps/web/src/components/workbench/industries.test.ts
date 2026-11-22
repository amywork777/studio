// @effect-diagnostics nodeBuiltinImport:off - reads studio-plugins/ on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { InstalledPlugin, PluginCatalogEntry } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { INDUSTRIES, INDUSTRY_CATALOG_QUERY, industryStanding, STUDIO_CATALOG } from "./industries";

const OWN = NodePath.join(import.meta.dirname, "..", "..", "..", "..", "..", "studio-plugins");

const plugin = (id: string, skills: ReadonlyArray<string>, enabled = true): InstalledPlugin => ({
  id,
  displayName: id,
  description: "",
  version: null,
  publisher: null,
  enabled,
  marketplace: null,
  commit: null,
  skills: [...skills],
  skillDetails: [],
  servers: [],
  views: [],
  compatibility: { level: "works", label: "Works", notes: [] },
  updateAvailable: false,
  error: null,
});

const listing = (name: string, market: string): PluginCatalogEntry => ({
  key: `${market}/${name}`,
  name,
  displayName: name,
  description: "",
  category: "Industry",
  publisher: null,
  homepage: null,
  version: "0.1.0",
  marketplaces: [{ id: market, name: market, official: false }],
  verified: false,
  compatibility: { level: "works", label: "Works", notes: [] },
  installedId: null,
});

const industry = (id: string) => INDUSTRIES.find((each) => each.id === id)!;

describe("an industry's standing", () => {
  it("has a built-in one on while an enabled plugin has its skill, with nothing to switch", () => {
    const electronics = industry("electronics");
    expect(industryStanding(electronics, [plugin("text-to-cad", ["cad", "pcb"])], [])).toEqual({
      state: "built-in",
      on: true,
    });
    expect(
      industryStanding(electronics, [plugin("text-to-cad", ["cad", "pcb"], false)], []),
    ).toEqual({ state: "built-in", on: false });
  });

  it("switches an installed plugin on and off", () => {
    const woodworking = industry("woodworking");
    expect(industryStanding(woodworking, [plugin("woodworking", ["woodworking"])], [])).toEqual({
      state: "installed",
      on: true,
      pluginId: "woodworking",
    });
    expect(
      industryStanding(woodworking, [plugin("woodworking", ["woodworking"], false)], []),
    ).toMatchObject({ state: "installed", on: false });
  });

  it("installs one Studio's catalog lists, from that catalog", () => {
    expect(industryStanding(industry("jewelry"), [], [listing("jewelry", STUDIO_CATALOG)])).toEqual(
      { state: "listed", on: false, key: "local-studio-plugins/jewelry" },
    );
  });

  it("has no row for one this build does not carry, or that only another catalog names", () => {
    expect(industryStanding(industry("jewelry"), [], [])).toBeNull();
    expect(industryStanding(industry("jewelry"), [], [listing("jewelry", "elsewhere")])).toBeNull();
    // Another plugin of the name, without the skill, is not the industry's.
    expect(industryStanding(industry("jewelry"), [plugin("jewelry", ["rings"])], [])).toBeNull();
  });
});

describe("the industry plugins Studio ships (studio-plugins/)", () => {
  const listed: ReadonlyArray<{ name: string; category?: string }> = JSON.parse(
    NodeFS.readFileSync(NodePath.join(OWN, ".claude-plugin", "marketplace.json"), "utf8"),
  ).plugins;
  const packs = INDUSTRIES.filter((each) => each.plugin !== null);

  it("lists each under the word the Toolbox page searches the catalog for", () => {
    const found = (name: string) =>
      listed.find((each) => each.name === name)?.category?.toLowerCase() ?? null;
    expect(packs.map((each) => [each.plugin, found(each.plugin!)])).toEqual(
      packs.map((each) => [each.plugin, INDUSTRY_CATALOG_QUERY]),
    );
  });

  it("ships each one's skill under its own name", () => {
    const missing = packs.filter(
      (each) =>
        !NodeFS.existsSync(NodePath.join(OWN, each.plugin!, "skills", each.skill, "SKILL.md")),
    );
    expect(missing.map((each) => each.id)).toEqual([]);
  });

  it("gives every industry listed there a row", () => {
    const rowless = listed.filter(
      (each) =>
        each.category?.toLowerCase() === INDUSTRY_CATALOG_QUERY &&
        !packs.some((pack) => pack.plugin === each.name),
    );
    expect(rowless.map((each) => each.name)).toEqual([]);
  });
});
