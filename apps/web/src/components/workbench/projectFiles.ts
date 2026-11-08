import { humanName, partName } from "./partNames";

/**
 * A project the way an engineer files it, for the project page and the sidebar: first the three
 * kinds of thing designed (CAD, Electronics and Documents), then what the top bar's jobs make
 * from a part (its drawings, analysis and manufacturing files), then images and the references
 * the brief gathered. Source and configuration (the model scripts, settings, environments) are left to the
 * code interface. Each kind has one icon wherever Studio shows it (`kinds.ts`).
 */

export type ProjectGroup =
  | "CAD"
  | "Electronics"
  | "Documents"
  | "Drawings"
  | "Analysis"
  | "Manufacturing"
  | "Images"
  | "Reference parts"
  | "References";

/** The kinds in the page's order. */
export const PROJECT_GROUPS: ReadonlyArray<ProjectGroup> = [
  "CAD",
  "Electronics",
  "Documents",
  "Drawings",
  "Analysis",
  "Manufacturing",
  "Images",
  "Reference parts",
  "References",
];

/** What is designed: a part or a board, as against what is made from one. */
export const DESIGN_GROUPS: ReadonlySet<ProjectGroup> = new Set(["CAD", "Electronics"]);

export interface ProjectFile {
  readonly path: string;
  /** Its file name: "servo_bracket.step". */
  readonly name: string;
  /** What an engineer calls it: "Servo bracket" (`partNames.ts`). */
  readonly title: string;
  readonly folder: string;
  readonly group: ProjectGroup;
  /** What it is, in a word or two: "Part", "Board", "G-code", "Bill of materials". */
  readonly kind: string;
  /** The file that pictures it, when it is not itself pictured: a SolidCraft design's STEP. */
  readonly picture?: string;
  /**
   * A cadgen 0.8 model's document id (`projectModels.ts`): its `path` is then that id, which opens
   * and pictures it, and `script` the part script that makes it, relative to its folder.
   */
  readonly document?: string;
  readonly script?: string;
  /** A model's name in its script, which builds it at any version (What changed). */
  readonly model?: string;
  /** A model's last build, which its picture is cached by. */
  readonly version?: string;
}

/** Where each kind of file is filed; what it is and what it is called are `partNames.ts`'s. */
const RULES: ReadonlyArray<{ readonly test: RegExp; readonly group: ProjectGroup }> = [
  { test: /\.fea\.(?:glb|json)$/i, group: "Analysis" },
  { test: /(?:^|\/)FEA\/[^/]+\.(?:glb|json)$/i, group: "Analysis" },
  { test: /\.cam\.(?:glb|json)$/i, group: "Manufacturing" },
  { test: /\.(?:nc|gcode|ngc|tap|gco)$/i, group: "Manufacturing" },
  { test: /\.(?:step|stp|xbf)$/i, group: "CAD" },
  { test: /\.solidcraft$/i, group: "CAD" },
  { test: /\.(?:stl|3mf|obj|glb)$/i, group: "CAD" },
  { test: /\.(?:urdf|sdf|srdf)$/i, group: "CAD" },
  { test: /\.kicad_pcb$/i, group: "Electronics" },
  { test: /\.kicad_sch$/i, group: "Electronics" },
  { test: /\.harness\.ya?ml$/i, group: "Electronics" },
  { test: /\.(?:dxf|dwg|svg)$/i, group: "Drawings" },
  { test: /[._-]drawing\.pdf$/i, group: "Drawings" },
  { test: /\.(?:md|mdx|pdf|txt)$/i, group: "Documents" },
  { test: /gerbers?\.zip$|\.(?:gbr|drl)$/i, group: "Manufacturing" },
  { test: /bom\.(?:csv|tsv)$/i, group: "Manufacturing" },
  { test: /pos\.(?:csv|tsv)$/i, group: "Manufacturing" },
  { test: /\.(?:csv|tsv|xlsx)$/i, group: "Documents" },
  { test: /\.(?:png|jpe?g|webp|gif|heic)$/i, group: "Images" },
];

/**
 * Agent instructions, a repository's own files, and the icon a new project is made with
 * (`ManagedProjectFolders` on the server): not the project's work.
 */
const NOT_WORK =
  /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|CHANGELOG|LICENSE|CONTRIBUTING)\.md$|^assets\/icon\.svg$/i;
const HIDDEN_FOLDER = /^(?:\..*|node_modules|__pycache__|dist|build|tmp)$/;

/** What it is and what it is called, or the file's own name for a file of no known kind. */
function named(path: string, name: string) {
  const known = partName(path);
  return { title: known?.name ?? name, kind: known?.kind ?? "File" };
}

/** A path in the project, with forward slashes and without a leading `./`, which is its folder. */
const projectRelative = (path: string) => path.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");

/**
 * Whether a path, as the project's folder holds it, is the project's work and not tooling: not in
 * a hidden folder (or `node_modules`, `dist`, `build`, `tmp`; a path that leaves the folder with
 * `..` is in one), not a dot-file, and not the agent's instructions or the project's icon. A
 * model's script is work, though `classifyProjectFile` files it nowhere.
 */
export function isProjectWork(path: string): boolean {
  const normalized = projectRelative(path);
  const segments = normalized.split("/");
  const name = segments.at(-1) ?? normalized;
  if (segments.slice(0, -1).some((segment) => HIDDEN_FOLDER.test(segment))) return false;
  return !name.startsWith(".") && !NOT_WORK.test(normalized);
}

