import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type {
  EnvironmentId,
  ModelSelection,
  OrchestrationV2ProviderFailureClass,
  ProviderInstanceId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { useGT } from "gt-react";
import { PencilRulerIcon } from "lucide-react";
import {
  type ComponentProps,
  type ComponentType,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useState,
} from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { cn } from "~/lib/utils";
import { useStableCallback } from "../../hooks/useStableCallback";
import { useWorkspaceMutationRefresh } from "../../hooks/useWorkspaceMutationRefresh";
import { useComposerDraftStore } from "../../composerDraftStore";
import {
  type PluginAppSurface,
  type RightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "../../rightPanelStore";
import { PluginStarterPrompts } from "../plugins/PluginStarterPrompts";
import { PluginThreadViewMenuItems } from "../plugins/PluginThreadViewMenuItems";
import { usePluginFollow } from "../plugins/usePluginFollow";
import type { ComposerBannerStackItem } from "../chat/ComposerBannerStack";
import { RightPanelSurfaceContent } from "../chat/RightPanelSurfaceContent";
import { setChatInFront, takePendingFollow } from "./defaultModelFollow";
import { handToChat, sendViewMessage } from "./handToChat";
import { keptLayoutOrder, keptSurfaces } from "./keptSurfaces";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useViewerWorkingStore } from "./references/viewerWorking";
import { useStudioTabFileMenu } from "./studioRightPanelTabs";
import { frontTab, useShowWaitingChat } from "./overviewPanel";
import { PartContextStrip } from "./PartContextStrip";
import { ChatTitleRow } from "./ChatTitleRow";
import { PendingStart } from "./PendingStart";
import { plainFailure, TRY_AGAIN_PROMPT } from "./plainFailure";
import { ProjectPage } from "./ProjectPage";
import { useMergedPartTabs } from "./partTabs";
import { useProjectTabs } from "./projectTabs";
import { useProjectViewStore } from "./projectView";
import { StudioPanelBar } from "./StudioPanelBar";
import { StudioToolbox } from "./StudioToolbox";
import { ToolboxButton } from "./ToolboxButton";
import {
  hasEngineeringSurfaces,
  isEngineeringInterface,
  useEngineeringInterface,
  useEngineeringSurfaces,
} from "./studioInterface";
import { useToolboxOpen } from "./toolboxOpen";
import { useDocumentFollow } from "./useDocumentFollow";
import { useShowProjectPart } from "./useShowProjectPart";
import { useStudioProjectsList } from "./useStudioProjects";
import { useWorkbenchViewer } from "./useWorkbenchViewer";
import { addViewContextToComposer, handEditNoteShown } from "./viewContext";
import { WORKBENCH_LAYOUT } from "./workbenchLayout";

export { t3FeatureHidden, withoutT3ThreadLink } from "./hiddenT3Features";

const PluginViewPanel = lazy(() => import("../plugins/PluginViewPanel"));

// Studio's side of T3's chat view (`ChatView.tsx`): what follows the agent's work into the panel,
// the Toolbox's title-bar button, the hand-edit notes, the panel's Studio surfaces and slots, and
// what the engineering interface leaves out. T3's file calls these in one line where each goes.

/** Studio has no maximize: its title-bar button opens and shuts the Toolbox, the one there. */
export const canMaximizeRightPanel = (rightPanelOpen: boolean) =>
  rightPanelOpen && !hasEngineeringSurfaces();

/** Studio's engineering interface puts the branch and checkout strip away with the coding tools. */
export const showsComposerContextStrip = () => !isEngineeringInterface();

/** An agent may rename or rewrite its project's file: the sidebar and Home read this list. */
export function useStudioProjectsRefresh(
  environmentId: EnvironmentId,
  workspaceMutationId: string | null,
) {
  const studioProjectsList = useStudioProjectsList(environmentId);
  useWorkspaceMutationRefresh({
    mutationId: workspaceMutationId,
    refresh: studioProjectsList.refresh,
    resourceKey: `studio-projects:${environmentId}`,
  });
}

/**
 * The engineering composer has no model picker: a model chosen in Settings, AI agents reaches the
 * chat that was in front then, once, the next time it is shown (`defaultModelFollow.ts`).
 */
export function useDefaultModelFollow(input: {
  readonly embedded: boolean;
  readonly activeThread: unknown;
  readonly activeThreadKey: string | null;
  readonly providerStatuses: ReadonlyArray<unknown>;
  readonly onProviderModelSelect: (
    instanceId: ProviderInstanceId,
    model: string,
    options?: {
      focusComposer?: boolean;
      modelOptions?: ModelSelection["options"];
      announceBlockedProvider?: boolean;
    },
  ) => void;
}) {
  const { embedded, activeThread, activeThreadKey, providerStatuses } = input;
  const onProviderModelSelectStable = input.onProviderModelSelect;
  const engineeringInterface = useEngineeringInterface();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records the chat in front in the module store Settings reads when a model is chosen
  useEffect(() => {
    if (!embedded) setChatInFront(activeThreadKey);
  }, [activeThreadKey, embedded]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- applies a model chosen in Settings once the chat it was chosen for is shown and its providers have loaded
  useEffect(() => {
    if (embedded || !activeThread || providerStatuses.length === 0) return;
    const next = takePendingFollow(engineeringInterface, activeThreadKey);
    if (next === null) return;
    onProviderModelSelectStable(next.instanceId, next.model, {
      focusComposer: false,
      modelOptions: next.options ?? [],
      announceBlockedProvider: true,
    });
  }, [
    activeThread,
    activeThreadKey,
    embedded,
    engineeringInterface,
    onProviderModelSelectStable,
    providerStatuses,
  ]);
}

type StudioThread = NonNullable<ComponentProps<typeof PendingStart>["thread"]>;
type StudioProject = EnvironmentProject;

export function useStudioChatView(input: {
  readonly embedded: boolean;
  readonly environmentId: EnvironmentId;
  readonly activeThreadRef: ScopedThreadRef | null;
  readonly activeThreadKey: string | null;
  readonly routeThreadKey: string;
  readonly isServerThread: boolean;
  readonly activeThread: StudioThread | null | undefined;
  readonly activeProject: StudioProject | null;
  readonly activeProjectIsScratch: boolean;
  readonly activeProjectEnvironmentId: EnvironmentId | null;
  readonly activeWorkspaceRoot: string | null | undefined;
  readonly gitCwd: string | null;
  readonly composerRef: ComposerHandleRef;
  readonly composerDraftTarget: Parameters<
    ReturnType<typeof useComposerDraftStore.getState>["getComposerDraft"]
  >[0];
  readonly rightPanelOpen: boolean;
  readonly activateRightPanelSurface: (surface: RightPanelSurface) => void;
  readonly isWorking: boolean;
  readonly pendingUserInputCount: number;
  readonly pendingRequestId: string | null;
  readonly runningRunId: string | null;
  readonly items: Parameters<typeof usePluginFollow>[0]["items"];
  readonly checkpoints: Parameters<typeof useDocumentFollow>[0]["checkpoints"];
  readonly shouldUsePlanSidebarSheet: boolean;
  readonly workspaceMutationId: string | null;
  readonly sendAppMessage: (text: string) => Promise<void>;
}) {
  const gt = useGT();
  const engineeringInterface = useEngineeringInterface();
  const engineeringSurfaces = useEngineeringSurfaces();
  const {
    embedded,
    environmentId,
    activeThreadRef,
    activeThreadKey,
    routeThreadKey,
    isServerThread,
    activeThread,
    activeProject,
    activeWorkspaceRoot,
    gitCwd,
    composerRef,
    rightPanelOpen,
  } = input;
  const [handEditNotes, setHandEditNotes] = useState<{
    readonly threadKey: string | null;
    readonly notes: ReadonlyArray<string>;
  }>({ threadKey: null, notes: [] });

  // Studio's tabs keep the panel's size; leaving a spread Overview steps back (`frontTab`).
  const activateSurfaceStable = useStableCallback((surface: RightPanelSurface) => {
    if (engineeringInterface && activeThreadRef) frontTab(activeThreadRef, surface);
    input.activateRightPanelSurface(surface);
  });
  // Studio's right toggle is the Toolbox's, the one way in: it opens the Toolbox's popup, with the
  // panel when that is shut, and shuts it again. The keybinding still shows or hides the panel.
  const toolboxOpen = useToolboxOpen((state) => state.open);
  const toggleToolboxStable = useStableCallback(() => {
    if (!activeThreadRef) return;
    if (!rightPanelOpen) {
      useToolboxOpen.getState().setOpen(true);
      useRightPanelStore.getState().toggleVisibility(activeThreadRef);
      return;
    }
    useToolboxOpen.getState().setOpen(!toolboxOpen);
  });
  const chatBusy = input.isWorking || input.pendingUserInputCount > 0;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tells the module store the CAD views beside this chat read (`studio/working`) whether its turn is running
  useEffect(() => {
    if (embedded || activeThreadKey === null) return;
    useViewerWorkingStore.getState().set(activeThreadKey, input.isWorking);
    return () => useViewerWorkingStore.getState().set(activeThreadKey, false);
  }, [activeThreadKey, embedded, input.isWorking]);
  const onTryAgainStable = useStableCallback(() => handToChat(composerRef, TRY_AGAIN_PROMPT));
  // A file tab's menu: what the viewer's own row offered, now that the tab names the file.
  const tabFileMenu = useStudioTabFileMenu(environmentId, activeWorkspaceRoot ?? null);
  /** Studio: a view's message in a chat not started yet starts it through the composer (`sendViewMessage`). */
  const sendAppMessageThroughComposerStable = useStableCallback(async (text: string) =>
    sendViewMessage(composerRef, text),
  );
  // Studio's engineering surfaces follow files once per run instead (`useDocumentFollow.ts`).
  useShowWaitingChat(
    engineeringInterface && !embedded ? activeThreadRef : null,
    input.pendingRequestId,
  );
  // One part is one tab: a STEP's tab and its built document's merge (`partTabs.ts`).
  useMergedPartTabs(engineeringInterface && !embedded ? activeThreadRef : null);
  // Studio's tabs are the project folder's, the same beside each of its chats (`projectTabs.ts`).
  useProjectTabs(
    engineeringInterface && !embedded ? activeThreadRef : null,
    activeWorkspaceRoot ?? null,
  );
  // Engineering with code tools lets the pinned tab show the source files instead (`projectView.ts`).
  const projectView = useProjectViewStore((state) => state.view);
  usePluginFollow({
    environmentId,
    threadRef: isServerThread && !embedded ? activeThreadRef : null,
    threadKey: activeThreadKey,
    runningRunId: input.runningRunId,
    items: input.items,
    workspaceRoot: gitCwd,
    // Unlike proactive diffs, this opens a view only when none of the plugin's is open.
    followFiles: !input.shouldUsePlanSidebarSheet && !engineeringSurfaces,
  });
  useWorkbenchViewer({
    enabled: WORKBENCH_LAYOUT && !embedded,
    environmentId,
    threadRef: activeThreadRef,
    serverThread: isServerThread,
  });
  // A project opened from Home, the switcher or Cmd+K shows its part in CAD (`showProject`).
  useShowProjectPart({
    environmentId,
    threadRef: engineeringInterface && !embedded ? activeThreadRef : null,
    cwd: activeWorkspaceRoot ?? null,
  });
  useDocumentFollow({
    environmentId,
    threadRef: isServerThread && !embedded ? activeThreadRef : null,
    threadKey: activeThreadKey,
    runningRunId: input.runningRunId,
    items: input.items,
    checkpoints: input.checkpoints,
    workspaceRoot: gitCwd,
  });
  const openModelPickerStable = useStableCallback(() => composerRef.current?.openModelPicker());

  // The notes of hand edits written into the message box (`addViewContextToComposer`). A tester
  // read one as a prompt waiting to be sent, so while the box holds one the chat says what it is:
  // the AI gets it with the next message, and nothing needs doing now.
  const shownHandEditNotes = handEditNotes.threadKey === routeThreadKey ? handEditNotes.notes : [];
  const handEditNoteInBox = useComposerDraftStore((store) =>
    handEditNoteShown(
      store.getComposerDraft(input.composerDraftTarget)?.prompt ?? "",
      shownHandEditNotes,
    ),
  );
  const handEditBannerItems: ComposerBannerStackItem[] = handEditNoteInBox
    ? [
        {
          id: "studio-hand-edit-note",
          variant: "info",
          icon: <PencilRulerIcon />,
          title: gt("Your hand edits go to the AI with your next message"),
          description: gt(
            "Studio wrote what you changed into the message box, so the AI knows. There is no need to send it now; delete a line to leave it out.",
          ),
        },
      ]
    : [];

  const panel: StudioPanel = {
    engineeringInterface,
    engineeringSurfaces,
    projectView,
    thread: activeThread ?? null,
    threadRef: activeThreadRef,
    isServerThread,
    project: activeProject,
    projectIsScratch: input.activeProjectIsScratch,
    workspaceRoot: activeWorkspaceRoot ?? null,
    workspaceMutationId: input.workspaceMutationId,
    firstTurnWorking: input.isWorking && input.checkpoints.length === 0,
    thisThreadTitle: gt("This thread"),
    sendAppMessage: input.sendAppMessage,
    sendAppMessageThroughComposer: sendAppMessageThroughComposerStable,
    addContext: (content) => {
      const note = addViewContextToComposer(composerRef.current, content);
      if (note !== null) {
        setHandEditNotes((current) => ({
          threadKey: routeThreadKey,
          notes: current.threadKey === routeThreadKey ? [...current.notes, note] : [note],
        }));
      }
    },
  };

  return {
    engineeringSurfaces,
    activateSurface: activateSurfaceStable,
    openModelPicker: openModelPickerStable,
    handEditBannerItems,
    panel,
    /** Studio keeps the terminal and the diff out of the way: their keys open nothing hidden. */
    shortcutOverrides: engineeringInterface
      ? { "terminal.toggle": () => false, "diff.toggle": () => false }
      : {},
    /** The title bar's right toggle is the Toolbox's on the engineering surfaces. */
    panelToggleOverrides: engineeringSurfaces
      ? {
          rightPanelControl: (
            <ToolboxButton
              open={rightPanelOpen && toolboxOpen}
              disabled={activeProject === null}
              label={
                rightPanelOpen && toolboxOpen ? gt("Close the Toolbox") : gt("Open the Toolbox")
              }
              onToggle={toggleToolboxStable}
            />
          ),
        }
      : {},
    pendingStart:
      engineeringInterface && !embedded ? (
        <>
          <PendingStart
            project={activeProject ?? null}
            draft={!isServerThread}
            thread={activeThread ?? null}
          />
          {activeThread ? <ChatTitleRow title={activeThread.title} /> : null}
        </>
      ) : null,
    timelineProps: engineeringInterface ? { onTryAgain: onTryAgainStable } : {},
    /** Studio's chat is a dock beside the model: its empty draft stays at the foot. */
    draftOverlayDock: engineeringInterface ? "items-end" : null,
    starterPrompts: (
      <PluginStarterPrompts
        environmentId={input.activeProjectEnvironmentId}
        composerRef={composerRef}
        cwd={input.activeProjectIsScratch ? null : gitCwd}
      />
    ),
    partContextStrip: <PartContextStrip threadRef={isServerThread ? activeThreadRef : null} />,
    pluginViewMenuItems:
      isServerThread && activeThreadRef && activeThread ? (
        <PluginThreadViewMenuItems
          environmentId={activeThread.environmentId}
          threadRef={activeThreadRef}
        />
      ) : null,
    panelSlots: {
      fileMenu: tabFileMenu,
      // A narrow window's panel keeps Studio's toolbar too: New and the AI | CAD switch.
      ...(engineeringInterface && activeThreadRef
        ? {
            toolbar: (
              <StudioPanelBar
                folder={activeProject?.workspaceRoot ?? null}
                composerRef={composerRef}
                threadRef={activeThreadRef}
                mutationId={input.workspaceMutationId}
                chatBusy={chatBusy}
              />
            ),
          }
        : {}),
      // The Toolbox is the one place for a part's jobs, so it is there wherever the engineering
      // surfaces are, with the code tools out too: a popup from the title bar's button.
      ...(engineeringSurfaces && activeThreadRef
        ? {
            aside: (
              <StudioToolbox
                folder={activeProject?.workspaceRoot ?? null}
                composerRef={composerRef}
                threadRef={activeThreadRef}
                mutationId={input.workspaceMutationId}
              />
            ),
          }
        : {}),
    },
  };
}

/** What the run's error says in the engineering interface: what failed, in plain words. */
export function threadError(
  error: string | null,
  serverFailureClass: OrchestrationV2ProviderFailureClass | null | undefined,
): string | null {
  return isEngineeringInterface() && error !== null && serverFailureClass
    ? plainFailure(serverFailureClass).label
    : error;
}

interface StudioPanel {
  readonly engineeringInterface: boolean;
  readonly engineeringSurfaces: boolean;
  readonly projectView: string;
  readonly thread: StudioThread | null;
  readonly threadRef: ScopedThreadRef | null;
  readonly isServerThread: boolean;
  readonly project: StudioProject | null;
  readonly projectIsScratch: boolean;
  readonly workspaceRoot: string | null;
  readonly workspaceMutationId: string | null;
  readonly firstTurnWorking: boolean;
  readonly thisThreadTitle: string;
  readonly sendAppMessage: (text: string) => Promise<void>;
  readonly sendAppMessageThroughComposer: (text: string) => Promise<void>;
  readonly addContext: (content: ReadonlyArray<unknown>) => void;
}

/**
 * The panel's surface: a plugin view (the model or board viewer), the engineering surfaces'
 * Project tab (the project page, not the file explorer), or T3's.
 */
export function StudioRightPanelSurfaceContent({
  studio,
  ...props
}: ComponentProps<typeof RightPanelSurfaceContent> & { readonly studio: StudioPanel }) {
  const { surface } = props;
  const { thread, project } = studio;
  const threadKey = studio.threadRef === null ? null : scopedThreadKey(studio.threadRef);
  const open = useRightPanelStore(
    (state) => selectThreadRightPanelState(state.byThreadKey, studio.threadRef).surfaces,
  );
  // The views and the Overview shown in this chat stay mounted behind the tab in front, so a
  // switch back shows them as they were, with no reload (`keptSurfaces`, at most three views).
  const [kept, setKept] = useState<{
    readonly threadKey: string | null;
    readonly views: ReadonlyArray<PluginAppSurface>;
    readonly overview: boolean;
  }>({ threadKey, views: [], overview: false });
  const base = kept.threadKey === threadKey ? kept : { threadKey, views: [], overview: false };
  const views = keptSurfaces(base.views, surface?.kind === "plugin-app" ? surface : null, open);
  const overviewHere =
    studio.engineeringSurfaces &&
    (studio.engineeringInterface || studio.projectView === "project") &&
    thread !== null &&
    project !== null &&
    studio.workspaceRoot !== null &&
    studio.threadRef !== null;
  const overview =
    overviewHere &&
    open.some((entry) => entry.kind === "files") &&
    (base.overview || surface?.kind === "files");
  if (base !== kept || views !== base.views || overview !== base.overview) {
    setKept({ threadKey, views, overview });
  }
  const inFront = (id: string) => surface?.id === id;
  const viewPanels =
    thread === null
      ? null
      : // Laid out by id, not recency: a frame moved in the document reloads (`keptLayoutOrder`).
        keptLayoutOrder(views).map((view) => (
          <KeptSurface key={view.id} shown={inFront(view.id)}>
            <Suspense fallback={null}>
              <PluginViewPanel
                environmentId={thread.environmentId}
                threadId={thread.id}
                surface={view}
                front={inFront(view.id)}
                draftWorkspaceRoot={studio.isServerThread ? undefined : project?.workspaceRoot}
                onSendMessage={
                  studio.isServerThread
                    ? studio.sendAppMessage
                    : studio.engineeringSurfaces
                      ? studio.sendAppMessageThroughComposer
                      : undefined
                }
                onAddContext={studio.addContext}
                workspaceRoot={studio.workspaceRoot ?? undefined}
                workspaceMutationId={studio.workspaceMutationId}
              />
            </Suspense>
          </KeptSurface>
        ));
  const overviewPanel =
    overview && thread !== null && project && studio.workspaceRoot && studio.threadRef ? (
      <KeptSurface key="overview" shown={surface?.kind === "files"}>
        <ProjectPage
          environmentId={thread.environmentId}
          cwd={studio.workspaceRoot}
          projectName={
            studio.projectIsScratch ? thread.title || studio.thisThreadTitle : project.title
          }
          projectId={studio.projectIsScratch ? null : project.id}
          threadRef={studio.threadRef}
          workspaceMutationId={studio.workspaceMutationId}
          firstTurnWorking={studio.firstTurnWorking}
        />
      </KeptSurface>
    ) : null;
  const ours =
    (surface?.kind === "plugin-app" && thread !== null) ||
    (surface?.kind === "files" && overviewHere);
  if (overviewPanel === null && (viewPanels === null || viewPanels.length === 0)) {
    return <RightPanelSurfaceContent {...props} />;
  }
  return (
    // The kept surfaces stand on one another at the panel's full size, so the one behind keeps its
    // size and its model's framing: a switch only shows another, with nothing to lay out. Another
    // kind of tab in front stands over them the same way.
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-studio-kept-surfaces="">
      {overviewPanel}
      {viewPanels}
      {ours ? null : (
        <div className="absolute inset-0 flex min-h-0 min-w-0 flex-col">
          <RightPanelSurfaceContent {...props} />
        </div>
      )}
    </div>
  );
}

/**
 * A kept surface: in front it fills the panel at once; behind, it keeps the panel's full size,
 * unseen and inert (`visibility: hidden`, never `display: none` or no width), so its frame keeps its
 * canvas and framing and a switch to it is only a change of which one shows.
 */
function KeptSurface(props: { readonly shown: boolean; readonly children: ReactNode }) {
  return (
    <div
      inert={!props.shown}
      aria-hidden={props.shown ? undefined : true}
      data-studio-surface=""
      data-shown={props.shown ? "" : undefined}
      className={cn(
        "absolute inset-0 flex min-h-0 min-w-0 flex-col",
        props.shown ? "visible" : "pointer-events-none invisible",
      )}
    >
      {props.children}
    </div>
  );
}

/** T3's control or panel, left out where Studio's engineering interface (or surfaces) has none. */
export function UnlessEngineering<Props extends object>({
  component: Component,
  surfaces = false,
  ...props
}: Props & { readonly component: ComponentType<Props>; readonly surfaces?: boolean }): ReactNode {
  const engineeringInterface = useEngineeringInterface();
  const engineeringSurfaces = useEngineeringSurfaces();
  if (surfaces ? engineeringSurfaces : engineeringInterface) return null;
  // `props` is everything but this wrapper's own two, which Props never has.
  return <Component {...(props as unknown as Props)} />;
}
