import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { DraftingCompassIcon, PaperclipIcon, SearchIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { shortcutLabelForCommand } from "~/keybindings";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { primaryServerKeybindingsAtom, serverEnvironment } from "~/state/server";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { NO_AGENT, OPEN_AGENTS } from "./agentWords";
import type { ListedProject } from "./projectList";
import { ENGINEERING_COMPOSER_PLACEHOLDER } from "./studioInterface";
import { splitStarred, useStarredStore } from "./starredProjects";
import { ImportDialogHost } from "./ImportDialog";
import { homeLayout } from "./homeStart";
import { ImportDropZone } from "./ImportDropZone";
import { ImportMenu } from "./ImportMenu";
import { NewFilesNotice } from "./NewFilesNotice";
import { PageTitle } from "./PageTitle";
import { waitingFirst } from "./ProjectChoices";
import { ProjectPicker } from "./ProjectPicker";
import { SketchDialog } from "./SketchDialog";
import { GetStarted, StartChoices, StartExamples, TileGroup } from "./StartChoices";
import { missingAgent } from "./startAgent";
import { canStart, nameOfPath, type StartAttachment } from "./startProject";
import { droppedPath, readStudioImport } from "./studioImportBridge";
import { MODULE_HEADING, SECTION_STACK } from "./studioLayout";
import { StudioNew } from "./StudioNew";
import { StudioTopBar } from "./StudioTopBar";
import { useImportActions } from "./useImportActions";
import { useNewPart } from "./useNewPart";
import { useOpenShortcut } from "./useOpenShortcut";
import { useProjectList } from "./useProjectList";
import { useProjectTiles } from "./useProjectTiles";
import { type ProjectStart, useStartOnce } from "./useStartProject";
import { useExamples } from "./library/useSampleProject";

/** Opens the quick find (`StudioQuickFind`): the top bar's search, and Cmd+O on Home. */
const openFind = () => openCommandPalette();

/** The top bar's search: it opens the quick find (⌘K, `StudioQuickFind`), which finds parts too. */
function FindButton() {
  const shortcut = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "commandPalette.toggle",
  );
  return (
    <button
      type="button"
      onClick={openFind}
      className="flex h-7 w-full max-w-72 items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-sm text-muted-foreground shadow-xs/5 outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset dark:bg-input/32"
    >
      <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left">Find anything</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </button>
  );
}

/**
 * Studio's Home, the way a CAD tool's welcome starts: what to make, and where you left off. With no
 * projects (`homeLayout`) it asks Where would you like to start?, with two big buttons (New part,
 * Import a STEP; `StartChoices`), Home's Start box right under them, and the examples
 * Studio ships to make a copy of. With projects it is Welcome back: the box, then your starred
 * projects and every other one, the last worked on first, as pictures of their parts, each opening
 * on its part (Amy, 2026-10-29: one Home, not a Projects page beside it), and the examples in a Get
 * started strip under them that folds away, its All examples the Library. The box takes what to
 * make: Start sends it to a new project (made, with a first chat that sends it), or, with a project
 * of yours chosen beside Attach, to a new chat in that project. New and Import beside the tiles add
 * a project: New the same New and dialog as a project's toolbar (a part, a board or a document, in
 * a new project), Import from files. A project with a chat waiting on the person (a question, an
 * approval) comes first, says so, and opens on that chat. Search finds a project, a part or a chat
 * (`StudioQuickFind`). One column, so the box and the tiles line up.
 */
export function StudioHome() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <StudioHomeFor environmentId={environmentId} />;
}

