import { drawingsFor, manufacturingFor, overviewParts, studiesFor } from "./checkResults";
import type { ProjectFile } from "./projectFiles";
import { byLatest, folderFiles, type ProjectModel } from "./projectModels";

/** A folder of the project as it was read: its files, or null while they are still listed, and its models. */
interface ReadFolder {
  readonly root: string;
  readonly paths: ReadonlyArray<string> | null;
  readonly models?: ReadonlyArray<ProjectModel>;
}

const stem = (file: ProjectFile) => file.name.replace(/\..*$/, "").toLowerCase();

const IN_ASSEMBLIES = /(?:^|\/)assembl/i;

/** Whether the file is the whole product: an assembly by its kind, or by the folder it is filed in. */
export const isAssembly = (file: Pick<ProjectFile, "kind" | "folder">) =>
  file.kind === "Assembly" || IN_ASSEMBLIES.test(file.folder);

/** Whether a part's name says it is made from `source`'s: `bracket_flat`, `bracket-v2`. */
const madeFrom = (name: string, source: string) =>
  name !== source && name.startsWith(source) && /^[-_. ]/.test(name.slice(source.length));

/**
 * The parts not named after another of `parts`: `bracket_flat` and `bracket-v2` are made from
 * `bracket`, which stands for them, whichever a listing in name order puts first. A file in the
 * assemblies folder stays: `assemblies/stand_portrait` is the product `stand` goes into.
 */
export function sourceParts(parts: ReadonlyArray<ProjectFile>): ProjectFile[] {
  const stems = parts.map(stem);
  return parts.filter(
    (part) =>
      IN_ASSEMBLIES.test(part.folder) || !stems.some((other) => madeFrom(stem(part), other)),
  );
}

/**
 * Of the parts not made from another (`sourceParts`): the one with the most made from it, then an
 * assembly, then the last built (`byLatest`), else the first part in file order. Read from the
 * project's files alone, so the Overview, the workspace and a new chat's starters agree.
 */
export function leadPartOf(
  folders: ReadonlyArray<ReadFolder>,
): { readonly root: string; readonly file: ProjectFile } | null {
  const lead = folders
    .flatMap((folder) => {
      const paths = folder.paths ?? [];
      const files = folderFiles(paths, folder.models);
      const parts = overviewParts(files);
      const manufacturing = manufacturingFor(parts, files);
      const studies = studiesFor(parts, files);
      const sources = sourceParts(parts);
      return (sources.length > 0 ? sources : parts).map((file) => ({
        root: folder.root,
        file,
        // What is made from it, each kind once: a board's Gerbers are a file per layer, not one
        // made thing per layer. The parts named after it (its flat pattern) count too.
        made:
          drawingsFor(file, paths).length +
          new Set((manufacturing.get(file.path) ?? []).map((made) => made.kind)).size +
          (studies.get(file.path)?.length ?? 0) +
          parts.filter((other) => madeFrom(stem(other), stem(file))).length,
      }));
    })
    .toSorted(
      (a, b) =>
        b.made - a.made ||
        Number(isAssembly(b.file)) - Number(isAssembly(a.file)) ||
        byLatest(a.file, b.file),
    )[0];
  return lead === undefined ? null : { root: lead.root, file: lead.file };
}
