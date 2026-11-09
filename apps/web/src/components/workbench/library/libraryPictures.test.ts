// @effect-diagnostics nodeBuiltinImport:off - checks the examples Studio ships on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { JOB_SKILL_JOBS } from "../jobSkills";
import { LIBRARY_DOCUMENTS, skillsBehind } from "./libraryCatalog";
import libraryExamples from "./libraryExamples.json";
import { COVER_SHEET, coverOf, examplePictureOf } from "./libraryPictures";
import coverFile from "./pictures/covers.json";

const ROOT = NodePath.join(import.meta.dirname, "..", "..", "..", "..", "..", "..");

/** text-to-cad's own skills, which the catalog test pins to its folders, then each job as a skill. */
const SKILLS = [
  ...Object.keys(libraryExamples).filter((id) => id.startsWith("skill:text-to-cad/")),
  ...JOB_SKILL_JOBS.map((job) => `skill:text-to-cad/${job.id}`),
];

/** The document types, then the skills. */
const ENTRIES = [...LIBRARY_DOCUMENTS.map((entry) => entry.id), ...SKILLS];

const COVERS = ENTRIES.map((id) => [id, coverOf(id)] as const);

/** What the Toolbox page shows as tiles: the skills, and the document types no skill there makes. */
const TILES = [
  ...SKILLS,
  ...LIBRARY_DOCUMENTS.filter((entry) =>
    skillsBehind(entry).every((skill) => !SKILLS.includes(`skill:text-to-cad/${skill}`)),
  ).map((entry) => entry.id),
];

describe("library covers", () => {
  it("shows every tile on the Toolbox page its own cover, so no two read alike", () => {
    expect(SKILLS).toContain("skill:text-to-cad/fdm");
    expect(SKILLS).toContain("skill:text-to-cad/pcb");
    const seen = new Map<string, string>();
    for (const id of TILES) {
      const cover = coverOf(id);
      expect(cover, id).not.toBeNull();
      const key = JSON.stringify(cover);
      expect(seen.get(key), `${id} shows the cover of ${seen.get(key)}`).toBeUndefined();
      seen.set(key, id);
    }
    expect(coverOf("skill:other/urdf")).toBeNull();
  });

  it("gives every entry a cover", () => {
    expect(COVERS.filter(([, cover]) => cover === null).map(([id]) => id)).toEqual([]);
    for (const [id, cover] of COVERS) {
      if (cover === null) continue;
      // Every cover is a picture or a sheet.
      expect(cover.url !== null || cover.sheet, id).toBe(true);
    }
  });

  it("draws every cover it holds, and only those", () => {
    const shown = new Set(
      COVERS.flatMap(([, cover]) => (cover === null ? [] : [JSON.stringify(cover)])),
    );
    expect(shown.size).toBe(Object.keys(coverFile.covers).length);
  });

  it("shows each document type its own cover, so no two read alike", () => {
    const covers = LIBRARY_DOCUMENTS.flatMap((entry) => {
      const cover = coverOf(entry.id);
      return cover === null ? [] : [JSON.stringify(cover)];
    });
    expect(new Set(covers).size).toBe(covers.length);
  });

  it("keeps every sheet the one sheet, its marks inside it and no words on it", () => {
    const { x, y, w, h } = COVER_SHEET;
    for (const [name, cover] of Object.entries(coverFile.covers)) {
      expect(JSON.stringify(cover.marks), name).not.toMatch(/<text/);
      if (!cover.sheet) continue;
      expect(cover.image, name).toBe(false);
      for (const mark of cover.marks) {
        const points = [...mark.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)];
        for (const [, px, py] of points) {
          expect(Number(px), name).toBeGreaterThanOrEqual(x);
          expect(Number(px), name).toBeLessThanOrEqual(x + w);
          expect(Number(py), name).toBeGreaterThanOrEqual(y);
          expect(Number(py), name).toBeLessThanOrEqual(y + h);
        }
      }
    }
  });

  it("leaves own templates and other plugins' skills to LibraryPicture", () => {
    expect(coverOf("own:/p/Templates/Supplier audit.md")).toBeNull();
    expect(coverOf("skill:other/thing")).toBeNull();
  });

  it("has a picture for every example Studio ships, and none for one it does not", () => {
    const examples = NodeFS.readdirSync(NodePath.join(ROOT, "studio-sample"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
    expect(examples).toContain("servo-bracket");
    expect(examples.filter((id) => examplePictureOf(id) === null)).toEqual([]);
    expect(examplePictureOf("no-such-example")).toBeNull();
  });
});
