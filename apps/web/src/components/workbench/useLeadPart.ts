import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { leadPartOf } from "./leadPart";
import { folderFiles } from "./projectModels";
import { useFolderModels } from "./useFolderModels";

/**
 * A project folder's files as listed, with its cadgen 0.8 models, read again when the agent changes
 * files; null while they are still listed.
 */
function useFolderListing(
  environmentId: EnvironmentId,
  folder: string | null,
  mutationId?: string | null,
) {
  const listing = useEnvironmentQuery(
    folder === null
      ? null
      : projectEnvironment.listEntries({
          environmentId,
          input: { cwd: folder },
        }),
  );
  useWorkspaceMutationRefresh({
    enabled: folder !== null,
    mutationId: mutationId ?? null,
    refresh: listing.refresh,
    resourceKey: `studio-lead-part:${folder ?? ""}`,
  });
  const entries = listing.data?.entries;
  // Its cadgen 0.8 models among its parts, by their document ids.
  const models = useFolderModels(environmentId, folder ?? "", mutationId);
  return useMemo(
    () =>
      folder === null || entries === undefined
        ? null
        : {
            root: folder,
            paths: entries
              .filter((entry) => entry.kind === "file" && entry.ignored !== true)
              .map((entry) => entry.path),
            models,
          },
    [entries, folder, models],
  );
}

/** A project folder's lead part (`leadPartOf`), read again when the agent changes files. */
export function useLeadPart(
  environmentId: EnvironmentId,
  folder: string | null,
  mutationId?: string | null,
) {
  const listing = useFolderListing(environmentId, folder, mutationId);
  return useMemo(() => (listing === null ? null : leadPartOf([listing])), [listing]);
}

/**
 * The kinds of file a project folder holds ("Part", "Board", "Schematic"), for the Toolbox to tell
 * a job with nothing to work on yet (`toolboxStart`); null while its files are still listed.
 */
export function useProjectKinds(
  environmentId: EnvironmentId,
  folder: string | null,
  mutationId?: string | null,
): ReadonlySet<string> | null {
  const listing = useFolderListing(environmentId, folder, mutationId);
  return useMemo(
    () =>
      listing === null
        ? null
        : new Set(folderFiles(listing.paths, listing.models).map((file) => file.kind)),
    [listing],
  );
}
