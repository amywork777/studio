// @effect-diagnostics nodeBuiltinImport:off - reads text-to-cad's skill folders on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { InstalledPlugin } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS } from "../hardwareActions";
import { librarySkills } from "./libraryCatalog";

// Studio's law 13 (AGENTS.md): every one of text-to-cad's skills is in the Toolbox, with Studio's own
// words for its tile and at least one job (its name, as its own files give it, is libraryCatalog.test.ts's
// to check). Whether Studio's pin has all of Jake's skills is
// .github/workflows/studio-jakes-skills.yml's to check, and the app build stops on one it leaves out.
const SKILLS = NodePath.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
  "text-to-cad",
  "skills",
);

/** The pinned text-to-cad's skills: the folders of its skills/ that hold a SKILL.md. */
const SKILLS_PINNED = NodeFS.readdirSync(SKILLS)
  .filter((name) => NodeFS.existsSync(NodePath.join(SKILLS, name, "SKILL.md")))
  .toSorted();

// Words no skill's own files would hold, so a tile that falls back to them has none of Studio's.
const UNSET = "(no words of Studio's)";

const installed: InstalledPlugin = {
  id: "text-to-cad",
  displayName: "text-to-cad",
  description: "",
  version: null,
  publisher: null,
  enabled: true,
  marketplace: null,
  commit: null,
  skills: SKILLS_PINNED,
  skillDetails: SKILLS_PINNED.map((name) => ({
    name,
    displayName: null,
    description: UNSET,
    defaultPrompt: null,
  })),
  servers: [],
  views: [],
  compatibility: { level: "works", label: "Works", notes: [] },
  updateAvailable: false,
  error: null,
};

describe("every one of text-to-cad's skills in the Toolbox (law 13)", () => {
  const tiles = librarySkills([installed]);
  const tileOf = (name: string) => tiles.find((tile) => tile.name === name);

  it("reads the pinned text-to-cad's skills", () => {
    expect(SKILLS_PINNED).toContain("cad");
  });

  it("gives each skill a tile that says what it does", () => {
    expect(SKILLS_PINNED.filter((name) => !tileOf(name) || tileOf(name)?.blurb === UNSET)).toEqual(
      [],
    );
  });

  it("gives each skill something to try", () => {
    expect(SKILLS_PINNED.filter((name) => !tileOf(name)?.tryAsking)).toEqual([]);
  });

  it("gives each skill at least one job in the Toolbox", () => {
    expect(
      SKILLS_PINNED.filter((name) => !HARDWARE_ACTIONS.some((job) => job.skill === name)),
    ).toEqual([]);
  });
});