function StudioHomeFor(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const { list, cards } = useProjectList(environmentId);
  // Until the list arrives nothing shows under the box, and the start page waits (`homeLayout`).
  const loaded = list !== null;
  const layout = homeLayout({ loaded, projects: cards.length });
  const { examples } = useExamples(environmentId);
  // One start at a time, from the box or from New.
  const { busy, start } = useStartOnce(environmentId);
  const importActions = useImportActions();
  useNowMinute();
  useOpenShortcut(openFind);
  const { tile, dialogs } = useProjectTiles(environmentId, cards);
  const newPart = useNewPart(environmentId);
  const split = splitStarred(
    cards,
    useStarredStore((store) => store.starred),
  );
  const starred = waitingFirst(split.starred);
  // Every other project, the ones waiting on the person first, then the last worked on.
  const recent = waitingFirst(split.rest);
  // Home's New: Create starts a new project with the job as its first message, and its Part is
  // New part. On the start page it has no button, and opens when asked (New project from ⌘K).
  const newProject = (hideButton: boolean) => (
    <StudioNew
      environmentId={environmentId}
      cwd=""
      newProject
      hideButton={hideButton}
      buttonVariant="outline"
      onCreate={(job) => start({ kind: "new", job })}
      onNewPart={newPart.create}
    />
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <StudioTopBar>
          <FindButton />
        </StudioTopBar>
        <ImportDropZone>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
            <WorkspacePageContainer>
              <PageTitle
                title={layout === "start" ? "Where would you like to start?" : "Welcome back"}
              />
              <NewFilesNotice environmentId={environmentId} />
              {layout === "start" ? (
                <StartChoices
                  onNewPart={() => void newPart.create()}
                  newPartBusy={newPart.busy}
                  importActions={importActions}
                />
              ) : null}
              <StartProject environmentId={environmentId} cards={cards} busy={busy} start={start} />
              {!loaded ? null : layout === "start" ? (
                <>
                  <StartExamples examples={examples} />
                  {newProject(true)}
                </>
              ) : (
                <>
                  <section aria-label="Your projects" className={SECTION_STACK}>
                    {/* New and Import add a project: from a part, board or document, or from files. */}
                    <div className="flex items-center gap-2">
                      <h2 className={MODULE_HEADING}>Your projects</h2>
                      <div className="flex-1" />
                      {importActions === null ? null : <ImportMenu actions={importActions} />}
                      {newProject(false)}
                    </div>
                    {starred.length === 0 ? null : (
                      <TileGroup label="Starred">{starred.map(tile)}</TileGroup>
                    )}
                    {recent.length === 0 ? null : (
                      <TileGroup label={starred.length === 0 ? null : "Recent"}>
                        {recent.map(tile)}
                      </TileGroup>
                    )}
                  </section>
                  <GetStarted examples={examples} />
                </>
              )}
            </WorkspacePageContainer>
          </div>
        </ImportDropZone>
      </div>
      <ImportDialogHost environmentId={environmentId} />
      {dialogs}
    </SidebarInset>
  );
}

/** A file attached to Home's box: by its path on this computer, where the desktop app gives one. */
function fromFile(file: File): StartAttachment {
  const path = droppedPath(file);
  return path === null
    ? { name: file.name, path: null, file }
    : { name: nameOfPath(path), path, file: null };
}

const fromPath = (path: string): StartAttachment => ({ name: nameOfPath(path), path, file: null });

