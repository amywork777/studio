import { msg, useGT, useMessages } from "gt-react";
import { Puzzle, X as XIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { PanelTabCloseButton } from "~/components/ui/panel-tab-close-button";
import { cn } from "~/lib/utils";
import type { RightPanelSurface } from "~/rightPanelStore";
import { FileKindIcon } from "./FileKindIcon";
import { KIND_ICONS, KIND_TINT } from "./kinds";
import { partLabel } from "./partNames";
import { PinnedProjectTab } from "./PinnedProjectTab";
import { useProjectViewStore } from "./projectView";
import { surfaceFile, viewTabTitle } from "./sameFile";
import {
  CODE_SURFACE_LABELS,
  hasEngineeringSurfaces,
  isEngineeringInterface,
  useEngineeringInterface,
  useEngineeringSurfaces,
} from "./studioInterface";
import { tabSuffixes } from "./tabSuffixes";
import { knownModelScript, useModelTitles } from "./useFolderModels";
import { WORKBENCH_LAYOUT } from "./workbenchLayout";

// Studio's side of T3's panel tabs (`RightPanelTabs.tsx`): its slots, its titles and icons, its
// pinned project tab, and its tabs as Chrome's (the kind's icon at the left, the close at the right).
// T3's file calls these in one line where each goes.

/** The slots Studio fills on T3's tab row and panel. */
export interface StudioRightPanelSlots {
  /**
   * What can be done to the surface in front (Studio's toolbar), at the right end of the tab row,
   * which is its `@container/toolbar`: a narrow panel shortens it.
   */
  toolbar?: ReactNode;
  /** A column beside the surface in front, under the tab row (Studio's Toolbox), at most half the width. */
  aside?: ReactNode;
  /** More "+" menu rows after the built-in surfaces, such as plugin views. */
  addSurfaceExtraItems?: ReactNode;
}

/**
 * Whether a tab's menu offers "Copy path": a file's, never an attachment's, and not in the
 * engineering interface, where a path is a programmer's thing.
 */
export function tabOffersCopyPath(
  surface: { readonly kind: string; readonly attachment?: unknown },
  engineering: boolean,
): boolean {
  return surface.kind === "file" && surface.attachment === undefined && !engineering;
}

/**
 * The empty panel's offers: none of the coding surfaces in the engineering interface
 * (`studioInterface.ts`). Studio's panel is never empty there: with every tab closed, its Overview
 * comes back.
 */
export function useEmptyPanelOffers(onAddFiles: () => void, filesAvailable: boolean) {
  const engineering = useEngineeringInterface();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reopens the panel store's Overview surface, which lives outside React state
  useEffect(() => {
    if (engineering && filesAvailable) onAddFiles();
  }, [engineering, filesAvailable, onAddFiles]);
  return (label: string) => !(engineering && CODE_SURFACE_LABELS.has(label));
}

/** A tab's title where Studio names it its own way, else null for T3's. */
function studioTitle(
  surface: RightPanelSurface,
  modelTitles: ReadonlyMap<string, string>,
  resolve: ReturnType<typeof useMessages>,
): string | null {
  switch (surface.kind) {
    case "files":
      return hasEngineeringSurfaces() ? resolve(msg("Project")) : null;
    case "file": {
      if (!isEngineeringInterface()) return null;
      const name = surface.relativePath.slice(
        Math.max(surface.relativePath.lastIndexOf("/"), surface.relativePath.lastIndexOf("\\")) + 1,
      );
      return partLabel(name);
    }
    case "plugin-app":
      return isEngineeringInterface() ? viewTabTitle(surface, modelTitles) : surface.title;
    default:
      return null;
  }
}

/** A tab's icon where Studio draws it its own way, else null for T3's. */
export function surfaceIcon(surface: RightPanelSurface): ReactNode | null {
  // In the engineering interface a tab wears its file's kind, as a browser tab its site's icon.
  if (surface.kind === "file" && isEngineeringInterface()) {
    return <FileKindIcon path={surface.relativePath} className="size-3.5" />;
  }
  if (surface.kind !== "plugin-app") return null;
  // In the workbench (Studio) a plugin view is the model or board viewer, marked by its kind:
  // CAD's cube, the AI | CAD switch's, for a part and for the view before it has one.
  return WORKBENCH_LAYOUT ? (
    surfaceFile(surface) === null ? (
      <KIND_ICONS.CAD className={cn("size-3.5 shrink-0", KIND_TINT)} aria-hidden="true" />
    ) : (
      <FileKindIcon path={surfaceFile(surface) ?? ""} className="size-3.5" />
    )
  ) : (
    <Puzzle className="size-3 shrink-0" />
  );
}

/** What Studio's tab row needs: the tabs it shows, their titles and suffixes, its pinned tab. */
export function useStudioTabs(props: {
  readonly surfaces: readonly RightPanelSurface[];
  readonly activeSurfaceId: string | null;
  readonly onActivate: (surface: RightPanelSurface) => void;
  readonly onAddFiles: () => void;
}) {
  // The engineering surfaces pin the project (and, with code tools, its source) ahead of the tabs.
  const engineeringSurfaces = useEngineeringSurfaces();
  const engineering = useEngineeringInterface();
  const projectView = useProjectViewStore((state) => state.view);
  const modelTitles = useModelTitles();
  const resolve = useMessages();
  const tabSurfaces = engineeringSurfaces
    ? props.surfaces.filter((surface) => surface.kind !== "files")
    : props.surfaces;
  // The project is home, not one tab among many: pinned first, apart from the rest.
  const projectTab = engineeringSurfaces ? (
    <PinnedProjectTab
      active={props.activeSurfaceId === "files"}
      view={engineering ? "project" : projectView}
      withSource={!engineering}
      onSelect={(view) => {
        useProjectViewStore.getState().setView(view);
        const project = props.surfaces.find((surface) => surface.kind === "files");
        if (project) props.onActivate(project);
        else props.onAddFiles();
      }}
    />
  ) : null;
  return {
    engineering,
    tabSurfaces,
    title: (surface: RightPanelSurface) => studioTitle(surface, modelTitles, resolve),
    /** Two open tabs never read the same: each of a clash carries what it is, in grey. */
    suffixes: (titleOf: (surface: RightPanelSurface) => string) =>
      engineering
        ? tabSuffixes(
            tabSurfaces.map((surface) => {
              const file = surfaceFile(surface);
              return {
                id: surface.id,
                title: titleOf(surface),
                file,
                script: file === null ? undefined : knownModelScript(file),
              };
            }),
          )
        : null,
    /** Engineering with code tools pins the project tab ahead of the tab list. */
    leadingTab: engineeringSurfaces && !engineering ? projectTab : null,
    /** The engineering interface's Overview is the first of the sheets along the bottom. */
    firstTab: engineering ? projectTab : null,
    /**
     * Room for the title bar's toggles over the row's right end: Studio's one (the Toolbox's)
     * and the gap the toolbar's buttons keep between them, T3's maximize and toggle.
     */
    rowEndInset: engineeringSurfaces ? "pr-12" : "pr-28",
    /** Keeps the tabs clear of the window controls when the layout toggles live elsewhere. */
    controlsSpacerWidth: engineeringSurfaces ? "w-10" : "w-24",
    controlsInsetWidth: engineeringSurfaces ? "w-10" : "w-28",
  };
}

/** A tab's kind icon: T3's close button over it, or in Studio's (Chrome's) tabs the icon alone. */
export function TabIcon(props: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return WORKBENCH_LAYOUT ? (
    // Chrome's tab, as Studio's are: the kind's icon stays at the left.
    <span className="relative flex size-4 shrink-0 items-center justify-center">
      {props.children}
    </span>
  ) : (
    <PanelTabCloseButton label={props.label} onClick={props.onClick}>
      {props.children}
    </PanelTabCloseButton>
  );
}

/** What tells two same-titled tabs apart (Studio), shown in grey after the title. */
export function TabSuffix(props: { readonly suffix: string | undefined }) {
  return props.suffix === undefined ? null : (
    <span className="ms-1.5 shrink-0 text-muted-foreground">{props.suffix}</span>
  );
}

/** A tab's tooltip title, with its suffix when it has one. */
export function TitleWithSuffix(props: {
  readonly title: string;
  readonly suffix: string | undefined;
}) {
  const gt = useGT();
  return props.suffix === undefined
    ? props.title
    : gt("{title}, {suffix}", { title: props.title, suffix: props.suffix });
}

/** Studio's (Chrome's) tab close, at the right, shown on the tab in front and on hover. */
export function TabCloseAtEnd(props: {
  readonly label: string;
  readonly active: boolean;
  readonly onClose: () => void;
}) {
  if (!WORKBENCH_LAYOUT) return null;
  return (
    <button
      type="button"
      aria-label={props.label}
      data-tab-close=""
      className={cn(
        "ms-auto flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none hover:bg-muted focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        props.active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
      )}
      onClick={(event) => {
        event.stopPropagation();
        props.onClose();
      }}
    >
      <XIcon className="size-3" aria-hidden="true" />
    </button>
  );
}

/** The toolbar slot at the right end of the tab row. */
export function ToolbarSlot(props: { readonly toolbar: ReactNode | undefined }) {
  return props.toolbar === undefined ? null : (
    <div
      className="ms-2 flex shrink-0 items-center [-webkit-app-region:no-drag]"
      data-right-panel-toolbar
    >
      {props.toolbar}
    </div>
  );
}

/** The panel's body: the surface in front, and the aside slot beside it. */
export function PanelBody(props: { readonly aside: ReactNode | undefined; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1" data-right-panel-body>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-right-panel-surface-content>
        {props.children}
      </div>
      {props.aside === undefined ? null : (
        <div className="flex min-h-0 max-w-1/2 shrink-0" data-right-panel-aside>
          {props.aside}
        </div>
      )}
    </div>
  );
}
