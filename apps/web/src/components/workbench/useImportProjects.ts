import type { EnvironmentId, ProjectId, StudioProjectBrief } from "@t3tools/contracts";
import { EMPTY_STUDIO_BRIEF } from "@t3tools/shared/studioProjects";
import { useCallback } from "react";

import { newProjectId } from "~/lib/utils";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import type { ImportFile, ProposedProject } from "./importPlan";
import { readStudioImport } from "./studioImportBridge";
import { folderProject, useEnvironmentFolders } from "./useProjectFolders";
import { useSaveStudioProject } from "./useStudioProjects";

/** What the person chose to import: projects in place, and where each loose file goes. */
export interface ImportChoice {
  /** A brief is a restored project's; the rest start with an empty one. */
  readonly projects: ReadonlyArray<ProposedProject & { readonly brief?: StudioProjectBrief }>;
  /** A loose file goes to one of `projects` (by index), to a new project, or nowhere. */
  readonly placements: ReadonlyArray<{
    readonly file: ImportFile;
    readonly to: number | "new" | null;
  }>;
  readonly newProjectName: string;
}

/**
 * Imports what Import proposed: each project is its folder where it is (known to the environment,
 * and a Studio project of its own), and each placed loose file is copied into its project's
 * folder, or into one new project made for them. Resolves to how many projects were made, and the
 * first one's id, which Import opens.
 */
export function useImportProjects(environmentId: EnvironmentId) {
  const register = useAtomCommand(projectEnvironment.create, { reportFailure: true });
  const createNew = useAtomCommand(projectEnvironment.createNew, { reportFailure: true });
  const save = useSaveStudioProject(environmentId);
  const knownFolders = useEnvironmentFolders(environmentId);

  return useCallback(
    async (
      choice: ImportChoice,
    ): Promise<{ readonly made: number; readonly first: ProjectId | null }> => {
      let made = 0;
      let first: ProjectId | null = null;
      const saveProject = async (
        name: string,
        folder: string,
        projectId: ProjectId | null,
        brief: StudioProjectBrief = EMPTY_STUDIO_BRIEF,
      ) => {
        const id = await save(
          null,
          {
            name,
            template: "part",
            brief,
            folders: [folder],
            createdAt: new Date().toISOString(),
          },
          // Only a restored project comes with a brief of its own.
          brief === EMPTY_STUDIO_BRIEF ? "imported" : "restored",
        );
        if (id !== null) made += 1;
        if (id !== null && first === null) first = projectId;
        return id !== null;
      };

      const folders: Array<string | null> = [];
      for (const project of choice.projects) {
        let projectId = folderProject(knownFolders, project.folder)?.id ?? null;
        if (projectId === null) {
          projectId = newProjectId();
          const registered = await register({
            environmentId,
            input: {
              projectId,
              title: project.name,
              workspaceRoot: project.folder,
              createWorkspaceRootIfMissing: false,
              defaultModelSelection: null,
            },
          });
          if (registered._tag !== "Success") {
            folders.push(null);
            continue;
          }
        }
        folders.push(
          (await saveProject(project.name, project.folder, projectId, project.brief))
            ? project.folder
            : null,
        );
      }

      const copies = new Map<string, string[]>();
      let newFolder: string | null | undefined;
      for (const { file, to } of choice.placements) {
        if (to === null) continue;
        let folder: string | null;
        if (to === "new") {
          if (newFolder === undefined) {
            const name = choice.newProjectName.trim() || "Imported files";
            const created = await createNew({ environmentId, input: { name } });
            newFolder = created._tag === "Success" ? created.value.workspaceRoot : null;
            const newId = created._tag === "Success" ? created.value.projectId : null;
            if (newFolder !== null && !(await saveProject(name, newFolder, newId)))
              newFolder = null;
          }
          folder = newFolder;
        } else {
          folder = folders[to] ?? null;
        }
        if (folder !== null) copies.set(folder, [...(copies.get(folder) ?? []), file.path]);
      }
      const bridge = readStudioImport();
      if (bridge !== null) {
        for (const [folder, sources] of copies) await bridge.copy(sources, folder).catch(() => []);
      }
      return { made, first };
    },
    [register, createNew, save, knownFolders, environmentId],
  );
}
