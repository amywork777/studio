import { useAtomValue } from "@effect/atom-react";
import type { ContextMenuItem, EnvironmentId } from "@t3tools/contracts";
import { msg, useGT, useMessages } from "gt-react";
import { EllipsisIcon, Puzzle, X as XIcon } from "lucide-react";
import { useEffect, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import { PanelTabCloseButton } from "~/components/ui/panel-tab-close-button";
import { cn } from "~/lib/utils";
import type { RightPanelSurface } from "~/rightPanelStore";
import { serverEnvironment } from "~/state/server";
import { shellEnvironment } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";
import { FileKindIcon } from "./FileKindIcon";
import { folderLabel } from "./folderLabel";
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
import { tabSuffixes, withoutSharedPrefix } from "./tabSuffixes";
import { NewTabButton } from "./NewTabButton";
import { knownModelScript, useModelTitles } from "./useFolderModels";
import { WORKBENCH_LAYOUT } from "./workbenchLayout";

export { TabHoverCard, TabOverflowMenu } from "./TabStripExtras";

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
  /** A file tab's own rows in its menu (`useStudioTabFileMenu`): what the viewer's ⋯ offered. */
  fileMenu?: StudioTabFileMenu;
}

/** The rows Studio adds to a file tab's menu. */
export type StudioTabAction = "show-in-folder";

/** A file tab's own menu rows, and running the one picked. */
export interface StudioTabFileMenu {
  readonly items: (surface: RightPanelSurface) => ContextMenuItem<StudioTabAction>[];
  readonly run: (action: string | null, surface: RightPanelSurface) => void;
}

/** A tab's file on disk, where it shows one: its workspace path under the project's folder. */
export function tabFilePath(surface: RightPanelSurface, folder: string | null): string | null {
  if (surface.kind === "file" && surface.attachment !== undefined) return null;
  const file = surfaceFile(surface);
  if (file === null) return null;
  if (/^(?:\/|[A-Za-z]:[\\/])/.test(file)) return file;
  if (folder === null) return null;
  const separator = folder.includes("\\") && !folder.includes("/") ? "\\" : "/";
  return `${folder.replace(/[\\/]+$/, "")}${separator}${file.replace(/^[\\/]+/, "")}`;
}

/**
 * What the viewer's file menu offered, now that Studio's tab names the file and the viewer has no
 * row of its own: Show in Finder, as the file page says it. Copy path stays out of the engineering
 * interface (`tabOffersCopyPath`).
 */
export function useStudioTabFileMenu(
  environmentId: EnvironmentId,
  folder: string | null,
): StudioTabFileMenu {
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: true });
  const reveals = serverConfig?.availableEditors.includes("file-manager") === true;
  const label = folderLabel(serverConfig?.environment.platform.os);
  return {
    items: (surface) =>
      isEngineeringInterface() && reveals && tabFilePath(surface, folder) !== null
        ? [{ id: "show-in-folder", label }]
        : [],
    run: (action, surface) => {
      const path = tabFilePath(surface, folder);
      if (action !== "show-in-folder" || path === null) return;
      void openInEditor({ environmentId, input: { cwd: path, editor: "file-manager" } });
    },
  };
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
  // The project's name most of its files' titles start with is said once, by the project.
  const shortened = engineering
    ? withoutSharedPrefix(
        tabSurfaces.map((surface) => studioTitle(surface, modelTitles, resolve) ?? ""),
      )
    : null;
  const shortTitles = new Map(
    shortened === null
      ? []
      : tabSurfaces.flatMap((surface, index) => {
          const short = shortened[index];
          return short === undefined || short === "" ? [] : [[surface.id, short] as const];
        }),
  );
  return {
    engineering,
    tabSurfaces,
    title: (surface: RightPanelSurface) =>
      shortTitles.get(surface.id) ?? studioTitle(surface, modelTitles, resolve),
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
    /**
     * The project's tab, pinned ahead of the tab list and outside its scroll, so it never scrolls
     * away however many tabs are open.
     */
    leadingTab: engineeringSurfaces ? projectTab : null,
    /** New, right after the last tab, as a browser's new-tab button (`NewTabButton`). */
    afterTabs: engineeringSurfaces ? <NewTabButton /> : null,
    /**
     * Room for the title bar's toggles over the row's right end, the same for Studio's named
     * Toolbox button as for T3's maximize and toggle: the inset, and the spacers that keep the tabs
     * clear of the window controls when the layout toggles live elsewhere.
     */
    rowEndInset: "pr-28",
    controlsSpacerWidth: "w-24",
    controlsInsetWidth: "w-28",
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
    // T3's icon is the tab's close: its press closes the tab, never also brings it forward.
    <span className="contents" onClick={(event) => event.stopPropagation()}>
      <PanelTabCloseButton label={props.label} onClick={props.onClick}>
        {props.children}
      </PanelTabCloseButton>
    </span>
  );
}

