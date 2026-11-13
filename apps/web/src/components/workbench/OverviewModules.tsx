import { ChevronDownIcon, type LucideIcon } from "lucide-react";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { type ReactNode, useState } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { cn } from "~/lib/utils";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { workspaceAssetResource } from "../files/filePreviewMode";
import { Button } from "../ui/button";
import { fileTint, KIND_ICONS } from "./kinds";
import { readmeInline } from "./projectReadme";
import { filePlaces, type ProjectFile, type ProjectGroup } from "./projectFiles";
import { useEngineeringInterface } from "./studioInterface";
import { CARD_GRID, MODULE_HEADING, MODULE_NOTE, SECTION_STACK } from "./studioLayout";
import { usePictures } from "./usePictures";

/** A module shows this many files before "Show all": two rows of cards at most widths. */
const FIRST_FILES = 8;
/** Pictures a browser shows as they are; models, boards, results and DXF are rendered (`usePictures`). */
const PHOTO = /\.(?:png|jpe?g|webp|gif)$/i;
/** Documents shown as a page: their title and how they open. */
const PAGE = /\.(?:md|mdx|txt)$/i;

const FOLDED_KEY = "studio:overview-folded";

function readFolded(): Record<string, ReadonlyArray<string>> {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(FOLDED_KEY) ?? "{}") as unknown;
    return stored !== null && typeof stored === "object"
      ? (stored as Record<string, ReadonlyArray<string>>)
      : {};
  } catch {
    return {};
  }
}

/** Which of a project's Overview modules are folded away, remembered on this computer. */
export function useFoldedModules(project: string) {
  const [state, setState] = useState(() => ({ project, folded: readFolded()[project] ?? [] }));
  // Another project, shown in the same page, reads its own folds.
  const folded = state.project === project ? state.folded : (readFolded()[project] ?? []);
  const toggle = (module: string) => {
    const next = folded.includes(module)
      ? folded.filter((name) => name !== module)
      : [...folded, module];
    setState({ project, folded: next });
    try {
      globalThis.localStorage?.setItem(
        FOLDED_KEY,
        JSON.stringify({ ...readFolded(), [project]: next }),
      );
    } catch {
      // Still folded for this visit.
    }
  };
  return { folded, toggle };
}

export function ShowAll(props: {
  readonly all: boolean;
  /** How many there are to show; none for words folded to a few lines. */
  readonly count?: number;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      className="self-start text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
    >
      {props.all ? "Show fewer" : `Show all${props.count === undefined ? "" : ` ${props.count}`}`}
    </button>
  );
}

/**
 * One module of a project's Overview: a heading that folds it, how many it holds, and its
 * contents. The Overview shows a module only once there is something in it.
 */
/** A link at a module's heading end, such as New document. */
export function HeadingLink(props: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
    >
      {props.label}
    </button>
  );
}

export function OverviewModule(props: {
  readonly title: string;
  /** Said quietly beside the title: when a dated README section was written. */
  readonly note?: string | null | undefined;
  /** The kind it holds, as Studio marks that kind everywhere (`kinds.ts`). */
  readonly icon?: LucideIcon;
  readonly count?: number;
  readonly folded: boolean;
  readonly onFold: () => void;
  /** A link at the heading's end, such as Full history. */
  readonly action?: ReactNode;
  /** Across both columns of a wide Overview. */
  readonly wide?: boolean;
  /** A row of a list that opens: its name in sentence case, the chevron at the row's far end. */
  readonly row?: boolean;
  readonly children: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <section
      aria-label={props.title}
      className={cn("flex min-w-0 flex-col", props.wide && "@3xl:col-span-2")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <button
          type="button"
          aria-expanded={!props.folded}
          onClick={props.onFold}
          className={cn(
            props.row
              ? "-mx-2 flex min-h-7 min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm font-medium text-foreground hover:bg-accent"
              : MODULE_HEADING,
            "rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          )}
        >
          {Icon === undefined ? null : (
            <Icon aria-hidden="true" className="size-3.5 self-center text-foreground/75" />
          )}
          {props.title}
          {props.note ? <span className={MODULE_NOTE}>{props.note}</span> : null}
          {props.count === undefined ? null : (
            <span className="tabular-nums text-muted-foreground">{props.count}</span>
          )}
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "size-3 self-center transition-transform duration-150",
              props.row && "ml-auto size-3.5 text-muted-foreground",
              props.folded && "-rotate-90",
            )}
          />
        </button>
        {props.folded ? null : props.action}
      </div>
      {props.folded ? null : (
        <div className={cn("mt-3 flex flex-col gap-3", props.row && "pb-3")}>{props.children}</div>
      )}
    </section>
  );
}

/** A photo of the project's, by its workspace address; nothing while it loads or if it can't. */
function Photo(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly path: string;
}) {
  const resource = workspaceAssetResource({
    kind: "workspace-file",
    threadRef: props.threadRef,
    draft: true,
    workspaceRoot: props.root,
    absolutePath: `${props.root.replace(/[\\/]+$/, "")}/${props.path}`,
  });
  const url = useAssetUrlState(props.environmentId, resource);
  const [failed, setFailed] = useState(false);
  if (url._tag !== "Success" || failed) return null;
  return (
    <img src={url.url} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
  );
}

