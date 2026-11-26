import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpIcon, DraftingCompassIcon, PaperclipIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { serverEnvironment } from "~/state/server";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { NO_AGENT, OPEN_AGENTS } from "./agentWords";
import type { ListedProject } from "./projectList";
import { ENGINEERING_COMPOSER_PLACEHOLDER } from "./studioInterface";
import { splitStarred, useStarredStore } from "./starredProjects";
import { FindButton, openFind } from "./FindButton";
import { ImportDialogHost } from "./ImportDialog";
import { homeLayout } from "./homeStart";
import { ImportDropZone } from "./ImportDropZone";
import { ImportMenu } from "./ImportMenu";
import { NewFilesNotice } from "./NewFilesNotice";
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

/**
 * Studio's Home leads with the Start box, large, under Describe your part: words or a dropped
 * sketch or PDF make a project and start its first turn. Under it, with no projects
 * (`homeLayout`), New part, Import a STEP and the examples; with projects, the project tiles, last
 * worked on first, a project with a waiting chat ahead and opening on that chat.
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
              <NewFilesNotice environmentId={environmentId} />
              <StartProject
                environmentId={environmentId}
                cards={cards}
                busy={busy}
                start={start}
                firstTime={layout === "start"}
              />
              {!loaded ? null : layout === "start" ? (
                <>
                  <section aria-label="Or start from" className={SECTION_STACK}>
                    <h2 className={MODULE_HEADING}>Or start from</h2>
                    <StartChoices
                      onNewPart={() => void newPart.create()}
                      newPartBusy={newPart.busy}
                      importActions={importActions}
                    />
                  </section>
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

/** What the first-time Home offers to put in the box: plain parts, each a tap that fills it in. */
const SUGGESTIONS = [
  "A wall hook for a road bike, printed in PETG",
  "A NEMA 17 motor mount for 2020 extrusion",
  "A phone stand that holds a phone at 60°",
] as const;

/**
 * Home's Start box: Start (or Enter) goes to a new project, or a new chat in the project chosen
 * beside Attach. A drop starts at once with any words typed; Attach and Sketch wait for Start.
 * Files go into References and the agent reads them first (`startMessage`).
 */
function StartProject(props: {
  readonly environmentId: EnvironmentId;
  readonly cards: ReadonlyArray<ListedProject>;
  /** A start is under way (from here or from New). */
  readonly busy: boolean;
  readonly start: (work: ProjectStart) => Promise<void>;
  /** No projects yet: the box offers parts to try. */
  readonly firstTime: boolean;
}) {
  const { environmentId, busy } = props;
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = props.cards.find((card) => card.id === chosenId) ?? null;
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<StartAttachment[]>([]);
  // A file dropped on the box starts, as Vizcom's does (Home elsewhere imports).
  const [attaching, setAttaching] = useState(false);
  const [sketching, setSketching] = useState(false);
  const text = useRef<HTMLTextAreaElement>(null);
  // The desktop app: files and folders, by their paths, copied into the project on Start.
  const bridge = readStudioImport();
  const withAdded = (
    current: ReadonlyArray<StartAttachment>,
    added: ReadonlyArray<StartAttachment>,
  ) => [
    ...current,
    ...added.filter(
      (item) => item.path === null || !current.some((held) => held.path === item.path),
    ),
  ];
  const attach = (added: ReadonlyArray<StartAttachment>) =>
    setAttachments((current) => withAdded(current, added));
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
  const startWith = (files: ReadonlyArray<StartAttachment>) => {
    if (missing !== null || !canStart(description, files, busy)) return false;
    void run({ kind: "described", description, attachments: files, project: chosen });
    return true;
  };
  const startNow = () => void startWith(attachments);
  // Enter starts, as the chat's box sends; Shift+Enter is a new line.
  const startOnEnter = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    startNow();
  };
  const placeholder =
    chosen === null
      ? "A bracket that holds a 40 mm fan to a 3 mm aluminium panel…"
      : ENGINEERING_COMPOSER_PLACEHOLDER;

  return (
    <section aria-label="Start" className="flex min-w-0 flex-col gap-4 pt-6 sm:pt-10">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Describe your part</h1>
        <p className="text-sm text-muted-foreground">
          {chosen === null
            ? "Or drop a sketch, drawing or PDF. Studio makes the project and the AI agent builds a first draft."
            : `A new chat in ${chosen.project.name}. Drop a sketch, drawing or PDF to start with it.`}
        </p>
      </div>
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
          const files = withAdded(attachments, Array.from(event.dataTransfer.files).map(fromFile));
          // With no agent the files wait in the box, beside what says so.
          if (!startWith(files)) setAttachments(files);
          else setAttachments([]);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) text.current?.focus();
        }}
        className={cn(
          "relative flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-base shadow-xs/5 focus-within:border-ring",
          attaching && "border-ring",
        )}
      >
        {attaching ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/85 text-base font-medium text-foreground">
            {chosen === null
              ? "Drop to start a project"
              : `Drop to start a chat in ${chosen.project.name}`}
          </div>
        ) : null}
        <Textarea
          ref={text}
          unstyled
          size="lg"
          rows={4}
          autoFocus
          aria-label="Describe your part"
          placeholder={placeholder}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={startOnEnter}
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
            {busy ? null : <ArrowUpIcon />}
          </Button>
        </div>
      </div>
      {props.firstTime && description === "" && attachments.length === 0 ? (
        <ul aria-label="Try" className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDescription(suggestion);
                  text.current?.focus();
                }}
              >
                {suggestion}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
