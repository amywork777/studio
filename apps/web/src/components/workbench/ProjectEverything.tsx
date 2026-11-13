import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { CHECK_STATUS } from "./CheckBadge";
import { worstStatus } from "./checkResults";
import { fileTint, KIND_ICONS } from "./kinds";
import { FileCard, ShowAll } from "./OverviewModules";
import { CARD_GRID, MODULE_HEADING, SECTION_STACK } from "./studioLayout";
import { type FolderPart, PartFooter } from "./PartBadges";
import type { ProjectGroup } from "./projectFiles";
import { byLatest, pictureVersions, type ProjectModel } from "./projectModels";
import {
  type FileItem,
  ITEM_TYPES,
  type ItemType,
  itemType,
  projectFileItems,
} from "./projectItems";
import { usePictures } from "./usePictures";

const VIEW_KEY = "studio:everything-view";
/** The list shows this many before "Show all": a screen's worth of rows. */
const FIRST = 24;

/** Cards with pictures, unless the list was chosen on this computer. */
function readView(): "list" | "grid" {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

const LIST_COLUMNS = "grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)]";
const isPhoto = (path: string) => /\.(?:png|jpe?g|webp|gif)$/i.test(path);

/** A file, as the list shows it. */
interface Item {
  readonly key: string;
  readonly type: ItemType;
  readonly file: FileItem;
}

const capitalize = (text: string) => (text === "" ? text : text[0]!.toUpperCase() + text.slice(1));

const fullPath = (item: FileItem) => `${item.root.replace(/[\\/]+$/, "")}/${item.file.path}`;

/** An item's icon in its kind's color, the way Drive tells a Doc from a Sheet. */
function KindMark(props: { readonly group: ProjectGroup; readonly className: string }) {
  const Icon = KIND_ICONS[props.group];
  return (
    <Icon aria-hidden="true" className={cn("shrink-0", fileTint(props.group), props.className)} />
  );
}

/** One folder's files as cards, pictured where the server can render them; parts with their badges. */
function FileCards(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly items: ReadonlyArray<FileItem>;
  readonly parts: ReadonlyMap<string, FolderPart>;
  readonly onOpenFile: (root: string, path: string) => void;
}) {
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: props.root,
    paths: props.items
      .filter((item) => !isPhoto(item.file.path))
      .map((item) => item.file.picture ?? item.file.path),
    versions: pictureVersions(props.items.map((item) => item.file)),
  });
  return props.items.map((item) => {
    const part = props.parts.get(fullPath(item));
    return (
      <FileCard
        key={fullPath(item)}
        environmentId={props.environmentId}
        threadRef={props.threadRef}
        root={props.root}
        file={item.file}
        picture={pictures.get(item.file.picture ?? item.file.path)}
        place={undefined}
        onOpen={() => props.onOpenFile(props.root, item.file.path)}
        {...(part === undefined
          ? {}
          : {
              footer: (
                <PartFooter part={part} onOpen={(path) => props.onOpenFile(props.root, path)} />
              ),
            })}
      />
    );
  });
}

/** One folder's rows of the list: each file's picture (small) or its kind's icon, then its words. */
function ListRows(props: {
  readonly environmentId: EnvironmentId;
  readonly root: string;
  readonly items: ReadonlyArray<FileItem>;
  readonly parts: ReadonlyMap<string, FolderPart>;
  readonly onOpenFile: (root: string, path: string) => void;
}) {
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: props.root,
    paths: props.items
      .filter((item) => !isPhoto(item.file.path))
      .map((item) => item.file.picture ?? item.file.path),
    versions: pictureVersions(props.items.map((item) => item.file)),
  });
  return props.items.map((file) => {
    const part = props.parts.get(fullPath(file));
    const status = part === undefined ? undefined : worstStatus(part.results);
    const details =
      status === undefined || status === null
        ? file.file.folder === ""
          ? "In the project's folder"
          : `In ${file.file.folder}`
        : capitalize(CHECK_STATUS[status].caption);
    const picture = pictures.get(file.file.picture ?? file.file.path);
    return (
      <button
        key={fullPath(file)}
        type="button"
        role="row"
        onClick={() => props.onOpenFile(file.root, file.file.path)}
        className={cn(
          "grid items-center gap-3 border-b border-border p-3 text-left text-xs outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:bg-accent/60",
          LIST_COLUMNS,
        )}
      >
        <span role="cell" className="flex min-w-0 items-center gap-3 text-sm text-foreground">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-(--model-ground)">
            {picture ? (
              <img src={picture} alt="" className="size-full object-cover" />
            ) : (
              <KindMark group={file.file.group} className="size-4" />
            )}
          </span>
          <span className="truncate">{file.label}</span>
        </span>
        <span role="cell" className="truncate text-muted-foreground">
          {file.file.kind}
        </span>
        <span role="cell" className="truncate text-muted-foreground">
          {details}
        </span>
      </button>
    );
  });
}

