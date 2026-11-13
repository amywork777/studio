import { claimStudies, currentResults, overviewParts } from "./checkResults";
import { folderFiles, type ProjectModel } from "./projectModels";
import type { FolderChecks } from "./useProjectChecks";

const normal = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");

/**
 * Read as the Overview reads its parts' checks (`currentResults`, `claimStudies`), so a result open
 * on its own says what its part's badge says. False when nothing is known: a result whose file
 * names no time, or a part the engine has not built.
 */
export function shownResultOutOfDate(
  folders: ReadonlyArray<FolderChecks>,
  models: ReadonlyMap<string, ReadonlyArray<ProjectModel>>,
  shown: string,
): boolean {
  const target = normal(shown);
  for (const folder of folders) {
    const study = folder.results.find(
      (result) => `${normal(folder.root)}/${result.model}` === target,
    );
    if (study === undefined) continue;
    const parts = overviewParts(folderFiles(folder.paths ?? [], models.get(folder.root)));
    return currentResults(parts, claimStudies(parts, [study])).length === 0;
  }
  return false;
}
