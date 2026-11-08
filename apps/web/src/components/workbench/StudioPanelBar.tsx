import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { ImportDialogHost } from "./ImportDialog";
import { ImportMenu } from "./ImportMenu";
import { useImportIntoProject } from "./importIntoProject";
import { useImportActions } from "./useImportActions";
import { ModeSwitch } from "./ModeSwitch";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { usePanelTabShortcuts } from "./panelTabShortcuts";
import { handToChat } from "./handToChat";
import { surfaceFile } from "./sameFile";
import { modeOf, setSimpleView, simpleOf, simpleViewToggle, useSimpleView } from "./simpleView";
import { StudioNew } from "./StudioNew";
import { StudioTour } from "./StudioTour";
import { studyMeshKind } from "./partContext";
import { partName } from "./partNames";
import { useLeadPart } from "./useLeadPart";
import { useAddPart } from "./useNewPart";
import { usePartContext } from "./usePartContext";
import { useStudioProjectAt } from "./useStudioProjects";
import { frontViewBusy, pluginViewKey, useViewerEditState } from "./viewerEditState";

/**
 * The part in front of the workspace panel, as the CAD viewer shows it (it may have moved on from
 * the file it opened), else as the view the agent opened names it; null over the Overview, a
 * document, or anything that is not a CAD view. With it, how the project's parts are made, from
 * its setup, which Manufacture leads with. Jobs fall back from it to other parts (`usePartForJobs`).
 */
export function usePartInFront(
  threadRef: ScopedThreadRef,
  folder: string | null,
): {
  readonly part: { readonly path: string; readonly kind: string; readonly name?: string } | null;
  readonly process: string | undefined;
  /** What the viewer in front says of its part (`usePartContext`), when it has said. */
  readonly shown: ReturnType<typeof usePartContext>;
} {
  const frontKind = useRightPanelStore(
    (store) => selectActiveRightPanelSurface(store.byThreadKey, threadRef)?.kind ?? null,
  );
  // A view the agent opened names its file only in its id (`surfaceFile`).
  const frontFile = useRightPanelStore((store) => {
    const surface = selectActiveRightPanelSurface(store.byThreadKey, threadRef);
    return surface?.kind === "plugin-app" ? surfaceFile(surface) : null;
  });
  const shown = usePartContext(threadRef, folder);
  const process = useStudioProjectAt(threadRef.environmentId, folder)?.project.brief.process;
  const shownPath = shown?.part.path ?? null;
  const shownKind = shown?.part.kind ?? null;
  const shownName = shown?.part.name ?? null;
  const part = useMemo(
    () =>
      frontKind !== "plugin-app"
        ? null
        : shownPath !== null && shownKind !== null
          ? { path: shownPath, kind: shownKind, ...(shownName === null ? {} : { name: shownName }) }
          : frontFile === null
            ? null
            : {
                path: frontFile,
                kind: studyMeshKind(frontFile, folder) ?? partName(frontFile)?.kind ?? "Part",
              },
    [folder, frontFile, frontKind, shownKind, shownName, shownPath],
  );
  return { part, process, shown };
}

/**
 * The part a job is for, the Toolbox's and ⌘K's: the part in front (`usePartInFront`), else the
 * part last on screen, else the project's lead part, so over a report, a drawing or the Overview
 * the project's jobs are still there.
 */
export function usePartForJobs(
  threadRef: ScopedThreadRef,
  folder: string | null,
  mutationId: string | null,
): {
  readonly part: { readonly path: string; readonly kind: string; readonly name?: string } | null;
  readonly process: string | undefined;
} {
  const { part: front, process, shown } = usePartInFront(threadRef, folder);
  const lead = useLeadPart(threadRef.environmentId, folder, mutationId);
  const part =
    front ??
    (shown !== null
      ? shown.part
      : lead === null
        ? null
        : { path: lead.file.path, kind: lead.file.kind, name: lead.file.title });
  return { part, process };
}

/**
 * The workspace panel's toolbar, at the right end of its tab row (`RightPanelTabs`' `toolbar`), what
 * can be done: the AI | CAD switch where the viewer in front has two layouts (`ModeSwitch` over
 * `simpleView.ts`, the person's choice, which every CAD view takes from its host context), the one way between
 * them; and Import (`ImportMenu`, Studio's one Import) and New, always
 * there, last (`StudioNew`), where Home has them. A part's jobs are in the
 * Toolbox (`StudioToolbox`). ⌘K's and the Toolbox's jobs are for the same part (`usePartForJobs`).
 */
