/**
 * The viewer absorbs a wider window; the chat dock keeps its user-set width. Without the brand
 * (`brand.json` `"layout": "workbench"`), T3 Code's own layout is unchanged.
 */
export const WORKBENCH_LAYOUT = import.meta.env.VITE_APP_LAYOUT === "workbench";

/**
 * The dock's saved width. A new name from when the dock's floor went from 340 to 300: a width saved
 * before then starts over at the default, once, and a width dragged from now on is kept.
 */
export const CHAT_DOCK_WIDTH_STORAGE_KEY = "studio:chat-dock-width-300";
export const CHAT_DOCK_DEFAULT_WIDTH = 300;
/** As narrow as the dock goes: it opens there, for the model to have the room. */
export const CHAT_DOCK_MIN_WIDTH = 300;
/** The viewer's own floor; below both floors the dock yields, as T3's chat column does. */
export const WORKBENCH_MIN_WIDTH = 360;

/** The dock's width in a row this wide, between its floor and what leaves the viewer its floor. */
export function chatDockWidth(rowWidth: number, dockWidth: number): number {
  const wanted = Number.isFinite(dockWidth) ? dockWidth : CHAT_DOCK_DEFAULT_WIDTH;
  const max = Math.max(CHAT_DOCK_MIN_WIDTH, rowWidth - WORKBENCH_MIN_WIDTH);
  return Math.round(Math.min(max, Math.max(CHAT_DOCK_MIN_WIDTH, wanted)));
}

/** The viewer's width: the row less the dock, never under its floor. */
export function workbenchPanelWidth(rowWidth: number, dockWidth: number): number {
  return Math.max(WORKBENCH_MIN_WIDTH, Math.floor(rowWidth) - chatDockWidth(rowWidth, dockWidth));
}
