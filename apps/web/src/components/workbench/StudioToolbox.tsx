import type { ScopedThreadRef } from "@t3tools/contracts";
import { SearchIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { GROUP_PURPOSES, type HardwareAction, type HardwareActionGroup } from "./hardwareActions";
import { MENU_ICONS, MENU_TINTS, MENU_WORDS } from "./kinds";
import { handToChat } from "./handToChat";
import { withToolLine } from "./toolUsed";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { partLink } from "./partLink";
import { lowerName } from "./partNames";
import { useNewDialogStore } from "./newDialogStore";
import type { NewTemplate } from "./newTemplates";
import { usePartForJobs } from "./StudioPanelBar";
import { SECTION_GRID, SectionJobs } from "./ToolboxJobs";
import {
  pairLoneSections,
  pinnedJobs,
  readToolboxTab,
  searchJobs,
  suggestedJobs,
  type ToolboxGroup,
  type ToolboxTab,
  toolboxGroups,
  toolboxLeftOut,
  toolboxLibraryLink,
  toolboxStart,
  toolboxWorksOn,
  writeToolboxTab,
} from "./toolbox";
import { useToolboxOpen } from "./toolboxOpen";
import { useToolboxPins } from "./toolboxPins";
import { ToolboxPopup } from "./ToolboxPopup";
import { useProjectKinds } from "./useLeadPart";
import { useToolboxJobs } from "./useToolboxJobs";

/**
 * Every job the skills can do, for the part in front (`usePartForJobs`): Yours (pinned, and a few
 * made for the part), a tab per group, and a search over all. A job that does not fit is dimmed and
 * says what it works on, or opens New where New makes its input. Hangs under the title bar's button.
 */
export function StudioToolbox(props: {
  readonly threadRef: ScopedThreadRef;
  readonly folder: string | null;
  readonly composerRef: ComposerHandleRef | null;
  /** The thread's workspace changes, which can make the project's first part. */
  readonly mutationId: string | null;
}) {
  const { threadRef, composerRef } = props;
  const { part, process } = usePartForJobs(threadRef, props.folder, props.mutationId);
  const jobs = useToolboxJobs(threadRef.environmentId, process);
  const projectKinds = useProjectKinds(threadRef.environmentId, props.folder, props.mutationId);
  const startFor = (action: HardwareAction) =>
    projectKinds === null ? null : toolboxStart(action, projectKinds);
  const open = useToolboxOpen((state) => state.open);
  const setOpen = useToolboxOpen((state) => state.setOpen);
  const start = (template: NewTemplate) => {
    setOpen(false);
    useNewDialogStore.getState().ask(template.discipline, template.id);
  };
  const groups = toolboxGroups(jobs.menus);

  const navigate = useNavigate();
  const router = useRouter();
  const browse = (group: HardwareActionGroup) => {
    setOpen(false);
    void navigate(
      toolboxLibraryLink(group, {
        workspaceOpen: useOpenWorkspaceStore.getState().workspace !== null,
        from: router.state.location.href,
      }),
    );
  };

  const [tab, setTabState] = useState(() =>
    readToolboxTab(useToolboxPins.getState().pins.length > 0),
  );
  const setTab = (next: ToolboxTab) => {
    setTabState(next);
    writeToolboxTab(next);
  };
  const [query, setQuery] = useState("");
  const pins = useToolboxPins((state) => state.pins);
  const shown = groups.find((group) => group.group === tab);
  const kind = part?.kind ?? null;
  const leftOut = shown === undefined || kind === null ? null : toolboxLeftOut(shown, kind);
  const found = searchJobs(groups, query);
  const searching = query.trim() !== "";
  const worksOn = (action: HardwareAction) => toolboxWorksOn(action, kind, startFor(action));

  const run = (action: HardwareAction) => {
    if (composerRef === null || part === null) return;
    setOpen(false);
    handToChat(composerRef, withToolLine(action.label, action.prompt(partLink(part))));
  };
  const tiles: TileProps = {
    disabled: composerRef === null,
    worksOn,
    startFor,
    onRun: run,
    onStart: start,
    pinnable: true,
  };

  return (
    <ToolboxPopup open={open} onOpenChange={setOpen}>
      {/* Capped by the window, not --available-height: Base UI measures the opening popup with
        that set to max-content, which voids a cap built on it, so it opened at full length. */}
      <div className="flex max-h-[min(40rem,calc(100dvh-var(--workspace-controls-top)-var(--workspace-topbar-height)-0.5rem))] flex-col">
        {/* The title and the groups' tabs on one tinted strip, as the panel's tabs are
          (`brand/theme.css`): the group in front a card in the popup's color, joined to its jobs
          over the strip's bottom edge. The title bar's Toolbox button shuts it, so it has no button
          of its own. */}
        <div className="shrink-0" data-studio-tab-strip="">
          <div className="flex h-11 items-center gap-3 ps-3 pe-2">
            <h2 className="text-sm font-medium text-foreground">Toolbox</h2>
            <InputGroup className="ms-auto max-w-60">
              <InputGroupAddon>
                <SearchIcon
                  className="size-4 text-muted-foreground opacity-100"
                  aria-hidden="true"
                />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                size="sm"
                placeholder="Search tools"
                aria-label="Search tools"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Enter runs the first match that fits the file in front.
                  if (event.key !== "Enter") return;
                  const first = found.find((action) => worksOn(action) === null);
                  if (first !== undefined) run(first);
                }}
              />
            </InputGroup>
          </div>
          <div className="px-2">
            <ToggleGroup
              aria-label="Toolbox group"
              value={searching ? [] : [tab]}
              variant="browser-tab"
              size="tab"
              className="w-full"
              onValueChange={(value) => {
                // Pressing the tab in front clears it: it stays as it is.
                const next = value[0];
                if (next === "Yours" || groups.some((group) => group.group === next)) {
                  setTab(next as ToolboxTab);
                  setQuery("");
                }
              }}
            >
              <ToggleGroupItem value="Yours">
                <StarIcon aria-hidden="true" className="text-primary" />
                Yours
              </ToggleGroupItem>
              {groups.map((group) => {
                const Icon = MENU_ICONS[group.group];
                return (
                  <ToggleGroupItem key={group.group} value={group.group}>
                    <Icon aria-hidden="true" className={MENU_TINTS[group.group]} />
                    {MENU_WORDS[group.group]}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3 p-2">
            {jobs.status === "loading" ? (
              <p className="text-xs text-muted-foreground">Loading jobs…</p>
            ) : jobs.status === "failed" ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-xs text-muted-foreground">Couldn't load the jobs.</p>
                <Button variant="outline" size="sm" onClick={jobs.retry}>
                  Try again
                </Button>
              </div>
            ) : (
              <>
                {part === null ? (
                  <p className="text-xs text-muted-foreground">
                    The Toolbox works on a part you already have. Press a tile to start what it
                    works on, or import a part.
                  </p>
                ) : composerRef === null ? (
                  <p className="text-xs text-muted-foreground">
                    Jobs start in a chat. Open one to use them.
                  </p>
                ) : null}
                {searching ? (
                  found.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">No tools match that.</p>
                  ) : (
                    <div className={SECTION_GRID}>
                      <SectionJobs
                        section={{
                          title: `${found.length} ${found.length === 1 ? "tool" : "tools"}`,
                          actions: found,
                        }}
                        {...tiles}
                      />
                    </div>
                  )
                ) : tab === "Yours" ? (
                  <YourJobs
                    pinned={pinnedJobs(groups, pins)}
                    suggested={suggestedJobs(groups, kind, pins)}
                    partName={part === null ? null : (part.name ?? `this ${lowerName(part.kind)}`)}
                    tiles={tiles}
                  />
                ) : shown ? (
                  <GroupJobs
                    group={shown}
                    leftOut={leftOut}
                    {...tiles}
                    onBrowse={() => browse(shown.group)}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </ToolboxPopup>
  );
}

/**
 * The tab in front: what the group is for, then its sections, each a title over its tiles (`SectionJobs`),
 * and the Library's word on what each makes.
 */
function GroupJobs(
  props: TileProps & {
    readonly group: ToolboxGroup;
    /** That none of the group's jobs fit the file in front, and what to open (`toolboxLeftOut`). */
    readonly leftOut: string | null;
    readonly onBrowse: () => void;
  },
) {
  const empty = props.group.sections.length === 0;
  return (
    <section aria-label={props.group.group} className="flex flex-col gap-3">
      <p className="px-1 text-xs text-muted-foreground">{GROUP_PURPOSES[props.group.group]}</p>
      {empty ? null : (
        <div className={SECTION_GRID}>
          {pairLoneSections(props.group.sections).map((section) => (
            <SectionJobs key={section.title} section={section} {...tileProps(props)} />
          ))}
        </div>
      )}
      {props.leftOut === null ? null : (
        <p className="text-xs text-muted-foreground">{props.leftOut}</p>
      )}
      {empty ? null : (
        // Its padding pulled back so its words start under the sections' titles.
        <div className="-ms-1.5">
          <Button variant="ghost-muted" size="sm" onClick={props.onBrowse}>
            See what each makes
          </Button>
        </div>
      )}
    </section>
  );
}

/** What every tile in the popup is given (`SectionJobs`). */
interface TileProps {
  /** No chat to write the job into. */
  readonly disabled: boolean;
  /** Why a job can't run on the file in front (`toolboxWorksOn`); null for one that can. */
  readonly worksOn: (action: HardwareAction) => string | null;
  /** New's start for what a job works on, where the project has none of it (`toolboxStart`). */
  readonly startFor: (action: HardwareAction) => NewTemplate | null;
  readonly onRun: (action: HardwareAction) => void;
  readonly onStart: (template: NewTemplate) => void;
  readonly pinnable: boolean;
}

const tileProps = (props: TileProps): TileProps => ({
  disabled: props.disabled,
  worksOn: props.worksOn,
  startFor: props.startFor,
  onRun: props.onRun,
  onStart: props.onStart,
  pinnable: props.pinnable,
});

/**
 * Yours: the pinned jobs, in the order pinned, then a few made for the part in front that are not
 * pinned (`suggestedJobs`). With none pinned it says how to pin one.
 */
function YourJobs(props: {
  readonly pinned: ReadonlyArray<HardwareAction>;
  readonly suggested: ReadonlyArray<HardwareAction>;
  /** The part in front by name, for the suggestions' title; null with none. */
  readonly partName: string | null;
  readonly tiles: TileProps;
}) {
  return (
    <section aria-label="Your tools" className="flex flex-col gap-4">
      {props.pinned.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Star a tool in any tab to keep it here, in the order you star them.
        </p>
      ) : (
        <div className={SECTION_GRID}>
          <SectionJobs section={{ title: "Pinned", actions: props.pinned }} {...props.tiles} />
        </div>
      )}
      {props.suggested.length === 0 || props.partName === null ? null : (
        <div className={SECTION_GRID}>
          <SectionJobs
            section={{ title: `Suggested for ${props.partName}`, actions: props.suggested }}
            {...props.tiles}
          />
        </div>
      )}
    </section>
  );
}