export function StudioPanelBar(props: {
  readonly folder: string | null;
  readonly composerRef: ComposerHandleRef | null;
  readonly threadRef: ScopedThreadRef;
  /** The thread's workspace changes: a part the agent just made can be opened. */
  readonly mutationId: string | null;
  /** The agent is working, or a question waits: the tour holds off (`StudioTour`). */
  readonly chatBusy: boolean;
}) {
  const { folder, threadRef } = props;
  usePanelTabShortcuts(threadRef);
  // The AI | CAD switch, by what the CAD view in front says of its part (`viewerEditState.ts`): shown
  // where it has two layouts, held while a command or sketch is open in it.
  const frontView = useRightPanelStore((store) => {
    const surface = selectActiveRightPanelSurface(store.byThreadKey, threadRef);
    return surface?.kind === "plugin-app" ? pluginViewKey(threadRef, surface.id) : null;
  });
  const simpleView = useSimpleView();
  const toggle = useViewerEditState((store) =>
    simpleViewToggle(frontView === null ? undefined : store.byView[frontView]),
  );
  // ⌘K's part, the Toolbox's too.
  const { part: subject, process } = usePartForJobs(threadRef, folder, props.mutationId);
  const studio = useStudioProjectAt(threadRef.environmentId, folder);
  const addPart = useAddPart(threadRef, folder);
  // Import beside New, as on Home: files brought into this project's folder.
  const importer = useImportIntoProject(folder, studio?.project.name ?? "the project");
  // The same Import menu as Home's: here Files or a folder copies into this project, and Scan this
  // computer opens the scan, which makes new projects.
  const scanner = useImportActions();
  const importMenu =
    importer === null || scanner === null ? null : (
      <>
        <ImportMenu
          actions={{ scan: scanner.scan, pick: importer.pick }}
          hints={{
            pick: `Copied into ${studio?.project.name ?? "the project"}`,
            scan: "Makes new projects",
          }}
        />
        <ImportDialogHost environmentId={threadRef.environmentId} />
      </>
    );

  // ⌘K finds jobs for the same part, from over everything (`StudioQuickFind`).
  const setWorkspace = useOpenWorkspaceStore((store) => store.setWorkspace);
  const subjectPath = subject?.path ?? null;
  const subjectKind = subject?.kind ?? null;
  const subjectName = subject?.name ?? null;
  useEffect(() => {
    if (folder === null) return;
    setWorkspace({
      threadRef,
      folder,
      part:
        subjectPath === null || subjectKind === null
          ? null
          : {
              path: subjectPath,
              kind: subjectKind,
              ...(subjectName === null ? {} : { name: subjectName }),
            },
      process,
    });
    return () => setWorkspace(null);
  }, [folder, process, setWorkspace, subjectKind, subjectName, subjectPath, threadRef]);

  return (
    <div className="flex items-center gap-2" data-studio-toolbar="">
      <StudioTour chatBusy={props.chatBusy} />
      {/* The AI | CAD switch, Import and New close the row; Home's Your projects ends in Import and New too. */}
      {toggle === "hidden" ? null : (
        <>
          <ModeSwitch
            mode={modeOf(simpleView)}
            held={toggle === "held"}
            onChange={(mode) => {
              // As the store has it at the press: a command opened since holds the layout.
              if (frontViewBusy(useViewerEditState.getState().byView, frontView)) return;
              setSimpleView(simpleOf(mode));
            }}
          />
        </>
      )}
      {importMenu}
      {props.composerRef === null || folder === null || addPart === null ? null : (
        <StudioNew
          buttonVariant="outline"
          environmentId={threadRef.environmentId}
          cwd={folder}
          onCreate={(job) => {
            if (props.composerRef !== null) handToChat(props.composerRef, job.prompt);
            // The job goes to this chat: the Overview steps back beside it, so the work shows.
            useRightPanelStore.getState().setMaximized(threadRef, false);
          }}
          onNewPart={addPart}
        />
      )}
    </div>
  );
}
