/**
 * Each library entry's cover, one family drawn by `scripts/studio-library-pictures.py` from the real
 * files of the examples Studio ships (`studio-sample/<id>`). A cover shows what the entry's job does:
 * a model from one camera, or one sheet holding a document's structure. Its neutrals are a picture;
 * everything with a hue is a mark, in a tone `LibraryPicture` draws from the theme.
 */

import coverFile from "./pictures/covers.json";
import { TEXT_TO_CAD } from "./skillAvailability";

export interface CoverMark {
  /** `hue` is the entry's shelf's; the others are status, ink and the ground. */
  readonly tone: string;
  readonly d: string;
  /** A line's width; a mark with none is filled. */
  readonly width?: number;
  readonly opacity?: number;
  readonly dash?: string;
}

interface CoverInFile {
  readonly image: boolean;
  readonly sheet: boolean;
  readonly marks: ReadonlyArray<CoverMark>;
  readonly insets: ReadonlyArray<{
    readonly cover: string;
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }>;
}

export interface LibraryCover {
  /** The picture under the marks; a sheet has none. */
  readonly url: string | null;
  readonly sheet: boolean;
  readonly marks: ReadonlyArray<CoverMark>;
  /** Other covers' pictures shown small on this one, where the marks' coordinates put them. */
  readonly insets: ReadonlyArray<{
    readonly url: string;
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }>;
}

/** The space marks are drawn in: a cover's picture, so they stay on it at any size or crop. */
export const COVER_VIEW = "0 0 640 400";

/** The one sheet every document stands on, in `COVER_VIEW`. */
export const COVER_SHEET = coverFile.sheet;

const COVERS: Readonly<Record<string, CoverInFile>> = coverFile.covers;

/** The covers' pictures' URLs, by path from this folder. */
const IMAGES = import.meta.glob<string>("./pictures/*.webp", { eager: true, import: "default" });

const imageOf = (cover: string) => IMAGES[`./pictures/${cover}.webp`] ?? null;

/** Which cover each document type shows. */
const ENTRY_COVERS: Readonly<Record<string, string>> = {
  "doc:part": "adapter",
  "doc:assembly": "mount",
  "doc:sheet-metal": "bracket",
  "doc:drawing": "drawing",
  "doc:simulation": "stress",
  "doc:fit-mass": "fit",
  "doc:manufacturing-check": "flags",
  "doc:cam-job": "toolpaths",
  "doc:print": "gcode",
  "doc:pmi": "pmi",
  "doc:cut-file": "dxf",
  "doc:order": "nest",
  "doc:standard-parts": "catalog",
  "doc:export": "mesh",
  "doc:parts-list": "parts-list",
  "doc:instructions": "instructions",
  "doc:exploded": "exploded",
  "doc:pictures": "views",
  "doc:motion-video": "motion",
  "doc:test-plan": "test-plan",
  "doc:write-up": "write-up",
  "doc:robot": "urdf",
  "doc:prd": "prd",
  "doc:requirements": "requirements",
  "doc:fmea": "fmea",
  "doc:design-review": "design-review",
  "doc:circuit-board": "board",
};

/**
 * The cover of each text-to-cad skill on the Toolbox page, by its name: Jake's skills, then each
 * job that is a skill of its own (`jobSkills.ts`). Every one is its own, so no two tiles there show
 * the same picture (`libraryPictures.test.ts`).
 */
const SKILL_COVERS: Readonly<Record<string, string>> = {
  cad: "bracket",
  cam: "cam",
  "engineering-drawing": "drawing",
  fea: "fea",
  pcb: "board",
  print3d: "print3d",
  "robot-simulation": "robot",
  sendcutsend: "nest",
  "work-instructions": "instructions",
  fit: "clearance",
  motion: "motion",
  mass: "fit",
  fdm: "fdm",
  resin: "resin",
  powder: "sls",
  "metal-print": "metal-print",
  cnc: "cnc",
  "sheet-metal": "flags",
  dxf: "flat-pattern",
  molding: "molding",
  "board-check": "board-drc",
  "board-review": "board-review",
  "board-fab": "board-fab",
  "board-step": "board-step",
  export: "step",
  pmi: "pmi",
  exploded: "exploded",
  pictures: "views",
  "motion-video": "motion-video",
};

const skillCover = (entryId: string) => {
  const prefix = `skill:${TEXT_TO_CAD}/`;
  return entryId.startsWith(prefix) ? SKILL_COVERS[entryId.slice(prefix.length)] : undefined;
};

/**
 * An entry's cover, by its id. Null for another plugin's skill and for the person's own templates,
 * which `LibraryPicture` draws from the template itself.
 */
export function coverOf(entryId: string): LibraryCover | null {
  const name = ENTRY_COVERS[entryId] ?? skillCover(entryId);
  const cover = name === undefined ? undefined : COVERS[name];
  if (name === undefined || cover === undefined) return null;
  return {
    url: cover.image ? imageOf(name) : null,
    sheet: cover.sheet,
    marks: cover.marks,
    insets: cover.insets.flatMap(({ cover: inset, ...place }) => {
      const url = imageOf(inset);
      return url === null ? [] : [{ url, ...place }];
    }),
  };
}

/** The examples' pictures' URLs: `pictures/examples/<id>.png`, or `.webp` at the library's size. */
const EXAMPLE_IMAGES = import.meta.glob<string>("./pictures/examples/*.{png,webp}", {
  eager: true,
  import: "default",
});

/**
 * An example's picture, by its id (`studio-sample/<id>`), bundled here so every client shows it
 * without reading the server's disk. Null for an example with none, which shows a plain card.
 */
export function examplePictureOf(sampleId: string): string | null {
  return (
    EXAMPLE_IMAGES[`./pictures/examples/${sampleId}.webp`] ??
    EXAMPLE_IMAGES[`./pictures/examples/${sampleId}.png`] ??
    null
  );
}
