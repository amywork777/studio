import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronDownIcon, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import type { HardwareAction } from "./hardwareActions";
import { entryOfAction, plainPrompt } from "./library/libraryCatalog";
import { LibraryPicture } from "./library/LibraryPicture";
import { TOOLBOX_TINTS, toolboxTabOf, worksOnWords } from "./toolbox";
import type { NewTemplate } from "./newTemplates";
import type { ToolboxSection } from "./toolbox";
import { PinStar } from "./PinStar";
import { GROUP_LABEL } from "./studioLayout";
import { toolIcon } from "./toolIcons";

/**
 * The sections of a tab (`StudioToolbox`), one under the next: each tool is a row wide enough to
 * say what it makes, never a name alone. (`pairLoneSections` gives them in a steady order.)
 */
export const SECTION_GRID = "flex min-w-0 flex-col gap-4";

/**
 * A section's jobs as tool rows under its title, always open like every other: each says what it
 * makes, runs from its Run, and opens its details (`ToolDetails`) from its name.
 */
export function SectionJobs(props: {
  readonly section: ToolboxSection;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  /**
   * Why a job can't run on the file in front, by what it works on (`toolboxWorksOn`); null for one
   * that can. Its row stays where it is, its Run dimmed, and it says so.
   */
  readonly worksOn: (action: HardwareAction) => string | null;
  /**
   * New's start for what a job works on, where the project has none of it (`toolboxStart`): its
   * Run is Start then, and opens New there (`onStart`).
   */
  readonly startFor: (action: HardwareAction) => NewTemplate | null;
  readonly onRun: (action: HardwareAction) => void;
  readonly onStart: (template: NewTemplate) => void;
  /** Each row carries its star (`PinStar`). */
  readonly pinnable?: boolean;
  /** The part a job would run on, by its name, for what Run asks; null with none open. */
  readonly partName?: string | null;
  readonly environmentId?: EnvironmentId | null;
}) {
  return (
    <section aria-label={props.section.title} className="flex min-w-0 flex-col gap-1">
      <h4 className={cn(GROUP_LABEL, "px-1")}>{props.section.title}</h4>
      <ul className="flex min-w-0 flex-col gap-0.5">
        {props.section.actions.map((action) => (
          <li key={action.id}>
            <ToolRow
              action={action}
              icon={toolIcon(action)}
              disabled={props.disabled}
              worksOn={props.worksOn(action)}
              start={props.startFor(action)}
              onRun={() => props.onRun(action)}
              onStart={props.onStart}
              pinnable={props.pinnable === true}
              partName={props.partName ?? null}
              environmentId={props.environmentId ?? null}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A job's row: its picture in its tab's hue, its name over what it makes, and Run. A press on the
 * name opens what it takes in and gives out (`ToolDetails`). A job that does not fit the file in
 * front says what it works on and its Run is dimmed; with `start`, Run is Start and opens New.
 */
function ToolRow(props: {
  readonly action: HardwareAction;
  /** Its picture (`toolIcon`). */
  readonly icon: LucideIcon;
  readonly disabled: boolean;
  readonly worksOn: string | null;
  readonly start: NewTemplate | null;
  readonly onRun: () => void;
  readonly onStart: (template: NewTemplate) => void;
  readonly pinnable: boolean;
  readonly partName: string | null;
  readonly environmentId: EnvironmentId | null;
}) {
  const { action, icon: Icon, worksOn, start } = props;
  const [open, setOpen] = useState(false);
  const describedBy = useId();
  const detailsId = useId();
  const fits = worksOn === null;
  const starts = !fits && start !== null;
  return (
    <div
      className={cn(
        "group/pin flex min-w-0 flex-col rounded-lg border transition-colors duration-150 motion-reduce:transition-none",
        open ? "border-border bg-card" : "border-transparent hover:bg-accent/40",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5 p-1.5">
        <button
          type="button"
          aria-label={action.label}
          aria-expanded={open}
          aria-controls={detailsId}
          aria-describedby={describedBy}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg bg-current/10 dark:bg-current/15",
              TOOLBOX_TINTS[toolboxTabOf(action)],
              !fits && "opacity-64",
            )}
          >
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1 text-sm leading-tight font-medium text-foreground">
              {action.label}
              <ChevronDownIcon
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                  open && "rotate-180",
                )}
              />
            </span>
            <span id={describedBy} className="text-xs leading-snug text-muted-foreground">
              {worksOn ?? action.gets}
            </span>
          </span>
        </button>
        {props.pinnable ? (
          <span className="relative mt-0.5 h-6 w-7 shrink-0">
            <PinStar jobId={action.id} name={action.label} />
          </span>
        ) : null}
        <Button
          size="sm-pill"
          variant="secondary"
          aria-label={`${starts ? "Start" : "Run"} ${action.label}`}
          disabled={starts ? false : !fits || props.disabled}
          onClick={starts ? () => props.onStart(start) : props.onRun}
        >
          {starts ? "Start" : "Run"}
        </Button>
      </div>
      {open ? (
        <ToolDetails
          id={detailsId}
          action={action}
          worksOn={worksOn}
          partName={props.partName}
          environmentId={props.environmentId}
        />
      ) : null}
    </div>
  );
}

/**
 * How a job works, under its row: its example result (its Library cover, drawn from the examples'
 * own files), what it works on, what to give it, what it makes and what it needs, and what Run asks
 * the AI agent, word for word, for the part in front.
 */
function ToolDetails(props: {
  readonly id: string;
  readonly action: HardwareAction;
  readonly worksOn: string | null;
  readonly partName: string | null;
  readonly environmentId: EnvironmentId | null;
}) {
  const { action } = props;
  const entry = entryOfAction(action.id);
  const rows: ReadonlyArray<readonly [string, string]> = [
    ["Works on", worksOnWords(action)],
    ...(entry === null ? [] : [["You give", entry.give] as const]),
    ["You get", action.gets],
    ...(action.needs === undefined ? [] : [["Needs", action.needs] as const]),
  ];
  return (
    <div id={props.id} className="flex min-w-0 flex-col gap-3 px-2.5 pb-3">
      {entry === null || props.environmentId === null ? null : (
        <figure className="flex flex-col gap-1">
          <LibraryPicture
            entry={entry}
            environmentId={props.environmentId}
            className="w-full rounded-md border border-border"
          />
          <figcaption className="text-xs text-muted-foreground">Example result</figcaption>
        </figure>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {props.worksOn === null && props.partName !== null ? (
        <p className="text-xs text-muted-foreground">
          Run asks the AI agent:{" "}
          <span className="text-foreground">“{plainPrompt(action.prompt(props.partName))}”</span>
        </p>
      ) : null}
    </div>
  );
}
