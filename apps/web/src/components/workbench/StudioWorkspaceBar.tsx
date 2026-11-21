import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { useStudioProjectAt } from "./useStudioProjects";
import { workspaceTitle } from "./workspaceTitle";

/** How a workspace names its project: its folder and its name, as the sidebar names it. */
function useProjectHeading(environmentId: EnvironmentId, project: EnvironmentProject | null) {
  const folder = project?.workspaceRoot ?? null;
  const studio = useStudioProjectAt(environmentId, folder);
  const title = workspaceTitle(studio?.project.name ?? null, folder);
  return { folder, title };
}

/**
 * The start of the window's strip in a workspace: the project switcher, which says what everything
 * to its right is about. The open chat names itself in its own column (`ChatTitleRow`).
 */
export function StudioWorkspaceBar(props: {
  readonly environmentId: EnvironmentId;
  readonly project: EnvironmentProject | null;
  /** The open chat's title, which the chat column shows (`ChatTitleRow`). */
  readonly chatTitle: string;
}) {
  const { folder, title } = useProjectHeading(props.environmentId, props.project);

  return (
    <nav aria-label="Where you are" className="flex h-10 min-w-0 flex-1 items-center gap-1">
      <ProjectSwitcher environmentId={props.environmentId} folder={folder} title={title} />
    </nav>
  );
}
