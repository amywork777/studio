import { overviewParts } from "./checkResults";
import { partLabel } from "./partNames";
import { oneCardPerStudy, type ProjectFile, type ProjectGroup } from "./projectFiles";
import { folderFiles, type ProjectModel } from "./projectModels";

/**
 * The types the Overview's list of a project's files filters by, as Google Drive filters a folder
 * by Docs, Sheets and Slides: its CAD (parts, assemblies, their drawings, and parts bought in), its
 * electronics, the analysis and manufacturing files made from them, its documents, and the
 * references gathered for it. Its chats are down the left, not here.
 */
export type ItemType =
  | "CAD"
  | "Electronics"
  | "Analysis"
  | "Manufacturing"
  | "Documents"
  | "References";

export const ITEM_TYPES: ReadonlyArray<ItemType> = [
  "CAD",
  "Electronics",
  "Analysis",
  "Manufacturing",
  "Documents",
  "References",
];

const TYPE_OF: Readonly<Record<ProjectGroup, ItemType>> = {
  CAD: "CAD",
  Drawings: "CAD",
  "Reference parts": "CAD",
  Electronics: "Electronics",
  Analysis: "Analysis",
  Manufacturing: "Manufacturing",
  Documents: "Documents",
  Images: "References",
  References: "References",
};

export const itemType = (group: ProjectGroup): ItemType => TYPE_OF[group];

/** A file of the project as its list shows it: once, by the file that shows it. */
export interface FileItem {
  /** The project folder it is in. */
  readonly root: string;
  readonly file: ProjectFile;
  /** Its row's words: a part by its name, anything else with what it is ("Bracket FEA study"). */
  readonly label: string;
}

/** A row's words: kinds the file's folder decides ("Result", "Toolpath") are said after its name. */
function labelOf(file: ProjectFile): string {
  if (file.document !== undefined) return file.title;
  return file.kind === "Result" || file.kind === "Toolpath"
    ? `${file.title} ${file.kind.toLowerCase()}`
    : partLabel(file.path);
}

/** Of two files that are one thing (a study's data and its model), the one that shows it. */
const SHOWS = [/\.glb$/i, /\.pdf$/i];
const showRank = (path: string) => {
  const rank = SHOWS.findIndex((test) => test.test(path));
  return rank === -1 ? SHOWS.length : rank;
};

/**
 * Every file of the project's folders, each thing once, in type then name order: a part as the
 * Overview counts it (a mesh beside its STEP folded in, a cadgen 0.8 model by its document id), a
 * result, job or drawing whose files share a folder and a name as the file that shows it. The
 * README is the Overview's own, so not listed.
 */
export function projectFileItems(
  folders: ReadonlyArray<{
    readonly root: string;
    readonly paths: ReadonlyArray<string> | null;
    readonly models?: ReadonlyArray<ProjectModel>;
  }>,
): FileItem[] {
  const items: FileItem[] = [];
  for (const folder of folders) {
    const files = oneCardPerStudy(folderFiles(folder.paths ?? [], folder.models)).filter(
      (file) => !/^readme\.md$/i.test(file.path),
    );
    for (const file of overviewParts(files)) {
      items.push({ root: folder.root, file, label: labelOf(file) });
    }
    const kept = new Map<string, ProjectFile>();
    for (const file of files) {
      if (file.group === "CAD" || file.group === "Electronics") continue;
      const key = `${file.folder}\n${labelOf(file).toLowerCase()}`;
      const held = kept.get(key);
      if (held === undefined || showRank(file.path) < showRank(held.path)) kept.set(key, file);
    }
    for (const file of kept.values()) {
      items.push({ root: folder.root, file, label: labelOf(file) });
    }
  }
  const order = (item: FileItem) => ITEM_TYPES.indexOf(itemType(item.file.group));
  return items.toSorted(
    (a, b) =>
      order(a) - order(b) ||
      a.label.localeCompare(b.label) ||
      a.root.localeCompare(b.root) ||
      a.file.path.localeCompare(b.file.path),
  );
}
