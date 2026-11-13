import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";

import { type CheckResult, resultsFor } from "./checkResults";
import { classifyProjectFile } from "./projectFiles";
import type { FolderChecks } from "./useProjectChecks";

const normal = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");
const baseName = (path: string) => normal(path).split("/").at(-1) ?? path;

/** A check about the file on screen, and the folder its result is in. */
export interface ShownCheck {
  readonly root: string;
  readonly result: CheckResult;
}

/**
 * `shown` is a full path or a cadgen 0.8 model's document id. When what is shown is a check's
 * result, also returns the part it checked, to go back to.
 */
export function shownChecks(
  folders: ReadonlyArray<FolderChecks>,
  shown: string,
): { readonly results: ReadonlyArray<ShownCheck>; readonly of: string | null } {
  const all = folders.flatMap((folder) =>
    folder.results.map((result) => ({ root: folder.root, result })),
  );
  // A model's results name its document by its id.
  if (isDocumentId(shown)) {
    return { results: all.filter(({ result }) => result.part === shown), of: null };
  }
  const target = normal(shown);
  const inside = folders.find((folder) => target.startsWith(`${normal(folder.root)}/`));
  const file = classifyProjectFile(
    inside === undefined ? baseName(target) : target.slice(normal(inside.root).length + 1),
  );
  const results =
    file !== null && file.group === "CAD"
      ? all.filter(({ result }) => resultsFor(file, [result]).length > 0)
      : [];
  const study = all.find(({ root, result }) => `${normal(root)}/${result.model}` === target);
  if (study === undefined) return { results, of: null };
  if (isDocumentId(study.result.part)) return { results, of: study.result.part };
  const part = study.result.part.toLowerCase();
  for (const folder of folders) {
    const found = (folder.paths ?? []).find((path) => baseName(path).toLowerCase() === part);
    if (found !== undefined) return { results, of: `${normal(folder.root)}/${found}` };
  }
  return { results, of: null };
}
