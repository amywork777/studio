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
import { useStableCallback } from "../../hooks/useStableCallback";
import { useWorkspaceMutationRefresh } from "../../hooks/useWorkspaceMutationRefresh";
import { useComposerDraftStore } from "../../composerDraftStore";
import { type RightPanelSurface, useRightPanelStore } from "../../rightPanelStore";
import { PluginStarterPrompts } from "../plugins/PluginStarterPrompts";
import { PluginThreadViewMenuItems } from "../plugins/PluginThreadViewMenuItems";
import { usePluginFollow } from "../plugins/usePluginFollow";
import type { ComposerBannerStackItem } from "../chat/ComposerBannerStack";
import { RightPanelSurfaceContent } from "../chat/RightPanelSurfaceContent";
import { setChatInFront, takePendingFollow } from "./defaultModelFollow";
import { handToChat, sendViewMessage } from "./handToChat";
import { frontTab, useShowWaitingChat } from "./overviewPanel";
import { PartContextStrip } from "./PartContextStrip";
import { ChatTitleRow } from "./ChatTitleRow";
import { PendingStart } from "./PendingStart";
import { plainFailure, TRY_AGAIN_PROMPT } from "./plainFailure";
import { ProjectPage } from "./ProjectPage";
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
  const onTryAgainStable = useStableCallback(() => handToChat(composerRef, TRY_AGAIN_PROMPT));
  /** Studio: a view's message in a chat not started yet starts it through the composer (`sendViewMessage`). */
  const sendAppMessageThroughComposerStable = useStableCallback(async (text: string) =>
    sendViewMessage(composerRef, text),
  );
  // Studio's engineering surfaces follow files once per run instead (`useDocumentFollow.ts`).
  useShowWaitingChat(
    engineeringInterface && !embedded ? activeThreadRef : null,
    input.pendingRequestId,
  );
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
  if (surface?.kind === "plugin-app" && thread !== null) {
    return (
      <Suspense fallback={null}>
        <PluginViewPanel
          environmentId={thread.environmentId}
          threadId={thread.id}
          surface={surface}
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
    );
  }
  if (
    surface?.kind === "files" &&
    studio.engineeringSurfaces &&
    (studio.engineeringInterface || studio.projectView === "project") &&
    thread !== null &&
    project &&
    studio.workspaceRoot &&
    studio.threadRef
  ) {
    return (
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
    );
  }
  return <RightPanelSurfaceContent {...props} />;
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
