import { create } from "zustand";

import { readToolboxFolded, toolboxFolded, writeToolboxFolded } from "./toolbox";

interface ToolboxFoldState {
  /** The person's choice on a wide panel, remembered on this device. */
  readonly chosen: boolean;
  /** The panel is narrow (`toolboxNarrowRem`), as the Toolbox measures it. */
  readonly narrow: boolean;
  /** Opened on a narrow panel, forgotten once it is wide again. */
  readonly openedNarrow: boolean;
  /** Asked open while the panel was shut: kept open whatever width the panel opens at. */
  readonly openAsked: boolean;
  readonly setNarrow: (narrow: boolean) => void;
  readonly setFolded: (folded: boolean) => void;
  /** Open it with the panel, from the title bar's button while the panel is shut. */
  readonly openWithPanel: () => void;
}

/**
 * Whether the Toolbox is folded, one answer for the Toolbox itself and the title bar's Toolbox
 * button, so either one opens or folds it and both show the same.
 */
export const useToolboxFold = create<ToolboxFoldState>((set, get) => ({
  chosen: readToolboxFolded(),
  narrow: false,
  openedNarrow: false,
  openAsked: false,
  setNarrow: (narrow) => {
    if (get().openAsked) set({ narrow, openedNarrow: true, openAsked: false });
    else if (narrow !== get().narrow) set({ narrow, openedNarrow: false });
  },
  setFolded: (folded) => {
    if (get().narrow) {
      set({ openedNarrow: !folded });
      return;
    }
    writeToolboxFolded(folded);
    set({ chosen: folded });
  },
  openWithPanel: () => {
    writeToolboxFolded(false);
    set({ chosen: false, openedNarrow: true, openAsked: true });
  },
}));

export const selectToolboxFolded = (state: ToolboxFoldState): boolean => toolboxFolded(state);
