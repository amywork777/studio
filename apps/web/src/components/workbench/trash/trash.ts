import type { StudioProject, StudioTrashedProject } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";

type Projects = Readonly<Record<string, StudioProject>>;
type Trashed = Readonly<Record<string, StudioTrashedProject>>;

/** Every folder the projects hold, as keys (`studioFolderKey`). */
const heldBy = (projects: ReadonlyArray<StudioProject>) =>
  new Set(projects.flatMap((project) => project.folders.map(studioFolderKey)));

/**
 * The folders only projects in Trash hold, as keys (`studioFolderKey`): what every list of folders
 * leaves out, with their chats, while those projects are in Trash. A folder a project not in Trash
 * holds too is not one. Both `hiddenByTrash` and the thread sidebar (`useStudioSidebarGroups`) go by it.
 */
export function trashOnlyFolders(trashed: Trashed, projects: Projects): ReadonlySet<string> {
  const live = heldBy(Object.values(projects));
  return new Set([...heldBy(Object.values(trashed))].filter((key) => !live.has(key)));
}

/**
 * T3's own lists (the command palette) without the folders in `hidden` (`trashOnlyFolders`) on
 * `environmentId`, and without their threads. Folders on other environments are never hidden.
 * With nothing hidden, the lists come back as given.
 */
export function withoutTrashedFolders<
  P extends { readonly id: string; readonly environmentId: string; readonly workspaceRoot: string },
  T extends { readonly environmentId: string; readonly projectId: string },
>(
  projects: ReadonlyArray<P>,
  threads: ReadonlyArray<T>,
  hidden: ReadonlySet<string>,
  environmentId: string | null,
): { readonly projects: ReadonlyArray<P>; readonly threads: ReadonlyArray<T> } {
  if (hidden.size === 0 || environmentId === null) return { projects, threads };
  const gone = new Set(
    projects
      .filter(
        (project) =>
          project.environmentId === environmentId &&
          hidden.has(studioFolderKey(project.workspaceRoot)),
      )
      .map((project) => project.id),
  );
  if (gone.size === 0) return { projects, threads };
  return {
    projects: projects.filter(
      (project) => project.environmentId !== environmentId || !gone.has(project.id),
    ),
    threads: threads.filter(
      (thread) => thread.environmentId !== environmentId || !gone.has(thread.projectId),
    ),
  };
}

/**
 * The folders and chats Studio lists once Trash has projects in it (`useProjectList`): a folder
 * that only projects in Trash hold goes (`trashOnlyFolders`), with its chats, so a trashed project
 * leaves Home, Projects (its folder is not offered as one in no project), Chats, the sidebar and
 * ⌘K. With nothing hidden, the lists come back as given.
 */
export function hiddenByTrash<
  F extends { readonly id: string; readonly workspaceRoot: string },
  C extends { readonly projectId: string },
>(
  folders: ReadonlyArray<F>,
  chats: ReadonlyArray<C>,
  trashed: Trashed,
  projects: Projects,
): { readonly folders: ReadonlyArray<F>; readonly chats: ReadonlyArray<C> } {
  const hidden = trashOnlyFolders(trashed, projects);
  if (hidden.size === 0) return { folders, chats };
  const hiddenIds = new Set(
    folders
      .filter((folder) => hidden.has(studioFolderKey(folder.workspaceRoot)))
      .map((folder) => folder.id),
  );
  if (hiddenIds.size === 0) return { folders, chats };
  return {
    folders: folders.filter((folder) => !hiddenIds.has(folder.id)),
    chats: chats.filter((chat) => !hiddenIds.has(chat.projectId)),
  };
}

/** Trash's projects with their ids, the last moved there first, as the Trash page lists them. */
export function inTrashOrder(
  trashed: Trashed,
): Array<StudioTrashedProject & { readonly id: string }> {
  return Object.entries(trashed)
    .map(([id, project]) => ({ ...project, id }))
    .toSorted((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

/**
 * Move to Trash, as a project's menus offer it: moves the project and says "Moved <name> to
 * Trash" (`say`), whose Undo restores it under the same id, its chats listed again. Resolves to
 * whether it moved; a move that fails says nothing here (the command reports it).
 */
export async function trashWithUndo(input: {
  readonly id: string;
  readonly name: string;
  readonly trash: (id: string) => Promise<boolean>;
  readonly restore: (id: string) => Promise<boolean>;
  readonly say: (toast: { readonly title: string; readonly undo: () => Promise<boolean> }) => void;
}): Promise<boolean> {
  if (!(await input.trash(input.id))) return false;
  input.say({ title: `Moved ${input.name} to Trash`, undo: () => input.restore(input.id) });
  return true;
}

/**
 * Files on disk stay. A folder another project holds (in Trash or not) keeps its chats, and one the
 * environment no longer knows is passed over. If a folder cannot be deleted the record stays, to
 * try again. Resolves to whether it is gone.
 */
export async function deleteForever<F extends { readonly workspaceRoot: string }>(input: {
  readonly id: string;
  readonly projects: Projects;
  readonly trashed: Trashed;
  readonly knownFolders: ReadonlyArray<F>;
  readonly deleteFolder: (folder: F) => Promise<boolean>;
  readonly purge: (id: string) => Promise<boolean>;
}): Promise<boolean> {
  const project = input.trashed[input.id];
  if (project === undefined) return false;
  const others = heldBy([
    ...Object.values(input.projects),
    ...Object.entries(input.trashed).flatMap(([id, other]) => (id === input.id ? [] : [other])),
  ]);
  const own = new Set(project.folders.map(studioFolderKey).filter((key) => !others.has(key)));
  for (const folder of input.knownFolders) {
    if (!own.has(studioFolderKey(folder.workspaceRoot))) continue;
    if (!(await input.deleteFolder(folder))) return false;
  }
  return input.purge(input.id);
}
