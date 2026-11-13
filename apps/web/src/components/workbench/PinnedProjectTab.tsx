import { FileCodeIcon, LayoutDashboardIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ProjectView } from "./projectView";

const VIEWS = [
  { view: "project", label: "Project", Icon: LayoutDashboardIcon },
  { view: "source", label: "Source", Icon: FileCodeIcon },
] as const;

/**
 * The Project tab, pinned ahead of the panel's tabs: it cannot be closed or dragged. With code
 * tools (`both`) Source sits beside it; in the engineering interface alone it shows its icon only,
 * as a browser pins a tab.
 */
export function PinnedProjectTab(props: {
  /** Whether the project's surface is the panel's active one. */
  readonly active: boolean;
  readonly view: ProjectView;
  readonly withSource: boolean;
  readonly onSelect: (view: ProjectView) => void;
}) {
  if (!props.withSource) {
    const pressed = props.active && props.view === "project";
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Overview"
              aria-pressed={pressed}
              data-pinned-project-tab=""
              data-active-tab={pressed}
              onClick={() => props.onSelect("project")}
              className="flex shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            />
          }
        >
          <LayoutDashboardIcon className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Overview, everything in the project</TooltipPopup>
      </Tooltip>
    );
  }
  const views = VIEWS;
  return (
    <div className="flex shrink-0 items-center gap-0.5 pe-1.5" data-pinned-project-tab="">
      {views.map(({ view, label, Icon }) => {
        const pressed = props.active && props.view === view;
        return (
          <button
            key={view}
            type="button"
            aria-pressed={pressed}
            onClick={() => props.onSelect(view)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              pressed
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
      <span aria-hidden="true" className="ms-1 h-4 w-px bg-border" />
    </div>
  );
}
