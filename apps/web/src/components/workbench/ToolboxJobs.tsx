import { type LucideIcon } from "lucide-react";
import { useId } from "react";

import { cn } from "~/lib/utils";
import {
  RICH_TOOLTIP_DELAY,
  Tooltip,
  TooltipPopup,
  TooltipRich,
  TooltipTrigger,
} from "../ui/tooltip";
import type { HardwareAction } from "./hardwareActions";
import type { ToolboxSection } from "./toolbox";
import { GROUP_LABEL } from "./studioLayout";
import { MENU_TINTS } from "./kinds";
import { toolIcon } from "./toolIcons";

/** Two even tiles to a row (`SectionJobs`). */
const TOOL_GRID = "grid grid-cols-2 gap-x-2 gap-y-3";

/**
 * The sections of a group (`StudioToolbox`), on their tiles' two columns, so a tile is one size in
 * any of them. `pairLoneSections` gives them in the order that fills it.
 */
export const SECTION_GRID = "grid min-w-0 grid-cols-2 gap-x-2 gap-y-4";

/**
 * A section's jobs as tool tiles under its title, always open like every other. It takes the full
 * width of `SECTION_GRID`; with one tile, only that tile's column, and shares the row with the next
 * such section. A title on two lines there keeps the tiles of the row level.
 */
export function SectionJobs(props: {
  readonly section: ToolboxSection;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  readonly onRun: (action: HardwareAction) => void;
}) {
  const lone = props.section.actions.length === 1;
  return (
    <section
      aria-label={props.section.title}
      className={cn("flex min-w-0 flex-col gap-2", !lone && "col-span-2")}
    >
      <h4 className={GROUP_LABEL}>{props.section.title}</h4>
      <div className={lone ? "mt-auto grid grid-cols-1" : TOOL_GRID}>
        {props.section.actions.map((action) => (
          <ToolTile
            key={action.id}
            action={action}
            icon={toolIcon(action)}
            disabled={props.disabled}
            onRun={() => props.onRun(action)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * A job as a tool to pick up: a square tile, its own picture (`toolIcon`) in its tab's hue over its
 * name in three lines' room, so a long name is read whole and names of any length sit level across a row. Its name and
 * what it makes show on a pause over it and is the tile's description for readers. A press sends
 * the job (`onRun`).
 */
function ToolTile(props: {
  readonly action: HardwareAction;
  /** Its picture (`toolIcon`). */
  readonly icon: LucideIcon;
  readonly disabled: boolean;
  readonly onRun: () => void;
}) {
  const { action, icon: Icon } = props;
  const describedBy = useId();
  return (
    <Tooltip>
      <TooltipTrigger
        delay={RICH_TOOLTIP_DELAY}
        render={
          <button
            type="button"
            disabled={props.disabled}
            onClick={props.onRun}
            aria-describedby={describedBy}
            className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background p-2 text-center outline-none transition-[border-color,background-color,scale] duration-150 dark:bg-input/32 enabled:hover:border-foreground/25 enabled:hover:bg-accent/50 dark:enabled:hover:bg-input/64 enabled:active:scale-97 enabled:active:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-64 motion-reduce:transition-none motion-reduce:enabled:active:scale-100"
          />
        }
      >
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-md bg-current/10 dark:bg-current/15 ${MENU_TINTS[action.group]}`}
        >
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </span>
        <span className="line-clamp-3 h-[3lh] w-full text-xs leading-tight font-medium text-foreground">
          {action.label}
        </span>
        <span id={describedBy} hidden>
          {action.gets}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="left">
        <TooltipRich title={action.label} description={action.gets} />
      </TooltipPopup>
    </Tooltip>
  );
}
