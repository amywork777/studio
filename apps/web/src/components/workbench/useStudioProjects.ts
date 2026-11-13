import type { EnvironmentId, StudioProject, StudioProjectOrigin } from "@t3tools/contracts";
import { studioProjectAt } from "@t3tools/shared/studioProjects";

import { useEnvironmentQuery } from "~/state/query";
import { studioProjectsEnvironment } from "~/state/studioProjects";
import { useAtomCommand } from "~/state/use-atom-command";

const NONE: Readonly<Record<string, StudioProject>> = {};

/**
 * Each project is a file in the environment's projects folder, a git repository the server commits
 * every change to, so projects can be pushed and shared. Null reads nothing.
 */
export function useStudioProjectsList(environmentId: EnvironmentId | null) {
  return useEnvironmentQuery(
    environmentId === null ? null : studioProjectsEnvironment.list({ environmentId, input: {} }),
  );
}

export function useStudioProjects(
  environmentId: EnvironmentId | null,
): Readonly<Record<string, StudioProject>> {
  return useStudioProjectsList(environmentId).data?.projects ?? NONE;
}

/** The project a folder belongs to, with its id; null when it is in none. */
export function useStudioProjectAt(
  environmentId: EnvironmentId | null,
  folder: string | null,
): { readonly id: string; readonly project: StudioProject } | null {
  const projects = useStudioProjects(environmentId);
  return folder === null ? null : studioProjectAt(projects, folder);
}

/**
 * Saves a project whole (a null id makes a new one, named from the project),
 * then rereads the list. Resolves to the project's id, or null when the save
 * failed (which it reports itself). A project is taken out with Move to Trash
 * (`useTrash`).
 */
export function useSaveStudioProject(environmentId: EnvironmentId) {
  const save = useAtomCommand(studioProjectsEnvironment.save, { reportFailure: true });
  const { refresh } = useStudioProjectsList(environmentId);
  return async (
    id: string | null,
    project: StudioProject,
    origin?: StudioProjectOrigin,
  ): Promise<string | null> => {
    const result = await save({
      environmentId,
      input: { id, project, ...(origin === undefined ? {} : { origin }) },
    });
    if (result._tag !== "Success") return null;
    refresh();
    return result.value.id;
  };
}
