import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS, studioFolderName } from "@t3tools/shared/studioProjects";
import { FolderIcon, FolderOpenIcon } from "lucide-react";
import { useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { isElectron } from "~/env";
import { useNowMinute } from "~/hooks/useNowMinute";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { GitInstallSteps } from "./GitInstallSteps";
import { ImportDialogHost } from "./ImportDialog";
import { ImportDropZone } from "./ImportDropZone";
import { ImportMenu } from "./ImportMenu";
import { NewFilesNotice } from "./NewFilesNotice";
import { PageTitle } from "./PageTitle";
import { waitingFirst } from "./ProjectChoices";
import { findProjects } from "./recentProjects";
import { TileGroup } from "./StartChoices";
import { splitStarred, useStarredStore } from "./starredProjects";
import { useEngineeringInterface } from "./studioInterface";
import { MODULE_HEADING, SECTION_STACK } from "./studioLayout";
import { StudioNew } from "./StudioNew";
import { StudioTopBar } from "./StudioTopBar";
import { useCreateStudioProject } from "./useCreateStudioProject";
import { useImportActions } from "./useImportActions";
import { useNewPart } from "./useNewPart";
import { useOneAtATime } from "./useOneAtATime";
import { useOpenProject } from "./useOpenProject";
import { useProjectList } from "./useProjectList";
import { useProjectTiles } from "./useProjectTiles";
import { useStartOnce } from "./useStartProject";

/** What a folder made a project is until its brief says more: a part project. */
const PART_KIND = STUDIO_PROJECT_KINDS.find((kind) => kind.id === "part")!;

/** Each folder's Make a project under way: a second press while it is made does nothing more. */
const madeProjectsUnderWay = new Map<string, Promise<void>>();

const threadCount = (count: number) => (count === 1 ? "1 thread" : `${count} threads`);

function LooseFolderRow(props: {
  readonly folder: EnvironmentProject;
  readonly threads: number;
  readonly onOpen: () => void;
  readonly onMakeProject: () => void;
  /** Its project is being made: Make a project takes no press. */
  readonly making: boolean;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 border-b border-border pe-3">
      <button
        type="button"
        onClick={props.onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-sm font-medium text-foreground">{props.folder.title}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {props.folder.workspaceRoot}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {threadCount(props.threads)}
        </span>
      </button>
      <Button variant="ghost-muted" size="sm" disabled={props.making} onClick={props.onMakeProject}>
        Make a project
      </Button>
    </li>
  );
}

/**
 * Every project, where Home keeps only the starred and the last few: starred first, then within
 * each group the ones waiting on the person, then the last worked on. Folders in no project are
 * listed below, to open or make a project of in one press.
 */
export function ProjectsHome() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <ProjectsHomeFor environmentId={environmentId} />;
}

function ProjectsHomeFor(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const { list, cards, loose } = useProjectList(environmentId);
  const openProject = useOpenProject();
  const [query, setQuery] = useState("");
  // Engineering has Studio's top bar and plain words; engineering with code keeps the old header.
  const engineering = useEngineeringInterface();
  // Import replaces Add a folder where the desktop app can read this computer's files.
  const availableImport = useImportActions();
  const importActions = engineering ? availableImport : null;
  useNowMinute();
  const { start } = useStartOnce(environmentId);
  const newPart = useNewPart(environmentId);
  const create = useCreateStudioProject(environmentId);
  // A folder in no project made one as it is: named after it, a part project, its brief to fill.
  const making = useOneAtATime(madeProjectsUnderWay);
  const madeKey = (folder: EnvironmentProject) => `${environmentId}\n${folder.workspaceRoot}`;
  const makeProject = (folder: EnvironmentProject) =>
    void making.run(madeKey(folder), async () => {
      await create({
        environmentId,
        name: studioFolderName(folder.workspaceRoot),
        kind: PART_KIND,
        units: "mm",
        material: "",
        purpose: "",
        folders: [folder.workspaceRoot],
      });
    });
  const { tile, dialogs } = useProjectTiles(environmentId, cards);
  const split = splitStarred(
    findProjects(cards, query),
    useStarredStore((store) => store.starred),
  );
  const starred = waitingFirst(split.starred);
  const rest = waitingFirst(split.rest);
  const shown = [...starred, ...rest];

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        {engineering ? (
          <StudioTopBar>
            <div className="w-full max-w-72">
              <Input
                type="search"
                size="sm"
                placeholder="Find a project"
                aria-label="Find a project"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </StudioTopBar>
        ) : (
          <WorkspacePageHeader electron={isElectron} className="border-b border-border">
            <span className="text-sm font-medium text-foreground">Projects</span>
          </WorkspacePageHeader>
        )}
        <ImportDropZone>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
            <WorkspacePageContainer>
              <PageTitle
                title="Projects"
                count={cards.length}
                lede={
                  engineering || !list ? undefined : (
                    <>
                      Each project is a folder in{" "}
                      <span className="text-foreground select-all">{list.folder}</span>
                      {list.git
                        ? ", which keeps every change as a version you can go back to."
                        : // oxlint-disable-next-line t3code/studio-engineering-words -- Names the program the person must install.
                          ". Install git to give each one its own history. "}
                      {list.git ? null : <GitInstallSteps environmentId={environmentId} />}
                    </>
                  )
                }
                action={
                  <>
                    {importActions !== null ? (
                      <ImportMenu actions={importActions} />
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCommandPalette({ open: "add-project" })}
                      >
                        <FolderOpenIcon />
                        Add a folder
                      </Button>
                    )}
                    <StudioNew
                      environmentId={environmentId}
                      cwd=""
                      newProject
                      onCreate={(job) => void start({ kind: "new", job })}
                      onNewPart={newPart.create}
                    />
                  </>
                }
              />
              {engineering ? <NewFilesNotice environmentId={environmentId} /> : null}
              {shown.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {cards.length === 0
                    ? engineering
                      ? "No projects yet. Start one with New, or Import what you have."
                      : "No projects yet. Start one with New, or make one of a folder below."
                    : "No project matches that."}
                </p>
              ) : (
                <div className={SECTION_STACK}>
                  {starred.length === 0 ? null : (
                    <TileGroup label="Starred">{starred.map(tile)}</TileGroup>
                  )}
                  {rest.length === 0 ? null : (
                    <TileGroup label={starred.length === 0 ? null : "Recent"}>
                      {rest.map(tile)}
                    </TileGroup>
                  )}
                </div>
              )}
              {importActions === null ? null : (
                <p className="text-center text-xs text-muted-foreground">
                  Drop files or a folder anywhere here to import them.
                </p>
              )}
              {loose.length === 0 ? null : (
                <section aria-label="Folders in no project" className={SECTION_STACK}>
                  <h2 className={MODULE_HEADING}>Folders in no project</h2>
                  <ul className="flex flex-col border-t border-border">
                    {loose.map(({ folder, threads: own }) => (
                      <LooseFolderRow
                        key={folder.id}
                        folder={folder}
                        threads={own.length}
                        onOpen={() => void openProject(folder, own)}
                        onMakeProject={() => makeProject(folder)}
                        making={making.busy.has(madeKey(folder))}
                      />
                    ))}
                  </ul>
                </section>
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
