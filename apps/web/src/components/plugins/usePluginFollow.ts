import {
  pluginFollowTarget,
  workspaceRelativePath,
} from "@t3tools/client-runtime/state/pluginFollow";
import type { ThreadStructureVisibleTurnItem } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";

import {
  type PluginAppSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { sameFile, surfaceFile } from "../workbench/sameFile";
import { agentViewSurface, pluginAppSurface } from "./pluginSurfaces";

interface ThreadFollowState {
  /**
   * Runs seen in progress while this client was open, each with the panel's
   * user-action revision when it was first seen. Only their items are followed.
   */
  readonly liveRuns: Map<string, number>;
  readonly followed: Set<string>;
}

// Per thread for the session, so a remount or a thread switch never replays an item,
// and opening an old thread never opens what its finished runs wrote.
const followByThread = new Map<string, ThreadFollowState>();

function followState(threadKey: string): ThreadFollowState {
  let state = followByThread.get(threadKey);
  if (state === undefined) {
    state = { liveRuns: new Map(), followed: new Set() };
    followByThread.set(threadKey, state);
  }
  return state;
}

/**
 * An agent's call to a view's tool opens that view with the call's arguments. With `followFiles`,
 * a file a view claims opens in one only while none of that plugin's views is open: an open view
 * refreshes itself, and a panel choice made during the run wins.
 */
export function usePluginFollow(input: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly threadKey: string | null;
  readonly runningRunId: string | null;
  readonly items: ReadonlyArray<ThreadStructureVisibleTurnItem>;
  /** The thread's working directory, to make the agent's absolute paths workspace-relative. */
  readonly workspaceRoot: string | null;
  readonly followFiles: boolean;
}) {
  const { environmentId, threadRef, threadKey, runningRunId, items, workspaceRoot, followFiles } =
    input;
  const list = useEnvironmentQuery(
    threadRef === null ? null : pluginEnvironment.list({ environmentId, input: {} }),
  );
  const plugins = list.data?.plugins;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records each run seen live in the session's follow registry, with the panel store's revision at that moment
  useEffect(() => {
    if (threadRef === null || threadKey === null || runningRunId === null) return;
    const { liveRuns } = followState(threadKey);
    if (!liveRuns.has(runningRunId)) {
      liveRuns.set(runningRunId, useRightPanelStore.getState().getUserActionRevision(threadRef));
    }
  }, [threadRef, threadKey, runningRunId]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- opens plugin views in the right panel store as a live run's completed items stream in, each item once per session
  useEffect(() => {
    if (threadRef === null || threadKey === null || plugins === undefined) return;
    const state = followState(threadKey);
    if (state.liveRuns.size === 0) return;
    // The agent's own call wins over a followed file in the same pass; the last of each counts.
    let agentSurface: PluginAppSurface | null = null;
    let fileFollow: { readonly surface: PluginAppSurface; readonly revision: number } | null = null;
    for (const { item } of items) {
      const runRevision = item.runId === null ? undefined : state.liveRuns.get(item.runId);
      if (runRevision === undefined) continue;
      if (item.status !== "completed" || state.followed.has(item.id)) continue;
      // Replies and reasoning never open a view; the rest are whole turn items.
      if (item.type === "assistant_message" || item.type === "reasoning") continue;
      state.followed.add(item.id);
      const target = pluginFollowTarget(plugins, item);
      if (target === null) continue;
      if (target.kind === "agent") {
        agentSurface = agentViewSurface(target.choice, target.arguments, target.source);
        continue;
      }
      if (!followFiles) continue;
      const file = workspaceRelativePath(target.path, workspaceRoot);
      if (file !== null) {
        fileFollow = { surface: pluginAppSurface(target.choice, file), revision: runRevision };
      }
    }
    const panels = useRightPanelStore.getState();
    if (agentSurface !== null) {
      // The agent's view of a file takes the place of a tab already showing it (Studio's one tab
      // per file, `workbench/sameFile.ts`).
      const shown = surfaceFile(agentSurface);
      for (const surface of selectThreadRightPanelState(panels.byThreadKey, threadRef).surfaces) {
        const file = surfaceFile(surface);
        if (
          shown !== null &&
          file !== null &&
          surface.id !== agentSurface.id &&
          sameFile(file, shown)
        ) {
          panels.closeSurface(threadRef, surface.id);
        }
      }
      // The agent asked for this view, so it opens over any panel choice.
      panels.openProactive(threadRef, agentSurface, panels.getUserActionRevision(threadRef));
      return;
    }
    if (fileFollow === null) return;
    const pluginId = fileFollow.surface.pluginId;
    const open = selectThreadRightPanelState(panels.byThreadKey, threadRef).surfaces;
    if (open.some((surface) => surface.kind === "plugin-app" && surface.pluginId === pluginId)) {
      return;
    }
    // A choice made in the panel since the run started wins over following a file.
    panels.openProactive(threadRef, fileFollow.surface, fileFollow.revision);
  }, [threadRef, threadKey, plugins, items, workspaceRoot, followFiles]);
}