/** The files and folders attached to Home's box, each with its Remove. */
function AttachedList(props: {
  readonly attachments: ReadonlyArray<StartAttachment>;
  readonly onRemove: (index: number) => void;
}) {
  if (props.attachments.length === 0) return null;
  return (
    <ul aria-label="Attached" className="flex flex-wrap gap-2">
      {props.attachments.map((attachment, index) => (
        <li
          key={
            attachment.path ??
            `${attachment.name}-${attachment.file?.size}-${attachment.file?.lastModified}`
          }
          className="flex max-w-60 items-center gap-1 rounded-md border border-border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs text-foreground"
        >
          <span className="truncate">{attachment.name}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${attachment.name}`}
            onClick={() => props.onRemove(index)}
          >
            <XIcon />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Home's Start box, the AI's way in: say what to make and Start. It goes to a new project, as it
 * starts, or to a new chat in a project of yours chosen beside Attach (`ProjectPicker`), the box
 * then reading as a project's chat box does. Files can come with the words or on their own (a PRD,
 * requirements, sketches, CAD, a whole folder: Attach, or dropped on the box), and Start makes a
 * new project from them. Files go into the project's References and the agent reads them first
 * (`startMessage`). There is no Ask here: a question goes in the box, or in a chat. With no AI
 * agent to send to (`missingAgent`) it says so beside Start, in the chat box's words and with its
 * way to Settings, and Start makes nothing.
 */
function StartProject(props: {
  readonly environmentId: EnvironmentId;
  readonly cards: ReadonlyArray<ListedProject>;
  /** A start is under way (from here or from New). */
  readonly busy: boolean;
  readonly start: (work: ProjectStart) => Promise<void>;
}) {
  const { environmentId, busy } = props;
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = props.cards.find((card) => card.id === chosenId) ?? null;
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<StartAttachment[]>([]);
  // A file dropped on the box is attached, as the chat's box attaches it (Home elsewhere imports).
  const [attaching, setAttaching] = useState(false);
  const [sketching, setSketching] = useState(false);
  // The desktop app: files and folders, by their paths, copied into the project on Start.
  const bridge = readStudioImport();
  const attach = (added: ReadonlyArray<StartAttachment>) =>
    setAttachments((current) => [
      ...current,
      ...added.filter(
        (item) => item.path === null || !current.some((held) => held.path === item.path),
      ),
    ]);
  const fileInput = useRef<HTMLInputElement>(null);
  // The desktop app's picker takes folders too; the browser's takes files.
  const choose = () => {
    if (bridge === null) fileInput.current?.click();
    else void bridge.pick().then((paths) => attach(paths.map(fromPath)));
  };
  const run = props.start;
  const navigate = useNavigate();
  // No agent for the chat this would start: said here, before a project is made for nothing.
  const missing = missingAgent(
    useAtomValue(serverEnvironment.configValueAtom(environmentId)),
    chosen?.folder ?? null,
  );
  // Words or files make a start.
  const ready = missing === null && canStart(description, attachments, busy);
  const startNow = () => {
    if (!ready) return;
    void run({
      kind: "described",
      description,
      attachments,
      project: chosen,
    });
  };
  const startOnShortcut = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      startNow();
    }
  };
  const placeholder =
    chosen === null
      ? "Describe a part, or pick a project to work in"
      : ENGINEERING_COMPOSER_PLACEHOLDER;

  return (
    <section aria-label="Start" className={SECTION_STACK}>
      <div
        data-attach-drop=""
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setAttaching(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setAttaching(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setAttaching(false);
          attach(Array.from(event.dataTransfer.files).map(fromFile));
        }}
        className={cn(
          "relative flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-xs/5 focus-within:border-ring",
          attaching && "border-ring",
        )}
      >
        {attaching ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 text-sm font-medium text-foreground">
            {bridge === null ? "Drop files to attach" : "Drop files or folders to attach"}
          </div>
        ) : null}
        <Textarea
          unstyled
          rows={3}
          aria-label={placeholder}
          placeholder={placeholder}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={startOnShortcut}
        />
        <AttachedList
          attachments={attachments}
          onRemove={(index) => setAttachments((current) => current.filter((_, at) => at !== index))}
        />
        {attachments.some((attachment) => attachment.path !== null) ? (
          <p className="text-xs text-muted-foreground">
            These go in {chosen === null ? "the new project's" : `${chosen.project.name}'s`}{" "}
            References, and the agent reads them first.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              attach(Array.from(event.target.files ?? []).map(fromFile));
              event.target.value = "";
            }}
          />
          <Button variant="ghost" size="sm" onClick={choose}>
            <PaperclipIcon />
            Attach
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSketching(true)}>
            <DraftingCompassIcon />
            Sketch
          </Button>
          <SketchDialog
            open={sketching}
            onOpenChange={setSketching}
            onAttach={(files) => attach(files.map(fromFile))}
          />
          {props.cards.length === 0 ? null : (
            <ProjectPicker
              environmentId={environmentId}
              cards={props.cards}
              chosen={chosen}
              onChoose={(card) => setChosenId(card?.id ?? null)}
            />
          )}
          <div className="flex-1" />
          {missing === null ? null : (
            <>
              <span className="text-xs text-muted-foreground">{NO_AGENT}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void navigate({
                    to: "/settings/providers",
                    search: {
                      environmentId,
                      ...(missing.setup === undefined ? {} : { instanceId: missing.setup }),
                    },
                  })
                }
              >
                {OPEN_AGENTS}
              </Button>
            </>
          )}
          {/* Grey until there is something to start: the page's one solid blue. The rail's count
              is solid blue too, but only while a chat waits on the person. */}
          <Button
            variant={ready ? "default" : "secondary"}
            size="sm"
            disabled={!ready}
            onClick={startNow}
          >
            {busy ? "Starting…" : "Start"}
          </Button>
        </div>
      </div>
    </section>
  );
}