/**
 * Every file a project holds in one place, like a Drive folder: filtered by type, as a list or as
 * cards, last built first. A press opens a file beside the chat.
 */
export function ProjectEverything(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly folders: ReadonlyArray<{
    readonly root: string;
    readonly paths: ReadonlyArray<string> | null;
    readonly models?: ReadonlyArray<ProjectModel>;
  }>;
  /** The project's parts and boards with their checks, by full path. */
  readonly parts: ReadonlyMap<string, FolderPart>;
  readonly onOpenFile: (root: string, path: string) => void;
}) {
  const [type, setType] = useState<ItemType | "All">("All");
  const [view, setView] = useState<"list" | "grid">(readView);
  const [all, setAll] = useState(false);
  const items: Item[] = projectFileItems(props.folders)
    .toSorted((a, b) => byLatest(a.file, b.file))
    .map((file) => ({
      key: fullPath(file),
      type: itemType(file.file.group),
      file,
    }));
  const present = ITEM_TYPES.filter((entry) => items.some((item) => item.type === entry));
  const shownType = type !== "All" && present.includes(type) ? type : "All";
  const matching = shownType === "All" ? items : items.filter((item) => item.type === shownType);
  const shown = all ? matching : matching.slice(0, FIRST);
  const chooseView = (next: "list" | "grid") => {
    setView(next);
    try {
      globalThis.localStorage?.setItem(VIEW_KEY, next);
    } catch {
      // Shown this way for this visit.
    }
  };
  const shownFiles = shown.map((item) => item.file);
  const roots = [...new Set(shownFiles.map((item) => item.root))];

  return (
    <section aria-label="Files" className={SECTION_STACK}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={MODULE_HEADING}>
          Files
          <span className="tabular-nums text-muted-foreground">{items.length}</span>
        </h2>
        <div role="group" aria-label="View" className="flex shrink-0 gap-2">
          <Button
            variant={view === "list" ? "secondary" : "ghost-muted"}
            size="icon-sm"
            aria-label="Show as a list"
            aria-pressed={view === "list"}
            onClick={() => chooseView("list")}
          >
            <ListIcon />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost-muted"}
            size="icon-sm"
            aria-label="Show as cards"
            aria-pressed={view === "grid"}
            onClick={() => chooseView("grid")}
          >
            <LayoutGridIcon />
          </Button>
        </div>
      </div>
      {present.length < 2 ? null : (
        <ToggleGroup
          aria-label="Type"
          value={[shownType]}
          onValueChange={(next) => {
            const value = next[0];
            if (value === "All" || ITEM_TYPES.includes(value as ItemType)) {
              setType(value as ItemType | "All");
              setAll(false);
            }
          }}
          className="flex-wrap"
        >
          <Toggle value="All">All</Toggle>
          {present.map((entry) => (
            <Toggle key={entry} value={entry}>
              <KindMark group={entry} className="size-3.5" />
              {entry}
            </Toggle>
          ))}
        </ToggleGroup>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No files yet. Use New, or describe what to make in the chat, and what the agent makes
          shows up here.
        </p>
      ) : view === "list" ? (
        <div role="table" aria-label="Files" className="flex flex-col">
          <div
            role="row"
            className={cn(
              "grid gap-3 border-b border-border px-3 pb-3 text-xs font-medium text-muted-foreground uppercase",
              LIST_COLUMNS,
            )}
          >
            <span role="columnheader">Name</span>
            <span role="columnheader">Kind</span>
            <span role="columnheader">Details</span>
          </div>
          {roots.map((root) => (
            <ListRows
              key={root}
              environmentId={props.environmentId}
              root={root}
              items={shownFiles.filter((item) => item.root === root)}
              parts={props.parts}
              onOpenFile={props.onOpenFile}
            />
          ))}
        </div>
      ) : (
        <div className={CARD_GRID}>
          {roots.map((root) => (
            <FileCards
              key={root}
              environmentId={props.environmentId}
              threadRef={props.threadRef}
              root={root}
              items={shownFiles.filter((item) => item.root === root)}
              parts={props.parts}
              onOpenFile={props.onOpenFile}
            />
          ))}
        </div>
      )}
      {matching.length > FIRST ? (
        <ShowAll all={all} count={matching.length} onToggle={() => setAll((value) => !value)} />
      ) : null}
    </section>
  );
}
