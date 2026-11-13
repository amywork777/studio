import type { ScopedThreadRef } from "@t3tools/contracts";
import { PanelRightCloseIcon } from "lucide-react";
import { type ReactElement, type RefObject, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Toggle, ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { GROUP_PURPOSES, type HardwareAction, type HardwareActionGroup } from "./hardwareActions";
import { MENU_ICONS, MENU_TINTS, MENU_WORDS } from "./kinds";
import { handToChat } from "./handToChat";
import { withToolLine } from "./toolUsed";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { partLink } from "./partLink";
import { useSimpleView } from "./simpleView";
import { useNewDialogStore } from "./newDialogStore";
import type { NewTemplate } from "./newTemplates";
import { usePartForJobs } from "./StudioPanelBar";
import { SECTION_GRID, SectionJobs } from "./ToolboxJobs";
import {
  pairLoneSections,
  readToolboxTab,
  type ToolboxGroup,
  toolboxGroups,
  toolboxLeftOut,
  toolboxLibraryLink,
  toolboxNarrowRem,
  toolboxStart,
  toolboxWorksOn,
  writeToolboxTab,
} from "./toolbox";
import { selectToolboxFolded, useToolboxFold } from "./toolboxFold";
import { useProjectKinds } from "./useLeadPart";
import { useToolboxJobs } from "./useToolboxJobs";

/**
 * Every job the enabled skills can do, a tab per group and each job an equal tile, none folded or
 * hidden, for the part in front else the project's (`usePartForJobs`). A job that does not fit the
 * file stays dimmed and says what it works on; one whose input New can make opens New instead. It
 * starts folded on a narrow panel (`toolboxNarrowRem`) so the model keeps the room.
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
  const start = (template: NewTemplate) =>
    useNewDialogStore.getState().ask(template.discipline, template.id);
  const groups = toolboxGroups(jobs.menus);

  const navigate = useNavigate();
  const router = useRouter();
  const browse = (group: HardwareActionGroup) =>
    void navigate(
      toolboxLibraryLink(group, {
        workspaceOpen: useOpenWorkspaceStore.getState().workspace !== null,
        from: router.state.location.href,
      }),
    );

  const rootRef = useRef<HTMLDivElement>(null);
  const { folded, setFolded } = useFolding(rootRef);
  const [tab, setTabState] = useState(readToolboxTab);
  const setTab = (group: HardwareActionGroup) => {
    setTabState(group);
    writeToolboxTab(group);
  };
  const shown = groups.find((group) => group.group === tab);
  const kind = part?.kind ?? null;
  const leftOut = shown === undefined || kind === null ? null : toolboxLeftOut(shown, kind);

  const run = (action: HardwareAction) => {
    if (composerRef === null || part === null) return;
    handToChat(composerRef, withToolLine(action.label, action.prompt(partLink(part))));
  };

  // From the folded edge: open on that group's tab.
  const openOn = (group: HardwareActionGroup) => {
    setTab(group);
    setFolded(false);
  };

  // One root for both, so its width slides between the edge and the open Toolbox as the sidebar's
  // does (the app's panel animations), and the contents keep their own width while it does.
  return (
    <div
      ref={rootRef}
      className={cn(
        "shrink-0 overflow-hidden border-l border-border",
        "[[data-panel-animations=true]_&]:motion-safe:transition-[width] [[data-panel-animations=true]_&]:motion-safe:duration-(--panel-animation-duration) [[data-panel-animations=true]_&]:motion-safe:ease-out",
        folded ? "w-10" : "w-64",
      )}
      data-studio-toolbox={folded ? "folded" : "open"}
    >
      {folded ? (
        <div className="flex w-10 flex-col items-center gap-2 py-2">
          {groups.map((group) => {
            const Icon = MENU_ICONS[group.group];
            return (
              <ToolboxTip key={group.group} text={MENU_WORDS[group.group]} side="left">
                <Toggle
                  variant="ghost"
                  size="lg"
                  aria-label={MENU_WORDS[group.group]}
                  pressed={group.group === shown?.group}
                  onPressedChange={() => openOn(group.group)}
                >
                  <Icon aria-hidden="true" className={cn("size-4.5", MENU_TINTS[group.group])} />
                </Toggle>
              </ToolboxTip>
            );
          })}
        </div>
      ) : (
        <div className="flex h-full w-64 flex-col">
          {/* As tall as the ribbon's tab row beside it, so their hairlines run on as one. */}
          <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-border ps-3 pe-1">
            <h2 className="text-sm font-medium text-foreground">Toolbox</h2>
            <ToolboxTip text="Fold the Toolbox" side="bottom">
              <Button
                variant="ghost-muted"
                size="icon-xs"
                aria-label="Fold the Toolbox"
                onClick={() => setFolded(true)}
              >
                <PanelRightCloseIcon aria-hidden="true" />
              </Button>
            </ToolboxTip>
          </div>
          <div className="shrink-0 border-b border-border p-3">
            {/* Each its group's icon (the folded edge's, in its jobs' color) over its name, the one in
            front marked by the underline alone, so no tray stands behind them. Sized by its name with
            the spare room shared out, and the panel holds its width (`w-64`) for that room: at equal
            thirds, or narrower, Manufacturing runs into its neighbours. */}
            <ToggleGroup
              aria-label="Toolbox group"
              value={shown === undefined ? [] : [shown.group]}
              variant="underline"
              size="tile"
              className="w-full"
              onValueChange={(value) => {
                // Pressing the tab in front clears the group: it stays as it is.
                const next = groups.find((group) => group.group === value[0]);
                if (next) setTab(next.group);
              }}
            >
              {groups.map((group) => {
                const Icon = MENU_ICONS[group.group];
                return (
                  <ToggleGroupItem key={group.group} value={group.group} className="flex-auto">
                    <Icon aria-hidden="true" className={MENU_TINTS[group.group]} />
                    {MENU_WORDS[group.group]}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-3 p-3">
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
                  {shown ? (
                    <GroupJobs
                      group={shown}
                      leftOut={leftOut}
                      disabled={composerRef === null}
                      worksOn={(action) => toolboxWorksOn(action, kind, startFor(action))}
                      startFor={startFor}
                      onRun={run}
                      onStart={start}
                      onBrowse={() => browse(shown.group)}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Whether the Toolbox is folded, and the way to fold or open it (`useToolboxFold`, shared with the
 * title bar's Toolbox button). The person's choice holds on a wide panel and is remembered on this
 * device; a narrow one (`toolboxFolded`) starts it folded and forgets an opening there once it is
 * wide again.
 */
function useFolding(rootRef: RefObject<HTMLDivElement | null>) {
  const narrowRem = toolboxNarrowRem(useSimpleView());
  const folded = useToolboxFold(selectToolboxFolded);
  const setFolded = useToolboxFold((state) => state.setFolded);
  const setNarrow = useToolboxFold((state) => state.setNarrow);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- observes the panel body's width and keeps the fold store's narrow flag in step with it
  useLayoutEffect(() => {
    // The panel's body, the surface and the Toolbox side by side (`RightPanelTabs`' aside).
    const body = rootRef.current?.closest("[data-right-panel-body]");
    if (!body) return;
    return observeResize(body, (entries) => {
      const width = entries.at(-1)?.contentRect.width;
      if (width === undefined) return;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setNarrow(width < narrowRem * rem);
    });
  }, [rootRef, narrowRem, setNarrow]);
  return { folded, setFolded };
}

/** A control's tooltip, in the app's own. */
function ToolboxTip(props: {
  readonly text: string;
  readonly side: "left" | "bottom";
  readonly children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.children} />
      <TooltipPopup side={props.side}>{props.text}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * The tab in front: what the group is for, then its sections, each a title over its tiles (`SectionJobs`),
 * and the Library's word on what each makes.
 */
function GroupJobs(props: {
  readonly group: ToolboxGroup;
  /** That none of the group's jobs fit the file in front, and what to open (`toolboxLeftOut`). */
  readonly leftOut: string | null;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  /** Why a job can't run on the file in front (`toolboxWorksOn`); null for one that can. */
  readonly worksOn: (action: HardwareAction) => string | null;
  /** New's start for what a job works on, where the project has none of it (`toolboxStart`). */
  readonly startFor: (action: HardwareAction) => NewTemplate | null;
  readonly onRun: (action: HardwareAction) => void;
  readonly onStart: (template: NewTemplate) => void;
  readonly onBrowse: () => void;
}) {
  const empty = props.group.sections.length === 0;
  return (
    <section aria-label={props.group.group} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{GROUP_PURPOSES[props.group.group]}</p>
      {empty ? null : (
        <div className={SECTION_GRID}>
          {pairLoneSections(props.group.sections).map((section) => (
            <SectionJobs
              key={section.title}
              section={section}
              disabled={props.disabled}
              worksOn={props.worksOn}
              startFor={props.startFor}
              onRun={props.onRun}
              onStart={props.onStart}
            />
          ))}
        </div>
      )}
      {props.leftOut === null ? null : (
        <p className="text-xs text-muted-foreground">{props.leftOut}</p>
      )}
      {empty ? null : (
        // Its padding pulled back so its words start under the sections' titles.
        <div className="-ms-2.5">
          <Button variant="ghost-muted" size="sm" onClick={props.onBrowse}>
            See what each makes
          </Button>
        </div>
      )}
    </section>
  );
}
