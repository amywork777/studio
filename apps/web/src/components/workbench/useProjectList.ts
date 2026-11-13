import type { EnvironmentId } from "@t3tools/contracts";

import { useThreadShells } from "~/state/entities";
import { useOpenedThreads } from "./openedThreads";
import { listProjects } from "./projectList";
import { hiddenByTrash } from "./trash/trash";
import { useEnvironmentFolders } from "./useProjectFolders";
import { useStudioProjectsList } from "./useStudioProjects";

/**
 * Projects and loose folders, last opened first. A folder only projects in Trash hold is left out
 * with its chats (`hiddenByTrash`). Nothing is listed until `list` arrives: a folder is only in no
 * project once the projects are known.
 */
export function useProjectList(environmentId: EnvironmentId) {
  const list = useStudioProjectsList(environmentId).data;
  const knownFolders = useEnvironmentFolders(environmentId);
  const threads = useThreadShells();
  const opened = useOpenedThreads();
  const shown =
    list === null ? null : hiddenByTrash(knownFolders, threads, list.trashed ?? {}, list.projects);
  const listed =
    list === null || shown === null
      ? listProjects({}, [], [], environmentId, opened)
      : listProjects(list.projects, shown.folders, shown.chats, environmentId, opened);
  return { list, ...listed };
}
