import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { useEffect } from "react";

import { type ThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";

type Tabs = Pick<ThreadRightPanelState, "isOpen" | "surfaces" | "activeSurfaceId">;

/** Each folder's tabs as its chats last left them: what the next one opened shows. */
const byFolder = new Map<string, Tabs>();

/**
 * Keeps a chat's tabs as its folder's: on opening, it takes the tabs the folder's chats were last
 * left with; from then on its changes are the folder's. Returns the way to stop. Whether the panel
 * is spread across the window stays the chat's own (`showChat`).
 */
export function followFolderTabs(threadKey: string, folderKey: string): () => void {
  const kept = byFolder.get(folderKey);
  if (kept !== undefined) {
    useRightPanelStore.setState((state) => {
      const own = state.byThreadKey[threadKey];
      if (
        own !== undefined &&
        own.isOpen === kept.isOpen &&
        own.surfaces === kept.surfaces &&
        own.activeSurfaceId === kept.activeSurfaceId
      ) {
        return state;
      }
      return { byThreadKey: { ...state.byThreadKey, [threadKey]: { ...own, ...kept } } };
    });
  }
  const keep = (state: { readonly byThreadKey: Record<string, ThreadRightPanelState> }) => {
    const own = state.byThreadKey[threadKey];
    if (own === undefined) return;
    const { isOpen, surfaces, activeSurfaceId } = own;
    byFolder.set(folderKey, { isOpen, surfaces, activeSurfaceId });
  };
  keep(useRightPanelStore.getState());
  return useRightPanelStore.subscribe(keep);
}

/**
 * A project's tabs as Chrome keeps a window's: the same ones beside every chat of its folder, the
 * files looked at lately there, not a set for each chat. T3 Code keeps a panel per thread
 * (`rightPanelStore`); Studio carries the tabs across as another chat of the folder opens.
 */
export function useProjectTabs(threadRef: ScopedThreadRef | null, folder: string | null): void {
  const threadKey = threadRef === null ? null : scopedThreadKey(threadRef);
  const folderKey = folder === null ? null : studioFolderKey(folder);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes the right panel store to the folder's shared tabs for this thread
  useEffect(() => {
    if (threadKey === null || folderKey === null) return;
    return followFolderTabs(threadKey, folderKey);
  }, [threadKey, folderKey]);
}
