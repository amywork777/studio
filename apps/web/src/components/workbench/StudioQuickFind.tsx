import type { EnvironmentId } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  CompassIcon,
  HomeIcon,
  ToolCaseIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { useComposerHandleContext } from "~/composerHandleContext";
import { cn } from "~/lib/utils";
import { buildThreadRouteParams } from "~/threadRoutes";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { CommandPaletteContent } from "../CommandPaletteContent";
import {
  CommandDialogPopup,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandList,
} from "../ui/command";
import { chatStanding } from "./chatStanding";
import { useDocumentTemplates } from "./documentTemplates";
import { FileKindIcon } from "./FileKindIcon";
import { type HardwareActionGroup, hardwareActions } from "./hardwareActions";
import { CHAT_ICON, fileTint, KIND_ICONS, KIND_TINT, MENU_ICONS } from "./kinds";
import { LIBRARY_DOCUMENTS, ownTemplateEntries } from "./library/libraryCatalog";
import { findInLibrary } from "./library/librarySearch";
import { useExamples } from "./library/useSampleProject";
import { handToChat } from "./handToChat";
import { withToolLine } from "./toolUsed";
import { DOCUMENT_TEMPLATES, newWorkPrompt } from "./newTemplates";
import { useOpenedThreads } from "./openedThreads";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { historyOutcome } from "./projectHistory";
import { partLabel } from "./partNames";
import { ProjectThumb, projectStanding } from "./ProjectChoices";
import { partLink } from "./partLink";
import { classifyProjectFile, type ProjectFile, type ProjectGroup } from "./projectFiles";
import type { ListedProject } from "./projectList";
import {
  findFiles,
  findJobs,
  folderDocuments,
  folderOtherFiles,
  folderParts,
  type FoundPart,
  holdsWords,
} from "./quickFind";
import { homeRecent, recentChats } from "./recentActivity";
import { useRecentFiles } from "./recentFiles";
import { useAskNewProject } from "./StudioNew";
import { useOpenLibrary } from "./StudioNavLinks";
import { pictureVersions } from "./projectModels";
import { knownModelTitle, useProjectModels } from "./useFolderModels";
import { useFolderPaths } from "./useFolderPaths";
import { showChat } from "./overviewPanel";
import { openPartInCad } from "./useOpenInWorkbench";
import { useOpenProject } from "./useOpenProject";
import { useTourStore } from "./tourSteps";
import { usePictures } from "./usePictures";
import { useProjectList } from "./useProjectList";
import { chatLabel } from "./workspaceTitle";

const ICON = "size-4 shrink-0 text-muted-foreground";
/** A group lists this many with nothing typed, and this many matches. */
const SHOWN_UNTYPED = 5;
const SHOWN_TYPED = 8;
/** Recent chats ahead of the open project's, inside a project with nothing typed. */
const SHOWN_RECENT_CHATS = 4;

/** A part's, a document's or a chat's row: its kind's icon in its kind's color (`kinds.ts`). */
function KindIcon(props: { readonly group: ProjectGroup | "Chats" }) {
  const Icon = props.group === "Chats" ? CHAT_ICON : KIND_ICONS[props.group];
  return (
    <Icon
      className={cn("size-4 shrink-0", props.group === "Chats" ? KIND_TINT : fileTint(props.group))}
    />
  );
}

/**
 * A part's picture, small, as the Overview pictures it (`usePictures`, from the same cache), in
 * the box a project's picture has in this list; its kind's icon there until it has one.
 */
function PartThumb(props: {
  readonly environmentId: EnvironmentId;
  readonly root: string;
  readonly file: ProjectFile;
}) {
  const path = props.file.picture ?? props.file.path;
  const picture = usePictures({
    environmentId: props.environmentId,
    cwd: props.root,
    paths: [path],
    versions: pictureVersions([props.file]),
  }).get(path);
  return (
    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-(--model-ground)">
      {picture === undefined ? (
        <KindIcon group={props.file.group} />
      ) : (
        <img src={picture} alt="" className="size-full object-cover" />
      )}
    </span>
  );
}

/** A job's row: the icon of its menu, which is the icon of what it makes. */
function JobIcon(props: { readonly group: HardwareActionGroup }) {
  const Icon = MENU_ICONS[props.group];
  return <Icon className={ICON} />;
}

interface Row {
  readonly value: string;
  /** Sits centred in the row's 32px slot, so every title starts at the same edge. */
  readonly icon: ReactNode;
  readonly title: string;
  readonly description?: string;
  /** The description asks for the person: a project's chat waiting on them. */
  readonly waiting?: boolean;
  /** Said at the row's end: "Open" on the project on screen. */
  readonly trailing?: string;
  readonly run: () => void;
}

