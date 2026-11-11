import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { studioFolderKey, studioFolderName } from "@t3tools/shared/studioProjects";
import {
  ChevronDownIcon,
  FolderIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useThreadShellsForProjectRefs } from "~/state/entities";
import { useComposerHandleContext } from "~/composerHandleContext";
import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { AddFolderMenu } from "./AddFolderMenu";
import { EMPTY_BRIEF } from "./briefFolder";
import { useDocumentTemplates } from "./documentTemplates";
import { handToChat } from "./handToChat";
import { NewDialog } from "./NewDialog";
import { useNewDialogStore } from "./newDialogStore";
import { type Discipline, templateOffers } from "./newTemplates";
import { ProjectSetup } from "./ProjectBrief";
import { ProjectOverview } from "./ProjectOverview";
import { ReadmeOverview } from "./ReadmeOverview";
import { projectChats } from "./workspaceTitle";
import { useAddPart } from "./useNewPart";
import { ProjectThreads } from "./ProjectThreads";
import { usePictures } from "./usePictures";
import { KIND_ICONS } from "./kinds";
import {
  DESIGN_GROUPS,
  filePlaces,
  groupProjectFiles,
  type ProjectFile,
  type ProjectGroup,
} from "./projectFiles";
import { ImportDropZone } from "./ImportDropZone";
import { useImportIntoProject } from "./importIntoProject";
import { useEngineeringInterface } from "./studioInterface";
import { MODULE_HEADING, SECTION_STACK } from "./studioLayout";
import { folderProject, useEnvironmentFolders } from "./useProjectFolders";
import { useSimpleView } from "./simpleView";
import { useOpenFromOverview } from "./useOpenInWorkbench";
import { useSaveStudioProject, useStudioProjectAt } from "./useStudioProjects";

/** Groups whose files have pictures: everything the CAD plugin can render. */
const PICTURED: ReadonlySet<ProjectGroup> = new Set([
  "CAD",
  "Electronics",
  "Drawings",
  "Analysis",
  "Manufacturing",
  "Reference parts",
]);
/** A section shows this many before "Show all". */
const FIRST = 8;
const VIEW_KEY = "studio:project-view";

function readView(): "grid" | "list" {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/** A file's place after its kind: its path with code tools on, else its folder where two are alike. */
type FilePlaces = ReadonlyMap<string, string>;

function FileTile(props: {
  readonly file: ProjectFile;
  readonly picture: string | undefined;
  readonly where: string | undefined;
  readonly onOpen: () => void;
}) {
  const { file } = props;
  const Icon = KIND_ICONS[file.group];
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background text-left outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-border bg-(--model-ground)">
        {props.picture ? (
          <img src={props.picture} alt="" className="size-full object-contain" />
        ) : (
          <Icon className="size-7 text-muted-foreground/60" aria-hidden="true" />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-1 p-3">
        <span className="truncate text-sm font-medium text-foreground">{file.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {file.kind}
          {props.where === undefined ? "" : ` · ${props.where}`}
        </span>
      </span>
    </button>
  );
}

function FileRow(props: {
  readonly file: ProjectFile;
  readonly where: string | undefined;
  readonly onOpen: () => void;
}) {
  const { file } = props;
  const Icon = KIND_ICONS[file.group];
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)] items-center gap-3 border-b border-border p-3 text-left text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate text-sm font-medium text-foreground">{file.title}</span>
      </span>
      <span className="truncate">{file.kind}</span>
      <span className="truncate text-muted-foreground">{props.where}</span>
    </button>
  );
}

