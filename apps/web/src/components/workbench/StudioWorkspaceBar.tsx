import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { MessageSquareIcon } from "lucide-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { KIND_TINT } from "./kinds";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { useStudioProjectAt } from "./useStudioProjects";
import { chatLabel, workspaceTitle } from "./workspaceTitle";

/** How a workspace names its project: its folder and its name, as the sidebar names it. */
export function useProjectHeading(
  environmentId: EnvironmentId,
  project: EnvironmentProject | null,
) {
  const folder = project?.workspaceRoot ?? null;
  const studio = useStudioProjectAt(environmentId, folder);
  const title = workspaceTitle(studio?.project.name ?? null, folder);
  return { folder, title };
}

/**
 * The start of a workspace's top bar: the project switcher, then the open chat. Short of room the
 * switcher stops at about half the row and the chat's name, then its icon, gives way, wrapping out
 * rather than clipping. Under 16rem the chat is left out, since a name cut to one letter names
 * nothing.
 */
export function StudioWorkspaceBar(props: {
  readonly environmentId: EnvironmentId;
  readonly project: EnvironmentProject | null;
  /** The open chat's title. */
  readonly chatTitle: string;
}) {
  const { folder, title } = useProjectHeading(props.environmentId, props.project);

  return (
    <nav
      aria-label="Where you are"
      className="@container/where flex h-10 min-w-0 flex-1 flex-wrap content-start items-center gap-1 overflow-hidden py-0.5"
    >
      <ProjectSwitcher environmentId={props.environmentId} folder={folder} title={title} />
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-current="page"
              className="hidden max-w-fit min-w-6 flex-[1_1_1.5rem] items-center gap-2 overflow-hidden px-1 text-sm font-medium text-foreground @min-[16rem]/where:flex"
            />
          }
        >
          <MessageSquareIcon className={`size-4 shrink-0 ${KIND_TINT}`} aria-hidden="true" />
          <span className="truncate">{chatLabel(props.chatTitle)}</span>
        </TooltipTrigger>
        <TooltipPopup side="bottom">{chatLabel(props.chatTitle)}</TooltipPopup>
      </Tooltip>
    </nav>
  );
}
