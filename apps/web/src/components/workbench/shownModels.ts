import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { onPluginViewCall, type PluginViewCall } from "../plugins/pluginViewCalls";
import { readViewSync, type ShownView } from "./partContext";
import { modelShown } from "./useFolderModels";
import { WORKBENCH_LAYOUT } from "./workbenchLayout";

/**
 * What each thread's viewer last showed, heard from the view's own sync
 * (text-to-cad's `cad_sync`, once a second while it is on screen) as the frame
 * relays it: no call of Studio's own, so nothing is counted twice. A thread
 * keeps its last answer while its viewer is out of sight.
 */
const shownByThread = new Map<string, ShownView>();
const listeners = new Set<() => void>();

const sameView = (a: ShownView | undefined, b: ShownView) =>
  a !== undefined &&
  a.pluginId === b.pluginId &&
  a.server === b.server &&
  a.path === b.path &&
  a.revision === b.revision;

export function noteViewCall(call: PluginViewCall) {
  if (call.threadId === null) return;
  const shown = readViewSync(call);
  if (shown === null) return;
  const key = scopedThreadKey({ environmentId: call.environmentId, threadId: call.threadId });
  // A sync a second mostly says nothing new: only a change wakes the strip.
  if (sameView(shownByThread.get(key), shown)) return;
  shownByThread.set(key, shown);
  // A model at a new build: what each list holds of when it was built is read again, so a result
  // of the build before says its part changed (`shownResultOutOfDate`).
  if (isDocumentId(shown.path)) modelShown(shown.path, shown.revision);
  for (const listener of listeners) listener();
}

if (WORKBENCH_LAYOUT) onPluginViewCall(noteViewCall);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The model the thread's viewer shows, or last showed this session; null before it shows one. */
export function shownView(threadRef: ScopedThreadRef): ShownView | null {
  return shownByThread.get(scopedThreadKey(threadRef)) ?? null;
}

export function useShownView(threadRef: ScopedThreadRef): ShownView | null {
  return useSyncExternalStore(subscribe, () => shownView(threadRef));
}
