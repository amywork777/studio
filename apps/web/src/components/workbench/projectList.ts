import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";

import type { OpenedThreads } from "./openedThreads";

/** The folder's project record, by path; null when the environment does not know it. */
export function folderProject(
  folders: ReadonlyArray<EnvironmentProject>,
  folder: string,
): EnvironmentProject | null {
  const key = studioFolderKey(folder);
  return folders.find((project) => studioFolderKey(project.workspaceRoot) === key) ?? null;
}

/** When one of the threads was last open on this device; null when none has been. */
function lastOpened(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  opened: OpenedThreads,
): string | null {
  let last: string | null = null;
  for (const thread of threads) {
    const at = opened[scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))];
    if (at !== undefined && (last === null || at > last)) last = at;
  }
  return last;
}

/** Last opened on this device or last worked on, whichever came later: what a list is ordered by. */
export function lastTouched(card: Pick<ListedProject, "latest" | "opened">): string {
  return card.opened !== null && card.opened > card.latest ? card.opened : card.latest;
}

/** When the threads were last worked on, or `since` when none has been. */
function newestOf(threads: ReadonlyArray<EnvironmentThreadShell>, since: string): string {
  return threads.reduce(
    (newest, thread) => (thread.updatedAt > newest ? thread.updatedAt : newest),
    since,
  );
}

export interface ListedProject {
  readonly id: string;
  readonly project: StudioProject;
  /** Its first folder's record, where a thread on it starts; null until the folder is known. */
  readonly folder: EnvironmentProject | null;
  /** The records of all its folders that are known. */
  readonly folders: ReadonlyArray<EnvironmentProject>;
  /** The live threads in any of its folders. */
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  /** When it was last worked on. */
  readonly latest: string;
  /** When one of its chats was last open on this device; null when none has been. */
  readonly opened: string | null;
}

export interface ListedFolder {
  readonly folder: EnvironmentProject;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly latest: string;
}

/**
 * Projects with the live threads in their folders, the one last opened on this
 * device (or worked on, if that came later) first, as a recents list orders
 * them; then the folders in no project, most recently worked on first.
 */
export function listProjects(
  projects: Readonly<Record<string, StudioProject>>,
  knownFolders: ReadonlyArray<EnvironmentProject>,
  threads: ReadonlyArray<EnvironmentThreadShell>,
  environmentId: EnvironmentId,
  opened: OpenedThreads = {},
): { readonly cards: ListedProject[]; readonly loose: ListedFolder[] } {
  const live = threads.filter(
    (thread) => thread.archivedAt === null && thread.environmentId === environmentId,
  );
  const threadsIn = (folder: EnvironmentProject | null) =>
    folder === null ? [] : live.filter((thread) => thread.projectId === folder.id);
  const grouped = new Set<string>();
  const cards: ListedProject[] = Object.entries(projects)
    .map(([id, project]) => {
      const folders = project.folders.flatMap((folder) => {
        grouped.add(studioFolderKey(folder));
        const record = folderProject(knownFolders, folder);
        return record === null ? [] : [record];
      });
      const own = folders.flatMap(threadsIn);
      const first = project.folders[0];
      return {
        id,
        project,
        folder: first === undefined ? null : folderProject(knownFolders, first),
        folders,
        threads: own,
        latest: newestOf(own, project.createdAt),
        opened: lastOpened(own, opened),
      };
    })
    .toSorted((a, b) => lastTouched(b).localeCompare(lastTouched(a)));
  const loose: ListedFolder[] = knownFolders
    .filter((folder) => !grouped.has(studioFolderKey(folder.workspaceRoot)))
    .map((folder) => {
      const own = threadsIn(folder);
      return { folder, threads: own, latest: newestOf(own, folder.createdAt) };
    })
    .toSorted((a, b) => b.latest.localeCompare(a.latest));
  return { cards, loose };
}
