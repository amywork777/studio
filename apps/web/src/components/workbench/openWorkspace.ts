import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

/**
 * The project workspace on screen, as its top bar knows it (`StudioPanelBar`), for the quick find
 * (`StudioQuickFind`), which opens over everything: its thread, its folder, and the part its jobs
 * are for (the part last on screen, else the lead part; null with no part yet). Null off a
 * workspace.
 */
export interface OpenWorkspace {
  readonly threadRef: ScopedThreadRef;
  readonly folder: string;
  /** `name`: what the part is called, where its viewer or the project's list says it. */
  readonly part: { readonly path: string; readonly kind: string; readonly name?: string } | null;
  /** How the project's parts are made, from its setup. */
  readonly process: string | undefined;
  /** The trade the project is made for, from its setup. */
  readonly industry: string | undefined;
}

export const useOpenWorkspaceStore = create<{
  readonly workspace: OpenWorkspace | null;
  readonly setWorkspace: (workspace: OpenWorkspace | null) => void;
}>()((set) => ({
  workspace: null,
  setWorkspace: (workspace) => set({ workspace }),
}));