/** Markdown as plain words: links by their names, marks dropped. */
const plainText = (line: string) =>
  readmeInline(line.replace(/^#+\s*/, "").replace(/^[-*]\s+/, ""))
    .map((piece) => piece.text)
    .join("");

/** A document, read from its folder, as a small page (`view`, else `TextPage`); nothing until it is read. */
export function Page(props: {
  readonly environmentId: EnvironmentId;
  readonly root: string;
  readonly path: string;
  readonly view?: (props: { readonly text: string }) => ReactNode;
}) {
  const file = useEnvironmentQuery(
    projectEnvironment.readFile({
      environmentId: props.environmentId,
      input: { cwd: props.root, relativePath: props.path },
    }),
  ).data;
  if (!file) return null;
  const View = props.view ?? TextPage;
  return <View text={file.contents} />;
}

/** A document's text as a small page: its title, then its opening lines, as a thumbnail reads. */
export function TextPage(props: { readonly text: string }) {
  // HTML in the Markdown (a new project's README opens on its icon's <img>) is not words to show.
  const lines = props.text
    .split("\n")
    .map((line) => line.replace(/<[^>]*>/g, "").trim())
    .filter((line) => line !== "");
  const heading = lines.find((line) => line.startsWith("#"));
  const body = lines
    .filter((line) => line !== heading)
    .slice(0, 8)
    .map(plainText)
    .join(" ");
  return (
    <span className="flex size-full flex-col gap-1 overflow-hidden bg-background p-3 text-left">
      {heading === undefined ? null : (
        <span className="line-clamp-2 text-xs font-semibold text-foreground">
          {plainText(heading)}
        </span>
      )}
      <span className="line-clamp-6 text-xs leading-snug text-muted-foreground">{body}</span>
    </span>
  );
}

/**
 * A file as a card: its picture (a render of a model, board, result or DXF, or the photo itself),
 * else its kind's icon large, then its name and what it is. A press opens it.
 */
export function FileCard(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly file: ProjectFile;
  readonly picture: string | undefined;
  /** Where it sits, said only where it tells two alike apart (`filePlaces`). */
  readonly place: string | undefined;
  readonly onOpen: () => void;
  /** Under its name: what was made from it, for a part (its checks, drawing, manufacturing files). */
  readonly footer?: ReactNode;
}) {
  const Icon = KIND_ICONS[props.file.group];
  const photo = PHOTO.test(props.file.path);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={props.onOpen}
        aria-label={`Open ${props.file.title}`}
        className="flex aspect-[4/3] min-w-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-(--model-ground) outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {props.picture ? (
          <img src={props.picture} alt="" className="size-full object-contain" />
        ) : PAGE.test(props.file.path) ? (
          <Page environmentId={props.environmentId} root={props.root} path={props.file.path} />
        ) : photo ? (
          <Photo
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            root={props.root}
            path={props.file.path}
          />
        ) : (
          <Icon className={cn("size-8", fileTint(props.file.group))} aria-hidden="true" />
        )}
      </button>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{props.file.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {props.file.kind}
          {props.place === undefined ? "" : ` · ${props.place}`}
        </span>
      </div>
      {props.footer}
    </div>
  );
}

/** One folder's files of a module as cards, pictured where the server can render them. */
function FolderCards(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly files: ReadonlyArray<ProjectFile>;
  readonly places: ReadonlyMap<string, string>;
  readonly onOpen: (root: string, path: string) => void;
}) {
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: props.root,
    paths: props.files
      .filter((file) => !PHOTO.test(file.path))
      .map((file) => file.picture ?? file.path),
  });
  return props.files.map((file) => (
    <FileCard
      key={`${props.root}\n${file.path}`}
      environmentId={props.environmentId}
      threadRef={props.threadRef}
      root={props.root}
      file={file}
      picture={pictures.get(file.picture ?? file.path)}
      place={props.places.get(file.path)}
      onOpen={() => props.onOpen(props.root, file.path)}
    />
  ));
}

/** A module of one kind of the project's files, as cards: its drawings, studies, photos, documents. */
export function FilesModule(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly group: ProjectGroup;
  readonly files: ReadonlyArray<{ readonly root: string; readonly file: ProjectFile }>;
  readonly folded: boolean;
  readonly onFold: () => void;
  readonly onOpen: (root: string, path: string) => void;
  /** A link at the heading's end: Documents' New document. */
  readonly action?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? props.files : props.files.slice(0, FIRST_FILES);
  const engineering = useEngineeringInterface();
  const files = props.files.map(({ file }) => file);
  const places = engineering
    ? filePlaces(files)
    : new Map(files.map((file) => [file.path, file.path] as const));
  const roots = [...new Set(shown.map(({ root }) => root))];
  return (
    <OverviewModule
      title={props.group}
      icon={KIND_ICONS[props.group]}
      count={props.files.length}
      folded={props.folded}
      onFold={props.onFold}
      wide
      {...(props.action === undefined ? {} : { action: props.action })}
    >
      <div className={CARD_GRID}>
        {roots.map((root) => (
          <FolderCards
            key={root}
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            root={root}
            files={shown.filter((entry) => entry.root === root).map(({ file }) => file)}
            places={places}
            onOpen={props.onOpen}
          />
        ))}
      </div>
      {props.files.length > FIRST_FILES ? (
        <ShowAll all={all} count={props.files.length} onToggle={() => setAll((value) => !value)} />
      ) : null}
    </OverviewModule>
  );
}

/** In place of the lead part while the project has none: how to get one, by chat or by hand. */
export function StartModule(props: {
  readonly byHand: boolean;
  readonly onStartPart: (() => void) | null;
}) {
  return (
    <section aria-label="Parts" className={SECTION_STACK}>
      <h2 className={MODULE_HEADING}>Parts</h2>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-xs text-muted-foreground">
          {props.byHand
            ? "No part yet. Start a part by hand, or describe it in the chat."
            : "No parts yet. Describe the part in the chat and the agent drafts it, or start one by hand."}
        </p>
        {props.onStartPart === null ? null : (
          <Button
            size="sm"
            variant={props.byHand ? "default" : "outline"}
            onClick={props.onStartPart}
          >
            Start a part by hand
          </Button>
        )}
      </div>
    </section>
  );
}
