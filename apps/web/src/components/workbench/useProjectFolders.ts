import type { EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { studioFolderName } from "@t3tools/shared/studioProjects";

import { newProjectId } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { useProjects } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { folderProject } from "./projectList";

/**
 * The folders an environment knows, each one T3 project: what a Studio
 * project can be made of. Threads run in a folder, so every folder in a
 * Studio project is one of these.
 */
export function useEnvironmentFolders(
  environmentId: EnvironmentId,
): ReadonlyArray<EnvironmentProject> {
  const projects = useProjects();
  return projects.filter(
    (project) => project.environmentId === environmentId && project.isScratch !== true,
  );
}

export { folderProject };

/**
 * Picks a folder on this computer and makes sure the environment knows it,
 * resolving to its path (null when nothing was picked or it could not be
 * added). Null on the hosted app and for a remote environment, which have no
 * picker: add those folders from the command palette.
 */
export function usePickFolder(environmentId: EnvironmentId): (() => Promise<string | null>) | null {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const folders = useEnvironmentFolders(environmentId);
  const create = useAtomCommand(projectEnvironment.create, { reportFailure: true });
  const pick = async () => {
    const picked = await readLocalApi()?.dialogs.pickFolder();
    if (!picked) return null;
    if (folderProject(folders, picked) !== null) return picked;
    const result = await create({
      environmentId,
      input: {
        projectId: newProjectId(),
        title: studioFolderName(picked),
        workspaceRoot: picked,
        createWorkspaceRootIfMissing: false,
        defaultModelSelection: null,
      },
    });
    return result._tag === "Success" ? picked : null;
  };
  return typeof window !== "undefined" &&
    window.desktopBridge !== undefined &&
    primaryEnvironmentId === environmentId
    ? pick
    : null;
}
