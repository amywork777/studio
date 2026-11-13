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

/**
 * Opens in the thread last open, else the last worked on, else a new one in the first folder, with
 * `show` (or `showProject`) beside it. Without a `show`, a chat waiting on the person wins and
 * opens beside its own panel.
 */
export function useOpenProject() {
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  return async (
    folder: EnvironmentProject | null,
    threads: ReadonlyArray<EnvironmentThreadShell>,
    show?: (ref: ScopedThreadRef) => void,
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
    if (folder === null) return;
    const draft = await handleNewThread(scopeProjectRef(folder.environmentId, folder.id));
    if (draft !== null) {
      foldSidebarForPart();
      (show ?? showProject)(scopeThreadRef(folder.environmentId, draft.threadId));
    }
  };
}
