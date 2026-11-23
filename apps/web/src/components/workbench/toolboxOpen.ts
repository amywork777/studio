import { create } from "zustand";

interface ToolboxOpenState {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

/**
 * Whether the Toolbox's popup is open: one answer for the popup and the title bar's Toolbox button,
 * the one way in (the sidebar's Toolbox and the chat's More tools open it too, `openToolbox`). It
 * starts shut in each window, so the model has the panel.
 */
export const useToolboxOpen = create<ToolboxOpenState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/**
 * Opens the Toolbox's popup as its title-bar button does, with the panel if that is shut: the way
 * the sidebar's Toolbox and the chat's More tools take in a project. False where there is no
 * button (no project open), for the caller's own way.
 */
export function openToolbox(): boolean {
  const button = document.querySelector<HTMLButtonElement>("[data-studio-toolbox-button]");
  if (button === null) return false;
  if (!useToolboxOpen.getState().open) button.click();
  return true;
}
