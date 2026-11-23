import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { HomeIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
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
 * The start of the window's strip in a workspace, a breadcrumb: Home, then the project, whose name
 * opens its Overview and whose chevron switches project (`ProjectSwitcher`). The open chat names itself in its own column (`ChatTitleRow`).
 */
export function StudioWorkspaceBar(props: {
  readonly environmentId: EnvironmentId;
  readonly project: EnvironmentProject | null;
  /** The open chat's title, which the chat column shows (`ChatTitleRow`). */
  readonly chatTitle: string;
}) {
  const { folder, title } = useProjectHeading(props.environmentId, props.project);
  const navigate = useNavigate();

  return (
    <nav aria-label="Where you are" className="flex h-10 min-w-0 flex-1 items-center gap-1">
      {/* Home, then the project: a breadcrumb, as text-to-cad's web viewer has it. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost-muted"
              size="icon-sm"
              aria-label="Home"
              onClick={() => void navigate({ to: "/" })}
            />
          }
        >
          <HomeIcon />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Home</TooltipPopup>
      </Tooltip>
      <span aria-hidden="true" className="text-xs text-muted-foreground/60">
        /
      </span>
      <ProjectSwitcher environmentId={props.environmentId} folder={folder} title={title} />
    </nav>
  );
}
