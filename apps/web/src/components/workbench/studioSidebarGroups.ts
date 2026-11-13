import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { studioFolderKey, studioProjectAt } from "@t3tools/shared/studioProjects";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEngineeringSurfaces } from "./studioInterface";
import { useTrashHiddenFolderKeys } from "./trash/useTrash";
import { useStudioProjects } from "./useStudioProjects";

const NO_PROJECTS: Readonly<Record<string, StudioProject>> = {};

/**
 * Each merged entry keeps its first folder's key, so order, folding and settings stay that folder's.
 * Folders on other environments stay as they are; folders in `hidden` (`trashOnlyFolders`) are left
 * out with their threads.
 */
export function mergeStudioProjectGroups(
  groups: ReadonlyArray<SidebarProjectSnapshot>,
  projects: Readonly<Record<string, StudioProject>>,
  environmentId: EnvironmentId,
  hidden: ReadonlySet<string> = new Set(),
): SidebarProjectSnapshot[] {
  const merged: SidebarProjectSnapshot[] = [];
  const indexById = new Map<string, number>();
  for (const group of groups) {
    const member = group.isScratch
      ? undefined
      : group.memberProjects.find((project) => project.environmentId === environmentId);
    if (member !== undefined && hidden.has(studioFolderKey(member.workspaceRoot))) continue;
    const match = member === undefined ? null : studioProjectAt(projects, member.workspaceRoot);
    if (match === null) {
      merged.push(group);
      continue;
    }
    const index = indexById.get(match.id);
    if (index === undefined) {
      indexById.set(match.id, merged.length);
      merged.push({ ...group, displayName: match.project.name });
      continue;
    }
    const into = merged[index]!;
    merged[index] = {
      ...into,
      groupedProjectCount: into.groupedProjectCount + group.groupedProjectCount,
      environmentPresence:
        into.environmentPresence === group.environmentPresence ? into.environmentPresence : "mixed",
      allRemoteMembersAreDesktopLocal:
        into.allRemoteMembersAreDesktopLocal && group.allRemoteMembersAreDesktopLocal,
      allRemoteMembersAreWsl: into.allRemoteMembersAreWsl && group.allRemoteMembersAreWsl,
      memberProjects: [...into.memberProjects, ...group.memberProjects],
      memberProjectRefs: [...into.memberProjectRefs, ...group.memberProjectRefs],
      remoteEnvironmentLabels: [
        ...new Set([...into.remoteEnvironmentLabels, ...group.remoteEnvironmentLabels]),
      ],
    };
  }
  return merged;
}

/**
 * The sidebar's groups, gathered into Studio projects while the engineering surfaces are on; the
 * folders only projects in Trash hold are left out in every interface.
 */
export function useStudioSidebarGroups(
  groups: ReadonlyArray<SidebarProjectSnapshot>,
): ReadonlyArray<SidebarProjectSnapshot> {
  const engineering = useEngineeringSurfaces();
  const environmentId = usePrimaryEnvironmentId();
  const projects = useStudioProjects(engineering ? environmentId : null);
  const hidden = useTrashHiddenFolderKeys();
  if (environmentId === null) return groups;
  const shownProjects = engineering ? projects : NO_PROJECTS;
  return Object.keys(shownProjects).length > 0 || hidden.size > 0
    ? mergeStudioProjectGroups(groups, shownProjects, environmentId, hidden)
    : groups;
}
