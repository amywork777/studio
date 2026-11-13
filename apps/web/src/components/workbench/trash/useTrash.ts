import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, StudioTrashedProject } from "@t3tools/contracts";

import { useComposerDraftStore } from "~/composerDraftStore";
import { releaseProjectDraftUploads } from "~/lib/composerDraftUploads";
import { projectEnvironment } from "~/state/projects";
import { studioProjectsEnvironment } from "~/state/studioProjects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { toastManager } from "../../ui/toast";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { STUDIO_INTERFACE_AVAILABLE } from "../studioInterface";
import { useEnvironmentFolders } from "../useProjectFolders";
import { useStudioProjects, useStudioProjectsList } from "../useStudioProjects";
import { deleteForever, trashOnlyFolders, trashWithUndo } from "./trash";

const NONE: Readonly<Record<string, StudioTrashedProject>> = {};

/** An environment's projects in Trash, by id; none while the list loads. */
export function useTrashedProjects(
  environmentId: EnvironmentId | null,
): Readonly<Record<string, StudioTrashedProject>> {
  return useStudioProjectsList(environmentId).data?.trashed ?? NONE;
}

/**
 * The folders (as keys) that only projects in Trash hold on the primary environment, which every
 * list of folders and chats leaves out: Studio's pages, the sidebar and the command palette, in
 * every interface wherever Studio's interface is available. Empty elsewhere.
 */
export function useTrashHiddenFolderKeys(): ReadonlySet<string> {
  const environmentId = usePrimaryEnvironmentId();
  const readEnvironmentId = STUDIO_INTERFACE_AVAILABLE ? environmentId : null;
  const projects = useStudioProjects(readEnvironmentId);
  const trashed = useTrashedProjects(readEnvironmentId);
  return trashOnlyFolders(trashed, projects);
}

/** Each action resolves to whether it happened and reports its own failure. */
export function useTrash(environmentId: EnvironmentId) {
  const run = useAtomCommand(studioProjectsEnvironment.trash, { reportFailure: true });
  const deleteProject = useOrchestrationCommand(projectEnvironment.delete, {
    reportFailure: true,
  });
  const { data, refresh } = useStudioProjectsList(environmentId);
  const knownFolders = useEnvironmentFolders(environmentId);

  const step = async (id: string, action: "trash" | "restore" | "purge") => {
    const result = await run({ environmentId, input: { id, action } });
    if (result._tag !== "Success") return false;
    refresh();
    return true;
  };
  const restoreProject = (id: string) => step(id, "restore");
  const trashProject = (id: string, name: string) =>
    trashWithUndo({
      id,
      name,
      trash: (each) => step(each, "trash"),
      restore: restoreProject,
      say: ({ title, undo }) => {
        const toastId = toastManager.add({
          type: "success",
          title,
          description: "Its chats that are running keep going.",
          actionProps: {
            children: "Undo",
            onClick: () => {
              toastManager.close(toastId);
              void undo();
            },
          },
        });
      },
    });
  const deleteProjectForever = (id: string) =>
    deleteForever({
      id,
      projects: data?.projects ?? {},
      trashed: data?.trashed ?? NONE,
      knownFolders,
      deleteFolder: async (folder) => {
        const result = await deleteProject({
          environmentId,
          // Forced: its chats go with it, as Delete forever says.
          input: { projectId: folder.id, force: true },
        });
        if (result._tag !== "Success") return false;
        const projectRef = scopeProjectRef(environmentId, folder.id);
        releaseProjectDraftUploads(projectRef);
        const drafts = useComposerDraftStore.getState();
        const draft = drafts.getDraftThreadByProjectRef(projectRef);
        if (draft) drafts.clearDraftThread(draft.draftId);
        drafts.clearProjectDraftThreadId(projectRef);
        return true;
      },
      purge: (each) => step(each, "purge"),
    });
  return { trashProject, restoreProject, deleteForever: deleteProjectForever };
}
