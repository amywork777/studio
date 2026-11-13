import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";
import { create } from "zustand";

import {
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "~/rightPanelStore";
import { setSimpleView } from "./simpleView";

/**
 * Opens a project's Overview beside a chat, across the window as a Google Drive folder opens
 * (`ProjectEverything`): from the sidebar's Overview and the top bar's project name. A file opened
 * from it keeps that width (`openFromOverview`); opening a chat from it, or New's Create, brings
 * the chat back beside it.
 */
export function showOverview(threadRef: ScopedThreadRef): void {
  const panels = useRightPanelStore.getState();
  const spread = selectThreadRightPanelState(panels.byThreadKey, threadRef).maximized === true;
  panels.open(threadRef, "files");
  panels.setMaximized(threadRef, true);
  if (!spread) spreadForOverview.add(scopedThreadKey(threadRef));
}

/**
 * How a chat's Overview shows: `alone` when it fills the main pane, where the chat is out of sight
 * (`showOverview`), `beside` when the chat shows with it, null when it is not in front. The sidebar
 * fills one row by this: the Overview's when alone, else the chat's.
 */
export function overviewStanding(
  byThreadKey: Parameters<typeof selectThreadRightPanelState>[0],
  threadRef: ScopedThreadRef | null,
): "alone" | "beside" | null {
  if (threadRef === null) return null;
  if (selectActiveRightPanelSurface(byThreadKey, threadRef)?.kind !== "files") return null;
  return selectThreadRightPanelState(byThreadKey, threadRef).maximized === true
    ? "alone"
    : "beside";
}

/** The chats whose panel `showOverview` spread across the window, to step back on leaving it. */
const spreadForOverview = new Set<string>();

/** A file opened from the Overview stays at the panel's width: going between tabs keeps it too. */
export function keepOverviewSpread(threadRef: ScopedThreadRef): void {
  spreadForOverview.delete(scopedThreadKey(threadRef));
}

/** Threads of projects just opened, waiting for their part to be found (`useShowProjectPart`). */
export const useOpeningProjects = create<{ readonly threads: ReadonlySet<string> }>()(() => ({
  threads: new Set(),
}));

/**
 * Opens a project the way an engineer picks up a part: its part beside the chat, in CAD mode. A
 * viewer left open in the chat comes back to the front; else the workspace opens the project's
 * main part once its files are read, or its Overview across the window when it has no part yet
 * (`useShowProjectPart`). From Home's and the Projects page's tiles, the switcher and Cmd+K.
 */
export function showProject(threadRef: ScopedThreadRef): void {
  const panels = useRightPanelStore.getState();
  const viewer = selectThreadRightPanelState(panels.byThreadKey, threadRef).surfaces.find(
    (surface) => surface.kind === "plugin-app",
  );
  if (viewer !== undefined) {
    panels.activateSurface(threadRef, viewer.id);
    panels.setMaximized(threadRef, false);
    setSimpleView(false);
    return;
  }
  const key = scopedThreadKey(threadRef);
  useOpeningProjects.setState(({ threads }) => ({ threads: new Set(threads).add(key) }));
}

/** Takes a thread off the projects waiting for their part; false when it was not waiting. */
export function takeOpeningProject(threadRef: ScopedThreadRef): boolean {
  const key = scopedThreadKey(threadRef);
  if (!useOpeningProjects.getState().threads.has(key)) return false;
  useOpeningProjects.setState(({ threads }) => {
    const rest = new Set(threads);
    rest.delete(key);
    return { threads: rest };
  });
  return true;
}

/**
 * Puts a panel tab in front at the size the panel has: going between the tabs never grows or
 * shrinks it. Only leaving the Overview for another tab steps back beside the chat, once, when the
 * Overview was across the window (`showOverview`); a part the person spread across the window
 * themselves stays so.
 */
export function frontTab(
  threadRef: ScopedThreadRef,
  surface: { readonly id: string; readonly kind: string },
): void {
  const panels = useRightPanelStore.getState();
  const leaving = selectActiveRightPanelSurface(panels.byThreadKey, threadRef)?.kind === "files";
  panels.activateSurface(threadRef, surface.id);
  if (!leaving || surface.kind === "files") return;
  if (spreadForOverview.delete(scopedThreadKey(threadRef))) panels.setMaximized(threadRef, false);
}

/**
 * A chat picked to read (in the sidebar, in Cmd+K): its panel steps back beside it. Each chat keeps
 * its own panel, so one whose Overview was left across the window would otherwise open hidden.
 */
export function showChat(threadRef: ScopedThreadRef): void {
  useRightPanelStore.getState().setMaximized(threadRef, false);
}

/**
 * The open chat the agent is waiting on (an approval, a question): it steps back beside its panel,
 * where its composer asks, once for each request. Spreading the panel again while it waits stays so.
 */
export function useShowWaitingChat(
  threadRef: ScopedThreadRef | null,
  requestId: string | null,
): void {
  const environmentId = threadRef?.environmentId ?? null;
  const threadId = threadRef?.threadId ?? null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- unmaximizes the panel store once per new pending request the server reports
  useEffect(() => {
    if (environmentId === null || threadId === null || requestId === null) return;
    showChat(scopeThreadRef(environmentId, threadId));
  }, [environmentId, threadId, requestId]);
}
