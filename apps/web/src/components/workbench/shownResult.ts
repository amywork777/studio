import { claimStudies, currentResults, overviewParts } from "./checkResults";
import { folderFiles, type ProjectModel } from "./projectModels";
import type { FolderChecks } from "./useProjectChecks";

const normal = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");

/**
 * Whether the check result the viewer shows (`shown`, its full path) is of a part changed since,
 * for the title block to say so over it. Read as the project's Overview reads its parts' checks
 * (`currentResults`, a study on a copy counted for its part: `claimStudies`), so a result open on
 * its own says what its part's badge says. False when `shown` is no result, and when nothing is
 * known: a result whose file names no time, a part the engine has not built.
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
