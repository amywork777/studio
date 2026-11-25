import { FileCodeIcon, LayoutDashboardIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ProjectView } from "./projectView";

const VIEWS = [
  { view: "project", label: "Overview", Icon: LayoutDashboardIcon },
  { view: "source", label: "Source", Icon: FileCodeIcon },
] as const;

/**
 * The Overview tab, pinned ahead of the panel's tabs: it cannot be closed or dragged. With code
 * tools (`both`) Source sits beside it; in the engineering interface alone it is the first of the
 * tabs, drawn as they are (`brand/theme.css`), its icon in the brand's color beside its name.
 */
export function PinnedProjectTab(props: {
  /** Whether the project's surface is the panel's active one. */
  readonly active: boolean;
  readonly view: ProjectView;
  readonly withSource: boolean;
  readonly onSelect: (view: ProjectView) => void;
}) {
  // Studio moves focus here itself (opening a tab, closing Find), and a focus-opened tooltip then
  // stays over the panel: it opens on hover alone. The tab's name already says what it is.
  const [tip, setTip] = useState(false);
  if (!props.withSource) {
    const pressed = props.active && props.view === "project";
    return (
      <Tooltip
        open={tip}
        onOpenChange={(open, details) => {
          if (!open || details.reason !== "trigger-focus") setTip(open);
        }}
      >
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Overview"
              aria-pressed={pressed}
              data-pinned-project-tab=""
              data-active-tab={pressed}
              onClick={() => props.onSelect("project")}
              className="flex shrink-0 cursor-pointer items-center justify-center text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            />
          }
        >
          <LayoutDashboardIcon className="size-3.5 text-primary" aria-hidden="true" />
          <span>Overview</span>
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
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
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
