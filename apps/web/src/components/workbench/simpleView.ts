import { create } from "zustand";

import type { ViewerEditState } from "./viewerEditState";

const STORAGE_KEY = "studio:simple-view";

/**
 * The choice as storage keeps it: the CAD tools shown (off) where none was ever kept, or storage is
 * off; a kept "1", someone who chose AI or hid the tools, stays hidden.
 */
export function readSimpleView(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * On hides the CAD tools (the viewer's ai layout, text-to-cad as it ships); off shows the full
 * workspace. Every CAD view reads it from its host context (`PluginViewFrame.tsx`). One choice
 * across projects, kept on this device; shown the first time.
 */
export const useSimpleViewStore = create<{ readonly on: boolean }>()(() => ({
  on: readSimpleView(),
}));

export function useSimpleView(): boolean {
  return useSimpleViewStore((store) => store.on);
}

export function setSimpleView(on: boolean): void {
  useSimpleViewStore.setState({ on });
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Storage full or blocked: the choice still holds for the session.
  }
}

/** The viewer's own name for the layout (`text-to-cad/packages/ui/.../edit/editLayout.js`). */
export function viewerEditLayout(simple: boolean): "ai" | "manual" {
  return simple ? "ai" : "manual";
}

/**
 * Hide CAD tools' state for the view in front, by what it says of its part: hidden where the viewer
 * has one layout (a STEP with no part script, a board, the home) or the view has said nothing, held
 * while a command or sketch is open in it.
 */
export function simpleViewToggle(state: ViewerEditState | undefined): "hidden" | "shown" | "held" {
  if (state === undefined || !state.editable) return "hidden";
  return state.busy ? "held" : "shown";
}