interface Group {
  readonly label: string;
  readonly rows: ReadonlyArray<Row>;
}

function QuickFindBody(props: {
  readonly environmentId: EnvironmentId;
  readonly initialQuery: string;
  readonly close: () => void;
}) {
  const { environmentId, close } = props;
  const [query, setQuery] = useState(props.initialQuery);
  const typed = query.trim() !== "";
  const workspace = useOpenWorkspaceStore((store) => store.workspace);
  const { cards } = useProjectList(environmentId);
  const documents = useDocumentTemplates(environmentId);
  const examples = useExamples(environmentId).examples;
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const composerRef = useComposerHandleContext();
  const openProject = useOpenProject();
  const navigate = useNavigate();
  const askNewProject = useAskNewProject();
  const openLibrary = useOpenLibrary();
  const onHome = useLocation({ select: (location) => location.pathname === "/" });
  const opened = useOpenedThreads();
  const recentFiles = useRecentFiles();

  const here = workspace === null ? null : studioFolderKey(workspace.folder);
  const current =
    here === null
      ? null
      : (cards.find((card) =>
          card.project.folders.some((folder) => studioFolderKey(folder) === here),
        ) ?? null);

  // Every project's parts, the open project's first; a folder in no project has its own.
  const owners = (() => {
    const ordered =
      current === null ? cards : [current, ...cards.filter((card) => card !== current)];
    const entries = ordered.flatMap((card) =>
      card.project.folders.map((root) => [root, card] as const),
    );
    return workspace !== null && current === null
      ? [[workspace.folder, null] as const, ...entries]
      : entries;
  })();
  const listings = useFolderPaths(
    environmentId,
    owners.map(([root]) => root),
  );
  // Each folder's cadgen 0.8 models, among its parts by their document ids.
  const models = useProjectModels({
    environmentId,
    folders: owners.map(([root]) => root),
  });
  const parts = folderParts<ListedProject | null>(
    listings.map((listing, index) => ({
      project: owners[index]?.[1] ?? null,
      root: listing.root,
      paths: listing.paths,
      models: models.get(listing.root) ?? [],
    })),
  );
  const docs = folderDocuments<ListedProject | null>(
    listings.map((listing, index) => ({
      project: owners[index]?.[1] ?? null,
      root: listing.root,
      paths: listing.paths,
    })),
  );
  const otherFiles = folderOtherFiles<ListedProject | null>(
    listings.map((listing, index) => ({
      project: owners[index]?.[1] ?? null,
      root: listing.root,
      paths: listing.paths,
    })),
  );
  const inHere = (part: FoundPart<ListedProject | null>) =>
    here !== null &&
    (part.project === null ? studioFolderKey(part.root) === here : part.project === current);

  const skills = new Set(
    (plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : [])),
  );
  const part = workspace?.part ?? null;
  const process = workspace?.process;
  const menus = part === null ? [] : hardwareActions(part.kind, skills, process);
  // A model's id is never a title: its name, as its viewer or the project's list says it.
  const partTitle =
    part === null
      ? null
      : (part.name ??
        classifyProjectFile(part.path)?.title ??
        knownModelTitle(part.path) ??
        "the part");

  // A job, or a new document, starts as New's Create starts it: written into the chat and sent.
  const startWork = (prompt: string) => {
    if (composerRef !== null) handToChat(composerRef, prompt);
    close();
  };
  const openPart = (found: FoundPart<ListedProject | null>) => {
    close();
    // A cadgen 0.8 model opens by its document id, whichever folder holds its script.
    const full =
      found.file.document !== undefined ? found.file.path : `${found.root}/${found.file.path}`;
    if (workspace !== null && inHere(found)) {
      const path = studioFolderKey(found.root) === here ? found.file.path : full;
      openPartInCad(plugins, workspace.threadRef, path);
    } else if (found.project !== null) {
      void openProject(found.project.folder, found.project.threads, (ref) =>
        openPartInCad(plugins, ref, full),
      );
    }
  };
  const go = (then: () => void) => () => {
    close();
    then();
  };

  const jobs: Group | null =
    part === null || partTitle === null
      ? null
      : {
          label: `What to do with ${partTitle}`,
          rows: findJobs(menus, query).map(({ action, place }) => ({
            value: `job:${action.id}`,
            icon: <JobIcon group={action.group} />,
            title: action.label,
            description: place,
            run: () => startWork(withToolLine(action.label, action.prompt(partLink(part)))),
          })),
        };
  const ownerName = (project: ListedProject | null) => project?.project.name ?? "";
  const shownParts = typed ? findFiles(parts, query, ownerName) : parts.filter(inHere);
  const partRows: Group = {
    label: typed || current === null ? "Parts" : `Parts in ${current.project.name}`,
    rows: shownParts.map((found) => ({
      value: `part:${found.root}\n${found.file.path}`,
      icon: <PartThumb environmentId={environmentId} root={found.root} file={found.file} />,
      title: found.file.title,
      description:
        !typed || inHere(found)
          ? found.file.kind
          : `${found.file.kind} · ${found.project?.project.name ?? ""}`,
      run: () => openPart(found),
    })),
  };
  const shownDocs = typed
    ? findFiles(docs, query, ownerName)
    : docs.filter(inHere).slice(0, SHOWN_UNTYPED);
  const documentFiles: Group = {
    label: typed || current === null ? "Documents" : `Documents in ${current.project.name}`,
    rows: shownDocs.map((found) => ({
      value: `doc:${found.root}\n${found.file.path}`,
      icon: <KindIcon group="Documents" />,
      title: found.file.title,
      description:
        !typed || inHere(found)
          ? found.file.kind
          : `${found.file.kind} · ${found.project?.project.name ?? ""}`,
      run: () => openPart(found),
    })),
  };
  // Every other file, by its name or kind ("cam job", "drawing"), only once something is typed.
  const fileRows: Group = {
    label: "Files",
    rows: (typed ? findFiles(otherFiles, query, ownerName) : [])
      .slice(0, SHOWN_TYPED)
      .map((found) => ({
        value: `file:${found.root}\n${found.file.path}`,
        icon: <PartThumb environmentId={environmentId} root={found.root} file={found.file} />,
        title: found.file.title,
        description: inHere(found)
          ? found.file.kind
          : `${found.file.kind} · ${found.project?.project.name ?? ""}`,
        run: () => openPart(found),
      })),
  };
  // A chat as the sidebar shows it: how it stands (Needs you, Working, when), with its project's
  // name when that is not the project open; opening one from another project opens that project.
  const chatRow = (
    card: ListedProject,
    thread: ListedProject["threads"][number],
    key: string,
  ): Row => {
    const standing = chatStanding(thread);
    return {
      value: `${key}:${thread.id}`,
      icon: <KindIcon group="Chats" />,
      title: chatLabel(thread.title),
      description: card === current ? standing.text : `${standing.text} · ${card.project.name}`,
      waiting: historyOutcome(thread) === "needs-you",
      ...(thread.id === workspace?.threadRef.threadId ? { trailing: "Open" } : {}),
      run: go(() => {
        const ref = scopeThreadRef(thread.environmentId, thread.id);
        showChat(ref);
        if (thread.id === workspace?.threadRef.threadId) return;
        void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
      }),
    };
  };
  // Inside a project with nothing typed, the chats opened lately in every project lead, the one
  // open left out: ⌘K then Enter goes back to the chat before, whichever project it is in.
  const lately =
    typed || current === null
      ? []
      : recentChats(cards, opened, workspace?.threadRef.threadId ?? null, SHOWN_RECENT_CHATS);
  const recentChatRows: Group = {
    label: "Recent chats",
    rows: lately.map(({ card, thread }) => chatRow(card, thread, "recent-chat")),
  };
  const leading = new Set(lately.map(({ thread }) => thread.id));
  // Chats, as the sidebar lists a project's: the open project's newest when nothing is typed,
  // but those Recent chats already shows.
  const chats = (typed ? cards : current === null ? [] : [current])
    .flatMap((card) => card.threads.map((thread) => ({ card, thread })))
    .filter(({ card, thread }) =>
      typed ? holdsWords(`${thread.title}\n${card.project.name}`, query) : !leading.has(thread.id),
    )
    .toSorted((a, b) => b.thread.updatedAt.localeCompare(a.thread.updatedAt))
    .slice(0, typed ? SHOWN_TYPED : SHOWN_UNTYPED);
  const chatRows: Group = {
    label: typed || current === null ? "Chats" : `Chats in ${current.project.name}`,
    rows: chats.map(({ card, thread }) => chatRow(card, thread, "chat")),
  };
  // What was opened lately, chats and files across every project, as Drive's Recent lists it:
  // with nothing typed and no project open, so Home's ⌘K jumps back into the work.
  const recent: Group = {
    label: "Recent",
    rows:
      typed || current !== null
        ? []
        : homeRecent(cards, opened, recentFiles, SHOWN_UNTYPED).map((item) => {
            const ref = scopeThreadRef(item.thread.environmentId, item.thread.id);
            const openChat = () => {
              showChat(ref);
              void navigate({
                to: "/$environmentId/$threadId",
                params: buildThreadRouteParams(ref),
              });
            };
            const description = `${item.card.project.name} · ${formatRelativeTimeLabel(item.at)}`;
            // A chat says when it is at work, waiting on the person or stopped, as the sidebar's do.
            const live = historyOutcome(item.thread);
            return item.kind === "chat"
              ? {
                  value: `recent:chat:${item.thread.id}`,
                  icon: <KindIcon group="Chats" />,
                  title: chatLabel(item.thread.title),
                  description:
                    live === "needs-you" ||
                    live === "working" ||
                    live === "failed" ||
                    live === "limited"
                      ? `${item.card.project.name} · ${chatStanding(item.thread).text}`
                      : description,
                  waiting: live === "needs-you",
                  run: go(openChat),
                }
              : {
                  value: `recent:file:${item.thread.id}\n${item.file.path}`,
                  icon: <FileKindIcon path={item.file.path} className="size-4" />,
                  title:
                    item.file.title ??
                    partLabel(item.file.path.split(/[\\/]/).pop() ?? item.file.path),
                  description,
                  run: go(() => {
                    openPartInCad(plugins, ref, item.file.path);
                    openChat();
                  }),
                };
          }),
  };
  const projects: Group = {
    label: "Projects",
    rows: cards
      .filter(
        (card) =>
          !typed ||
          holdsWords(
            [
              card.project.name,
              card.project.brief.purpose,
              ...card.threads.map((t) => t.title),
            ].join("\n"),
            query,
          ),
      )
      // A project as the switcher shows it: its picture and when it was last opened, or Needs you.
      .map((card) => {
        const standing = projectStanding(card);
        return {
          value: `project:${card.id}`,
          icon: <ProjectThumb environmentId={environmentId} project={card.project} />,
          title: card.project.name,
          description: standing.text,
          waiting: standing.waiting,
          ...(card === current ? { trailing: "Open" } : {}),
          run: go(() => {
            if (card !== current) void openProject(card.folder, card.threads);
          }),
        };
      }),
  };
  const places: ReadonlyArray<Row & { readonly terms: string }> = [
    ...(onHome
      ? []
      : [
          {
            value: "go:home",
            icon: <HomeIcon className={ICON} />,
            title: "Home",
            terms: "home projects all start",
            run: go(() => void navigate({ to: "/" })),
          },
        ]),
    {
      value: "go:new-project",
      icon: <PlusIcon className={ICON} />,
      title: "New project",
      terms: "new project start create",
      run: go(askNewProject),
    },
    // The tour shows a project's workspace: from Home it opens the last project first.
    ...(workspace === null && cards[0] === undefined
      ? []
      : [
          {
            value: "go:tour",
            icon: <CompassIcon className={ICON} />,
            title: "Take the tour",
            terms: "tour help start learn how onboarding",
            run: go(() => {
              const last = cards[0];
              if (workspace === null && last !== undefined) {
                void openProject(last.folder, last.threads);
              }
              useTourStore.getState().start();
            }),
          },
        ]),
    {
      value: "go:trash",
      icon: <Trash2Icon className={ICON} />,
      title: "Trash",
      terms: "trash deleted removed restore delete forever bin",
      run: go(() => void navigate({ to: "/trash" })),
    },
    {
      value: "go:library",
      icon: <ToolCaseIcon className={ICON} />,
      title: "Toolbox",
      terms:
        "toolbox library examples sample finished projects copy learn document types skills templates what can studio make",
      run: go(() => openLibrary()),
    },
    {
      value: "go:settings",
      icon: <SettingsIcon className={ICON} />,
      title: "Settings",
      terms: "settings preferences ai agents appearance",
      run: go(() => void navigate({ to: "/settings" })),
    },
  ];
  // A document from a template, written into the chat as the New dialog writes it (`NewDialog`).
  const documentRows: Group | null =
    !typed || workspace === null
      ? null
      : {
          label: "New document",
          rows: [...DOCUMENT_TEMPLATES, ...documents.templates]
            .filter((template) =>
              holdsWords(
                `${template.label}\n${template.description}\nnew document template`,
                query,
              ),
            )
            .map((template) => ({
              value: `document:${template.id}`,
              icon: <KindIcon group="Documents" />,
              title: template.label,
              description: template.description,
              run: () =>
                startWork(
                  newWorkPrompt({
                    template,
                    name: template.defaultName,
                    folder: template.folder,
                    units: "mm",
                    part: null,
                    description: "",
                    ...(template.file === undefined
                      ? {}
                      : { templateLink: serializeComposerFileLink(template.file) }),
                  }),
                ),
            })),
        };
  // The Library's examples and templates, by its own search, each opening the page it opens.
  const foundInLibrary = findInLibrary(
    examples,
    [...LIBRARY_DOCUMENTS, ...ownTemplateEntries(documents.templates)],
    query,
    SHOWN_TYPED,
  );
  const library: Group = {
    label: "Toolbox",
    rows: [
      ...foundInLibrary.examples.map((sample) => ({
        value: `example:${sample.id}`,
        icon: <KindIcon group="CAD" />,
        title: sample.name,
        description: "Example",
        run: go(() => void navigate({ to: "/library/examples/$id", params: { id: sample.id } })),
      })),
      ...foundInLibrary.documents.map((entry) => ({
        value: `library:${entry.id}`,
        icon: <KindIcon group="Documents" />,
        title: entry.name,
        description: entry.what,
        run: go(() => openLibrary(entry.id)),
      })),
    ],
  };
  const goTo: Group = {
    label: "Go to",
    rows: places.filter((place) => !typed || holdsWords(`${place.title}\n${place.terms}`, query)),
  };
  const groups = (
    typed
      ? [jobs, partRows, documentFiles, fileRows, chatRows, projects, library, documentRows, goTo]
      : [recent, recentChatRows, partRows, documentFiles, chatRows, projects, goTo]
  ).filter((group): group is Group => group !== null && group.rows.length > 0);

  return (
    <CommandPaletteContent
      mode="none"
      value={query}
      onValueChange={setQuery}
      aria-label="Find a project, a part, a document or a chat, or what to do with a part"
      inputProps={{
        placeholder:
          partTitle === null
            ? "Find a project, a part, a document or a chat"
            : `Find anything, or what to do with ${partTitle}`,
      }}
      {...(groups.length === 0 ? {} : { footerActionLabel: "Choose" })}
      footerTrailing={
        typed || partTitle === null ? null : (
          <span>Type what to do, like a strength check or G-code</span>
        )
      }
    >
      {groups.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing matches that.</p>
      ) : (
        <CommandList>
          {groups.map((group) => (
            <CommandGroup key={group.label}>
              <CommandGroupLabel>{group.label}</CommandGroupLabel>
              {group.rows.map((row) => (
                <CommandItem
                  key={row.value}
                  value={row.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={row.run}
                >
                  <span className="flex w-8 shrink-0 justify-center">{row.icon}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-foreground">{row.title}</span>
                    {row.description ? (
                      <span
                        className={cn(
                          "truncate text-xs",
                          row.waiting ? "text-info-foreground" : "text-muted-foreground",
                        )}
                      >
                        {row.description}
                      </span>
                    ) : null}
                  </span>
                  {row.trailing ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{row.trailing}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      )}
    </CommandPaletteContent>
  );
}

/**
 * ⌘K in the engineering interface, in place of T3 Code's command palette: one box that finds a
 * project, a part in any project, or any job for the part on screen, the long tail the menus leave
 * out as well (`quickFind.ts`), with Home, New project, Trash, the Library (and, once something is typed, its examples and templates) and Settings. Outside a project it opens on what was opened lately (Recent); inside one, on the chats opened lately in every project (Recent chats), then the project's. Picking a job writes
 * it into the chat's composer, as the Toolbox does (`StudioToolbox`); picking a part opens it, in its project if that is another.
 */
export function StudioQuickFind(props: {
  /** What it opens with typed, else nothing. */
  readonly query: string;
  readonly setOpen: (open: boolean) => void;
}) {
  const composerRef = useComposerHandleContext();
  const environmentId = usePrimaryEnvironmentId();
  return (
    <CommandDialogPopup
      aria-label="Find"
      className="overflow-hidden"
      data-command-palette="true"
      data-testid="command-palette"
      finalFocus={() => {
        // A chat's box, where there is one; else back to what was focused.
        if (!composerRef?.current) return true;
        composerRef.current.focusAtEnd();
        return false;
      }}
      onBackdropPointerDown={() => props.setOpen(false)}
    >
      {environmentId === null ? null : (
        <QuickFindBody
          environmentId={environmentId}
          initialQuery={props.query}
          close={() => props.setOpen(false)}
        />
      )}
    </CommandDialogPopup>
  );
}
