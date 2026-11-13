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
import { jobLine, type HardwareAction } from "./hardwareActions";
import type { NewTemplate } from "./newTemplates";
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
  /**
   * Why a job can't run on the file in front, by what it works on (`toolboxWorksOn`); null for one
   * that can. Its tile stays where it is, dimmed, and says so on a pause over it.
   */
  readonly worksOn: (action: HardwareAction) => string | null;
  /**
   * New's start for what a job works on, where the project has none of it (`toolboxStart`): its
   * dimmed tile takes a press then, and opens New there (`onStart`).
   */
  readonly startFor: (action: HardwareAction) => NewTemplate | null;
  readonly onRun: (action: HardwareAction) => void;
  readonly onStart: (template: NewTemplate) => void;
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
            worksOn={props.worksOn(action)}
            start={props.startFor(action)}
            onRun={() => props.onRun(action)}
            onStart={props.onStart}
          />
        ))}
      </div>
    </section>
  );
}

/** A tile's box, and how one that can be pressed answers the pointer. */
const TILE =
  "flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background p-2 text-center outline-none transition-[border-color,background-color,scale] duration-150 dark:bg-input/32 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-64 motion-reduce:transition-none";
const TILE_LIVE =
  "enabled:hover:border-foreground/25 enabled:hover:bg-accent/50 dark:enabled:hover:bg-input/64 enabled:active:scale-97 enabled:active:bg-accent motion-reduce:enabled:active:scale-100";

/**
 * A job's square tile: its picture in its tab's hue over its name, with three lines' room so names
 * of any length sit level across a row. A job that does not fit the file in front (`worksOn`) is
 * dimmed, takes no press and says what it works on; with `start`, a press opens New instead.
 */
function ToolTile(props: {
  readonly action: HardwareAction;
  /** Its picture (`toolIcon`). */
  readonly icon: LucideIcon;
  readonly disabled: boolean;
  readonly worksOn: string | null;
  readonly start: NewTemplate | null;
  readonly onRun: () => void;
  readonly onStart: (template: NewTemplate) => void;
}) {
  const { action, icon: Icon, worksOn, start } = props;
  const describedBy = useId();
  const fits = worksOn === null;
  // Dimmed either way; a start is still pressed, the way to make what the job works on.
  const starts = !fits && start !== null;
  return (
    <Tooltip>
      <TooltipTrigger
        delay={RICH_TOOLTIP_DELAY}
        render={
          // A disabled button takes no pointer, so one that does not fit is only marked disabled
          // and its tooltip can still say why.
          <button
            type="button"
            disabled={fits && props.disabled}
            aria-disabled={fits || starts ? undefined : true}
            onClick={fits ? props.onRun : starts ? () => props.onStart(start) : undefined}
            aria-describedby={describedBy}
            className={cn(
              TILE,
              fits ? TILE_LIVE : starts ? cn(TILE_LIVE, "opacity-64") : "cursor-default opacity-64",
            )}
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
          {worksOn ?? jobLine(action)}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="left">
        <TooltipRich
          title={action.label}
          description={jobLine(action)}
          {...(worksOn === null ? {} : { note: worksOn })}
        />
      </TooltipPopup>
    </Tooltip>
  );
}
