import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { toastManager } from "../ui/toast";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { buildThreadRouteParams } from "~/threadRoutes";
import { readOpened, rememberOpened, threadToOpen } from "./openedThreads";
import { showChat, showProject } from "./overviewPanel";
import { waitingChat } from "./recentActivity";
import { foldSidebarForPart } from "./sidebarFold";

/** Remembers the thread on screen as the one last open in its project. */
export function useRememberOpened(threadRef: ScopedThreadRef | null): void {
  const threadKey = threadRef === null ? null : scopedThreadKey(threadRef);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records the thread on screen in this device's opened-threads store whenever it changes
  useEffect(() => {
    if (threadKey !== null) rememberOpened(threadKey, new Date().toISOString());
  }, [threadKey]);
}

/** What Studio says when a project's folder is not where the project says (moved, renamed, deleted). */
export function missingFolderNotice(
  project: {
    readonly name: string;
    readonly folders: ReadonlyArray<string>;
  } | null,
): { readonly title: string; readonly description: string } {
  const name = project?.name.trim() || "this project";
  const where = project?.folders[0];
  return {
    title: `Studio can't find ${name}'s folder`,
    description: where
      ? `It should be at ${where}. Move the folder back there, then open the project again.`
      : "Its folder was moved or deleted. Move it back, then open the project again.",
  };
}

/**
 * Opens in the thread last open, else the last worked on, else a new one in the first folder, with
 * `show` (or `showProject`) beside it. Without a `show`, a chat waiting on the person wins and
 * opens beside its own panel. A project whose folder Studio cannot find says so (`project` names it).
 */
export function useOpenProject() {
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  return async (
    folder: EnvironmentProject | null,
    threads: ReadonlyArray<EnvironmentThreadShell>,
    show?: (ref: ScopedThreadRef) => void,
    project: { readonly name: string; readonly folders: ReadonlyArray<string> } | null = null,
  ) => {
    const asking = show === undefined ? waitingChat(threads) : null;
    const thread = asking ?? threadToOpen(threads, readOpened());
    if (thread !== null) {
      foldSidebarForPart();
      const ref = scopeThreadRef(thread.environmentId, thread.id);
      (asking !== null ? showChat : (show ?? showProject))(ref);
      await navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
      return;
    }
    if (folder === null) {
      toastManager.add({ type: "error", ...missingFolderNotice(project) });
      return;
    }
    const projectRef = scopeProjectRef(folder.environmentId, folder.id);
    // A project with only a chat not sent yet opens in it, with what was written in it.
    const unsent = unsentChat(
      useComposerDraftStore.getState().getDraftThreadByProjectRef(projectRef),
    );
    if (unsent !== null) {
      foldSidebarForPart();
      (show ?? showProject)(scopeThreadRef(unsent.environmentId, unsent.threadId));
      await navigate({ to: "/draft/$draftId", params: { draftId: unsent.draftId } });
      return;
    }
    const draft = await handleNewThread(projectRef);
    if (draft !== null) {
      foldSidebarForPart();
      (show ?? showProject)(scopeThreadRef(folder.environmentId, draft.threadId));
    }
  };
}

/** A project's chat not sent yet, to open it in; null once it was sent (it is a thread then). */
export function unsentChat<Session extends { readonly promotedTo?: unknown }>(
  session: Session | null,
): Session | null {
  return session !== null && session.promotedTo == null ? session : null;
}