/** One group of the project: folded or open, its first files and the rest on request. */
function Section(props: {
  readonly group: ProjectGroup;
  readonly files: ReadonlyArray<ProjectFile>;
  readonly view: "grid" | "list";
  readonly pictures: ReadonlyMap<string, string>;
  readonly places: FilePlaces;
  readonly onOpen: (file: ProjectFile) => void;
}) {
  const [folded, setFolded] = useState(false);
  const [all, setAll] = useState(false);
  const files = all ? props.files : props.files.slice(0, FIRST);
  return (
    <section aria-label={props.group}>
      <h2 className="sticky top-0 z-10 bg-background">
        <button
          type="button"
          aria-expanded={!folded}
          onClick={() => setFolded((value) => !value)}
          className={cn(
            MODULE_HEADING,
            "w-full items-center py-1 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          )}
        >
          <ChevronDownIcon
            className={cn("size-3 transition-transform duration-150", folded && "-rotate-90")}
            aria-hidden="true"
          />
          {props.group}
          <span className="tabular-nums text-muted-foreground">{props.files.length}</span>
        </button>
      </h2>
      {folded ? null : (
        <>
          {props.view === "grid" ? (
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
              {files.map((file) => (
                <FileTile
                  key={file.path}
                  file={file}
                  picture={props.pictures.get(file.path)}
                  where={props.places.get(file.path)}
                  onOpen={() => props.onOpen(file)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-2 border-t border-border">
              {files.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  where={props.places.get(file.path)}
                  onOpen={() => props.onOpen(file)}
                />
              ))}
            </div>
          )}
          {props.files.length > FIRST ? (
            <button
              type="button"
              onClick={() => setAll((value) => !value)}
              className="mt-3 text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
            >
              {all ? "Show fewer" : `Show all ${props.files.length}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/** One folder's files on the project page, filed by kind; named when the project has several. */
function FolderFiles(props: {
  readonly environmentId: EnvironmentId;
  readonly root: string;
  /** The folder's name, shown when the project has more than one. */
  readonly label: string | null;
  readonly tab: "files" | "references";
  readonly query: string;
  readonly view: "grid" | "list";
  /** The thread's own folder refreshes when its agent changes files. */
  readonly mutationId: string | null;
  readonly emptyText: string;
  readonly onOpen: (file: ProjectFile) => void;
}) {
  const { environmentId, root } = props;
  const listing = useEnvironmentQuery(
    projectEnvironment.listEntries({ environmentId, input: { cwd: root } }),
  );
  useWorkspaceMutationRefresh({
    mutationId: props.mutationId,
    refresh: listing.refresh,
    resourceKey: `project-page:${root}`,
  });
  const groups = useMemo(
    () =>
      groupProjectFiles(
        (listing.data?.entries ?? [])
          .filter((entry) => entry.kind === "file" && entry.ignored !== true)
          .map((entry) => entry.path),
        props.query,
      ),
    [listing.data, props.query],
  );
  const shown = groups.filter(({ group }) =>
    props.tab === "references" ? group === "References" : group !== "References",
  );
  const pictures = usePictures({
    environmentId,
    cwd: root,
    paths: shown.flatMap(({ files }) =>
      files.filter((file) => PICTURED.has(file.group)).map((file) => file.path),
    ),
  });
  const count = shown.reduce((total, { files }) => total + files.length, 0);
  const engineering = useEngineeringInterface();
  const shownFiles = shown.flatMap((section) => section.files);
  const places: FilePlaces = engineering
    ? filePlaces(shownFiles)
    : new Map(shownFiles.map((file) => [file.path, file.path] as const));

  return (
    <section aria-label={props.label ?? "Files"} className="flex flex-col gap-6">
      {props.label === null ? null : (
        <h2 className="flex min-w-0 items-baseline gap-2 border-b border-border pb-2">
          <FolderIcon
            className="size-4 shrink-0 self-center text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate text-sm font-medium text-foreground">{props.label}</span>
          {engineering ? null : (
            <span className="min-w-0 truncate text-xs text-muted-foreground">{root}</span>
          )}
          <span className="ms-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {count}
          </span>
        </h2>
      )}
      {shown.map(({ group, files }) => (
        <Section
          key={`${props.tab}:${group}`}
          group={group}
          files={files}
          view={props.view}
          pictures={pictures}
          places={places}
          onOpen={props.onOpen}
        />
      ))}
      {shown.length === 0 ? (
        <p
          className={cn(
            "text-xs text-muted-foreground",
            props.label === null ? "py-6 text-center" : "py-1",
          )}
        >
          {listing.data === null
            ? "Reading the folder"
            : props.query.trim() !== ""
              ? "Nothing matches that."
              : props.emptyText}
        </p>
      ) : null}
    </section>
  );
}

/** The project's folders, each one but the thread's own a press from leaving it, and Add a folder. */
function FoldersRow(props: {
  readonly environmentId: EnvironmentId;
  readonly folders: ReadonlyArray<string>;
  /** The thread's own folder, marked and kept. */
  readonly cwd: string;
  /** Null where the folders are no saved project yet: none can be taken out. */
  readonly onRemove: ((folder: string) => void) | null;
  readonly onAdd: (folder: string) => void;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", props.className)} aria-label="Folders">
      <span className={MODULE_HEADING}>Folders</span>
      {props.folders.map((folder) => {
        const own = studioFolderKey(folder) === studioFolderKey(props.cwd);
        const folderName = studioFolderName(folder);
        const onRemove = props.onRemove;
        return (
          <span
            key={folder}
            className={cn(
              "inline-flex h-7 min-w-0 items-center gap-1 rounded-lg border border-border ps-2 text-xs text-foreground",
              own ? "bg-accent/60 pe-2" : "pe-0.5",
            )}
          >
            <FolderIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="max-w-40 truncate">{folderName}</span>
            {own || onRemove === null ? null : (
              <Button
                variant="ghost-muted"
                size="icon-xs"
                aria-label={`Take ${folderName} out of the project`}
                onClick={() => onRemove(folder)}
              >
                <XIcon />
              </Button>
            )}
          </span>
        );
      })}
      <AddFolderMenu
        environmentId={props.environmentId}
        exclude={props.folders}
        onAdd={props.onAdd}
      />
    </div>
  );
}

/** The links the project's brief gathered, a web address opening in the browser. */
function LinksList(props: { readonly links: ReadonlyArray<string> }) {
  return (
    <section aria-label="Links" className={SECTION_STACK}>
      <h2 className={MODULE_HEADING}>Links</h2>
      <ul className="flex flex-col border-t border-border">
        {props.links.map((link) => (
          <li key={link} className="truncate border-b border-border p-3 text-sm">
            {/^https?:\/\//.test(link) ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                {link}
              </a>
            ) : (
              link
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The project page, the engineering surfaces' Project tab (in place of the
 * file explorer). A project is a grouping of folders with one brief
 * (`useStudioProjects.ts`); a folder in none is a project of its own. The page
 * shows the project's name and brief, its folders (add or take one out), then
 * its overview first (`ProjectOverview.tsx`: the lead part, the open issues
 * its checks found, every part with its checks, recent work), everything its
 * folders hold, folder by folder and filed as an engineer files it (models,
 * boards, drawings, studies and jobs, documents, fabrication files), each a
 * tile that opens in the viewer or as a document, and every thread in any of
 * its folders. Source stays in T3 Code's explorer (Source, with code tools).
 * The engineering interface shows the Overview alone, its folders and links at
 * its end: what the other tabs list, its modules hold, and the project's chats
 * are down the left (`StudioSidebar`). Its New starts new designs only; the
 * jobs on a part are in the top bar's menus.
 */
export function ProjectPage(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly projectName: string;
  /** The folder's record; null for a thread's own scratch folder, which is no project. */
  readonly projectId: ProjectId | null;
  readonly threadRef: ScopedThreadRef;
  readonly workspaceMutationId: string | null;
  /** This chat is on its first turn. */
  readonly firstTurnWorking: boolean;
}) {
  const { environmentId, cwd, threadRef } = props;
  const [tab, setTab] = useState<"overview" | "files" | "references" | "threads">("overview");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">(readView);
  const [newOpen, setNewOpen] = useState<{
    readonly open: boolean;
    readonly count: number;
    readonly discipline?: Discipline;
    readonly templateId?: string;
  }>({ open: false, count: 0 });
  const documents = useDocumentTemplates(environmentId);
  const pendingNew = useNewDialogStore((store) => store.request);
  const takeNew = useNewDialogStore((store) => store.take);
  const openNew = (discipline?: Discipline) =>
    setNewOpen((current) => ({
      open: true,
      count: current.count + 1,
      ...(discipline === undefined ? {} : { discipline }),
    }));
  const chooseView = (next: "grid" | "list") => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage is off: the choice holds for this page.
    }
  };
  const composerRef = useComposerHandleContext();
  const plainWords = useEngineeringInterface();
  // New asked for from outside the page (the library's Make
  // one): where this page shows its New, it takes the request and opens on it, once.
  const showsNew = composerRef !== null && !plainWords;
  useEffect(() => {
    if (pendingNew === null || !showsNew) return;
    const asked = takeNew(false);
    if (asked === null) return;
    // oxlint-disable-next-line react/set-state-in-effect -- Takes the ask out of the store, so this New alone opens on it.
    setNewOpen((current) => ({
      open: true,
      count: current.count + 1,
      ...(asked.discipline === null ? {} : { discipline: asked.discipline }),
      ...(asked.templateId === null ? {} : { templateId: asked.templateId }),
    }));
  }, [pendingNew, showsNew, takeNew]);
  const shownTab = plainWords ? "overview" : tab;
  const studio = useStudioProjectAt(environmentId, cwd);
  const saveProject = useSaveStudioProject(environmentId);
  const knownFolders = useEnvironmentFolders(environmentId);
  const isProject = props.projectId !== null;
  const folders = studio?.project.folders ?? [cwd];
  const name = studio?.project.name ?? props.projectName;
  const open = useOpenFromOverview(threadRef);
  // Files dropped on the Overview go into the project, as onto a Drive folder; one part opens.
  const importer = useImportIntoProject(isProject && plainWords ? cwd : null, name, open);
  // What it is, as the brief says it: the project's description under its name.
  const purpose = studio?.project.brief.purpose.trim().split("\n")[0]?.trim() ?? "";
  const byHand = !useSimpleView();
  // New's Part, and Start a part by hand: the starter in `parts/`, opened in CAD mode.
  const addPart = useAddPart(threadRef, cwd);
  const startPart = addPart === null ? null : () => void addPart({ name: "Part" });
  const links = (studio?.project.brief.links ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const listing = useEnvironmentQuery(
    projectEnvironment.listEntries({ environmentId, input: { cwd } }),
  );
  const offers = useMemo(() => {
    const known = plugins ?? [];
    const skills = new Set(known.flatMap((plugin) => (plugin.enabled ? plugin.skills : [])));
    // Until the plugins are known, only what needs no skill, so nothing reads as not installed.
    return templateOffers(skills, known).filter(
      (offer) =>
        (!plainWords || offer.template.source === "new") &&
        (plugins !== undefined || offer.availability.on),
    );
  }, [plugins, plainWords]);
  // What a template can work from: the models and boards in this thread's folder.
  const parts = useMemo(
    () =>
      groupProjectFiles(
        (listing.data?.entries ?? [])
          .filter((entry) => entry.kind === "file" && entry.ignored !== true)
          .map((entry) => entry.path),
      )
        .filter(({ group }) => DESIGN_GROUPS.has(group))
        .flatMap(({ files }) => files.map((file) => file.path)),
    [listing.data],
  );
  // Every folder's record, for the threads in it.
  const folderKey = folders.join("\n");
  const projectRefs = useMemo(
    () =>
      folderKey
        .split("\n")
        .map((folder) => folderProject(knownFolders, folder))
        .filter((project) => project !== null)
        .map((project) => scopeProjectRef(project.environmentId, project.id)),
    [folderKey, knownFolders],
  );
  const onlyChat = projectChats(useThreadShellsForProjectRefs(projectRefs)).length <= 1;
  const folderNames = useMemo(
    () =>
      folders.length < 2
        ? null
        : new Map(
            folders.flatMap((folder) => {
              const project = folderProject(knownFolders, folder);
              return project === null ? [] : [[project.id, studioFolderName(folder)] as const];
            }),
          ),
    [folders, knownFolders],
  );

  const addFolder = (folder: string) =>
    void saveProject(
      studio?.id ?? null,
      studio === null
        ? {
            name: props.projectName,
            template: null,
            brief: EMPTY_BRIEF,
            folders: [cwd, folder],
            createdAt: new Date().toISOString(),
          }
        : { ...studio.project, folders: [...studio.project.folders, folder] },
    );
  const removeFolder = (folder: string) => {
    if (studio === null) return;
    void saveProject(studio.id, {
      ...studio.project,
      folders: studio.project.folders.filter(
        (entry) => studioFolderKey(entry) !== studioFolderKey(folder),
      ),
    });
  };

  // A file in another of the project's folders is reached by its full path.
  // A cadgen 0.8 model is reached by its document id, whichever folder holds its script.
  const threadPath = (root: string, relativePath: string) =>
    isDocumentId(relativePath) || studioFolderKey(root) === studioFolderKey(cwd)
      ? relativePath
      : `${studioFolderKey(root)}/${relativePath}`;
  // Opening a thing from the Overview keeps the panel's width (`openFromOverview`).
  const openPath = (root: string, relativePath: string) =>
    void open(threadPath(root, relativePath));
  const openIn = (root: string) => (file: ProjectFile) => openPath(root, file.path);

  const page = (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-gutter-both"
      data-project-page=""
    >
      {/* In Engineering the project is named at the sidebar's top and New is in the panel's row. */}
      <header className={cn("border-b border-border px-6 pt-6 pb-3", plainWords && "hidden")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-foreground">{name}</h1>
            {purpose === "" || plainWords ? null : (
              <p className="mt-1 truncate text-sm text-muted-foreground">{purpose}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {offers.length === 0 || composerRef === null ? null : (
              <Button size="sm" onClick={() => openNew()}>
                <PlusIcon />
                New
              </Button>
            )}
            {plainWords ? null : (
              <div role="tablist" aria-label="Project contents" className="flex gap-2">
                {(
                  [
                    ["overview", "Overview"],
                    ["files", "Files"],
                    ["references", "References"],
                    ...(isProject
                      ? [["threads", plainWords ? "History" : "Threads"] as const]
                      : []),
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "h-7 rounded-lg px-2.5 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      tab === id
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {composerRef === null || plainWords ? null : (
          <ProjectSetup
            environmentId={environmentId}
            cwd={cwd}
            composerRef={composerRef}
            workspaceMutationId={props.workspaceMutationId}
          />
        )}
        {isProject && !plainWords ? (
          <FoldersRow
            environmentId={environmentId}
            folders={folders}
            cwd={cwd}
            onRemove={studio === null ? null : removeFolder}
            onAdd={addFolder}
            className="mt-3"
          />
        ) : null}
        <div className={cn("mt-3 flex items-center gap-2", shownTab === "overview" && "hidden")}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              tab === "files"
                ? "Find a part, board or document"
                : tab === "threads"
                  ? plainWords
                    ? "Find in the history"
                    : "Find a thread"
                  : "Find a reference"
            }
            aria-label="Find in the project"
            size="sm"
          />
          <div
            role="group"
            aria-label="View"
            className={cn("flex shrink-0 gap-2", tab === "threads" && "invisible")}
          >
            <Button
              variant={view === "grid" ? "secondary" : "ghost-muted"}
              size="icon-sm"
              aria-label="Show as tiles"
              aria-pressed={view === "grid"}
              onClick={() => chooseView("grid")}
            >
              <LayoutGridIcon />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost-muted"}
              size="icon-sm"
              aria-label="Show as a list"
              aria-pressed={view === "list"}
              onClick={() => chooseView("list")}
            >
              <ListIcon />
            </Button>
          </div>
        </div>
      </header>

      {/* One column in Studio, as Home is, so the README and the files below line up. */}
      <WorkspacePageContainer className={plainWords ? undefined : "mx-0 max-w-none"}>
        {shownTab === "overview" ? (
          <ProjectOverview
            environmentId={environmentId}
            folders={folders}
            mutationId={props.workspaceMutationId}
            composerRef={composerRef}
            projectRefs={projectRefs}
            folderNames={folderNames}
            currentThreadId={threadRef.threadId}
            onOpen={openPath}
            linkTo={(root, path) => serializeComposerFileLink(threadPath(root, path))}
            onShowThreads={isProject && !plainWords ? () => setTab("threads") : null}
            onNewDocument={composerRef === null ? null : () => openNew("Documents")}
            byHand={byHand}
            onStartPart={startPart}
            threadRef={threadRef}
            units={studio?.project.brief.units ?? "mm"}
            readme={
              plainWords ? (
                <ReadmeOverview
                  environmentId={environmentId}
                  cwd={cwd}
                  purpose={studio?.project.brief.purpose ?? ""}
                  // A later chat in a project with no README may have no reason to write one.
                  writing={props.firstTurnWorking && onlyChat}
                  mutationId={props.workspaceMutationId}
                  onOpenPath={(path) => openPath(cwd, path)}
                />
              ) : null
            }
          />
        ) : shownTab === "threads" ? (
          <ProjectThreads
            projectRefs={projectRefs}
            folderNames={folderNames}
            currentThreadId={threadRef.threadId}
            query={query}
          />
        ) : (
          folders.map((folder) => (
            <FolderFiles
              key={folder}
              environmentId={environmentId}
              root={folder}
              label={folders.length > 1 ? studioFolderName(folder) : null}
              tab={shownTab}
              query={query}
              view={view}
              mutationId={
                studioFolderKey(folder) === studioFolderKey(cwd) ? props.workspaceMutationId : null
              }
              emptyText={
                shownTab === "files"
                  ? folders.length > 1
                    ? "Nothing filed here yet."
                    : "Nothing here yet. The models, boards and documents the agent makes show up here."
                  : folders.length > 1
                    ? "No references here."
                    : "No references yet. Add sketches, photos, datasheets or links in the brief."
              }
              onOpen={openIn(folder)}
            />
          ))
        )}
        {links.length > 0 && (shownTab === "references" || plainWords) ? (
          <LinksList links={links} />
        ) : null}
        {isProject && plainWords ? (
          <FoldersRow
            environmentId={environmentId}
            folders={folders}
            cwd={cwd}
            onRemove={studio === null ? null : removeFolder}
            onAdd={addFolder}
            className="border-t border-border pt-3"
          />
        ) : null}
      </WorkspacePageContainer>
      {/* In Engineering New is the panel toolbar's, always there (`StudioNew`). */}
      {composerRef === null || plainWords ? null : (
        <NewDialog
          key={newOpen.count}
          open={newOpen.open}
          onOpenChange={(open) => setNewOpen((current) => ({ ...current, open }))}
          environmentId={environmentId}
          cwd={cwd}
          offers={offers}
          fileTemplates={documents.templates}
          onAddTemplate={documents.add}
          onShowTemplates={documents.show}
          {...(newOpen.discipline === undefined ? {} : { initialDiscipline: newOpen.discipline })}
          initialTemplateId={newOpen.templateId ?? null}
          parts={parts}
          onCreate={(job) => {
            handToChat(composerRef, job.prompt);
            // The job goes to this chat: the Overview steps back beside it, so the work shows.
            useRightPanelStore.getState().setMaximized(threadRef, false);
          }}
          onNewPart={(part) => addPart?.(part) ?? Promise.resolve()}
        />
      )}
    </div>
  );
  return importer === null ? (
    page
  ) : (
    <ImportDropZone into={{ name, onPaths: (paths) => void importer.copy(paths) }}>
      {page}
    </ImportDropZone>
  );
}