/**
 * What tells two same-titled tabs apart (Studio), shown in grey after the title. In a narrow tab it
 * gives way before the title does.
 */
/**
 * Where a tab's title is cut: the head truncates and the last few characters stay, so "M3x8 socket
 * screw" reads "M3x8 so…crew" in a narrow tab, as file names are cut in a file manager.
 */
export function titleParts(
  title: string,
  keep = 4,
): { readonly head: string; readonly tail: string } {
  if (title.length <= keep * 3) return { head: title, tail: "" };
  return { head: title.slice(0, title.length - keep), tail: title.slice(title.length - keep) };
}

/** A tab's title cut in the middle (`titleParts`), not at its end. */
export function TabTitle(props: { readonly title: string }) {
  if (!WORKBENCH_LAYOUT) return <span className="truncate">{props.title}</span>;
  const { head, tail } = titleParts(props.title);
  return (
    <span className="flex min-w-0" data-tab-title="">
      <span className="min-w-0 truncate">{head}</span>
      {tail === "" ? null : <span className="shrink-0">{tail}</span>}
    </span>
  );
}

export function TabSuffix(props: { readonly suffix: string | undefined }) {
  return props.suffix === undefined ? null : (
    <span className="ms-1.5 min-w-0 shrink-[4] truncate text-muted-foreground">{props.suffix}</span>
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

/**
 * A file tab's ⋯ (Studio): its menu, the one a right-click opens, at the press. Shown on the tab in
 * front and on hover, before its close, as the viewer's ⋯ was after the file's name.
 */
function TabMoreAtEnd(props: {
  readonly surface: RightPanelSurface;
  readonly active: boolean;
  readonly onOpen: (event: ReactMouseEvent) => void;
}) {
  const gt = useGT();
  if (!WORKBENCH_LAYOUT || !isEngineeringInterface() || tabFilePath(props.surface, "/") === null) {
    return null;
  }
  return (
    <button
      type="button"
      aria-label={gt("More")}
      aria-haspopup="menu"
      data-tab-more=""
      className={cn(
        "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none hover:bg-accent/50 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        props.active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
      )}
      onClick={(event) => {
        event.stopPropagation();
        props.onOpen(event);
      }}
    >
      <EllipsisIcon className="size-3" aria-hidden="true" />
    </button>
  );
}

/** Studio's (Chrome's) tab close, at the right, shown on the tab in front and on hover. */
export function TabCloseAtEnd(props: {
  readonly label: string;
  readonly active: boolean;
  readonly onClose: () => void;
  /** A file tab's menu, for its ⋯ before the close (`TabMoreAtEnd`). */
  readonly menu?: {
    readonly surface: RightPanelSurface;
    readonly onOpen: (event: ReactMouseEvent) => void;
  };
}) {
  if (!WORKBENCH_LAYOUT) return null;
  return (
    <span className="ms-auto flex shrink-0 items-center gap-0.5" data-tab-end="">
      {/* Only the tab in front carries a ⋯; a quiet tab's menu is its right-click, as Chrome's is. */}
      {props.menu === undefined || !props.active ? null : (
        <TabMoreAtEnd
          surface={props.menu.surface}
          active={props.active}
          onOpen={props.menu.onOpen}
        />
      )}
      <TabClose label={props.label} active={props.active} onClose={props.onClose} />
    </span>
  );
}

function TabClose(props: {
  readonly label: string;
  readonly active: boolean;
  readonly onClose: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      data-tab-close=""
      className={cn(
        "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none hover:bg-accent/50 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
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
