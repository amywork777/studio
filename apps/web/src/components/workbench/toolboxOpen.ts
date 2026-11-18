import { create } from "zustand";

interface ToolboxOpenState {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

/**
 * Whether the Toolbox's popup is open: one answer for the popup and the title bar's Toolbox button,
 * the one way in. It starts shut in each window, so the model has the panel.
 */
export const useToolboxOpen = create<ToolboxOpenState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