/** The file as the project page shows it, or null when it is not the project's work. */
export function classifyProjectFile(path: string): ProjectFile | null {
  if (!isProjectWork(path)) return null;
  const normalized = projectRelative(path);
  const segments = normalized.split("/");
  const name = segments.at(-1) ?? normalized;
  const folder = segments.slice(0, -1).join("/");
  // What the brief gathered is its own tab, whatever kind of file it is.
  if (/^brief\//i.test(normalized)) {
    if (/^brief\/brief\.json$/i.test(normalized)) return null;
    return { path: normalized, name, folder, group: "References", ...named(normalized, name) };
  }
  const rule = RULES.find((entry) => entry.test.test(normalized));
  if (rule === undefined) return null;
  const file = { path: normalized, name, folder, group: rule.group, ...named(normalized, name) };
  if (rule.group !== "CAD") return file;
  // A model's folder says what it is: a study's result, a CAM job's, or a part someone else made.
  const folders = segments.slice(0, -1);
  if (folders.some((segment) => STUDY_FOLDER.test(segment))) {
    return { ...file, group: "Analysis", kind: "Result" };
  }
  if (folders.some((segment) => CAM_FOLDER.test(segment))) {
    return { ...file, group: "Manufacturing", kind: "Toolpath" };
  }
  if (folders.some((segment) => REFERENCE_FOLDER.test(segment))) {
    return { ...file, group: "Reference parts" };
  }
  return file;
}

const STUDY_FOLDER = /^(?:fea|sim|simulations?|stud(?:y|ies)|results?|analysis|analyses)$/i;
const CAM_FOLDER = /^(?:cam|toolpaths?|machining)$/i;
const REFERENCE_FOLDER =
  /^(?:references?|vendor|vendors|suppliers?|library|libs?|third[-_]?party|purchased|datasheets?|off[-_]?the[-_]?shelf)$/i;

/** A study's name, whichever of its files this is: `plate.fea.glb`, `plate.fea.json`, `plate.step`. */
const studyStem = (name: string) => name.replace(/(?:\.fea)?\.[^.]+$/i, "").toLowerCase();
/** Which of a study's files shows it, first first: its result, then the shape it was run on. */
const STUDY_SHOWS = [/\.fea\.glb$/i, /\.glb$/i, /\.(?:step|stp)$/i, /\.(?:stl|3mf|obj)$/i];
const studyRank = (name: string) => {
  const rank = STUDY_SHOWS.findIndex((test) => test.test(name));
  return rank === -1 ? STUDY_SHOWS.length : rank;
};

/**
 * Each study once, by the file that shows it. A solve keeps its result, its numbers and the STEP it
 * ran on under one name, and those are one thing to the person, not three cards of nearly the same
 * picture. Only the Analysis group's files fold; two studies in different folders stay two.
 */
export function oneCardPerStudy(files: ReadonlyArray<ProjectFile>): ProjectFile[] {
  const shows = new Map<string, ProjectFile>();
  const keyOf = (file: ProjectFile) => `${file.folder}\n${studyStem(file.name)}`;
  for (const file of files) {
    if (file.group !== "Analysis") continue;
    const held = shows.get(keyOf(file));
    if (held === undefined || studyRank(file.name) < studyRank(held.name)) {
      shows.set(keyOf(file), file);
    }
  }
  return files.filter((file) => file.group !== "Analysis" || shows.get(keyOf(file)) === file);
}

/**
 * The project's files by group, in the page's order, each by folder then
 * name, narrowed by a search over their names, kinds and paths.
 */
export function groupProjectFiles(
  paths: ReadonlyArray<string>,
  query = "",
): Array<{ readonly group: ProjectGroup; readonly files: ProjectFile[] }> {
  return groupFiles(
    paths.map(classifyProjectFile).filter((file): file is ProjectFile => file !== null),
    query,
  );
}

/** Files already classified (a folder's, its models among them: `folderFiles`), by group as above. */
export function groupFiles(
  classified: ReadonlyArray<ProjectFile>,
  query = "",
): Array<{ readonly group: ProjectGroup; readonly files: ProjectFile[] }> {
  const needle = query.trim().toLowerCase();
  const files = oneCardPerStudy(
    classified.filter(
      (file) =>
        needle === "" || `${file.path}\n${file.title}\n${file.kind}`.toLowerCase().includes(needle),
    ),
  );
  return PROJECT_GROUPS.flatMap((group) => {
    const inGroup = files
      .filter((file) => file.group === group)
      .toSorted((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
    return inGroup.length === 0 ? [] : [{ group, files: inGroup }];
  });
}

/**
 * Where a file sits, said only where it tells two alike apart: two parts
 * called Bracket read "V1" and "V2" after their folders. A file whose name
 * and kind are its own has none.
 */
export function filePlaces(files: ReadonlyArray<ProjectFile>): ReadonlyMap<string, string> {
  const key = (file: ProjectFile) => `${file.kind}\n${file.title.toLowerCase()}`;
  const counts = new Map<string, number>();
  for (const file of files) counts.set(key(file), (counts.get(key(file)) ?? 0) + 1);
  const places = new Map<string, string>();
  for (const file of files) {
    if ((counts.get(key(file)) ?? 0) < 2) continue;
    const folder = file.folder.split("/").at(-1);
    places.set(file.path, folder ? humanName(folder) : "Project folder");
  }
  return places;
}
