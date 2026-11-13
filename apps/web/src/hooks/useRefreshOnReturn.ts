import { useEffect } from "react";

/** How long after the window comes back a refresh waits, so focus and visibility make one. */
export const RETURN_REFRESH_DEBOUNCE_MS = 250;

/**
 * Calls `refresh` once each time the user comes back to the window (it gains focus or is shown
 * again), for what can change while they are away without the server saying so, such as files a
 * user adds to a project in Finder. Returns what stops it.
 */
export function onReturn(
  view: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  page: Pick<EventTarget, "addEventListener" | "removeEventListener"> & {
    readonly visibilityState: DocumentVisibilityState;
  },
  refresh: () => void,
  delayMs = RETURN_REFRESH_DEBOUNCE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      refresh();
    }, delayMs);
  };
  const shown = () => {
    if (page.visibilityState === "visible") schedule();
  };
  view.addEventListener("focus", schedule);
  page.addEventListener("visibilitychange", shown);
  return () => {
    if (timer !== null) clearTimeout(timer);
    view.removeEventListener("focus", schedule);
    page.removeEventListener("visibilitychange", shown);
  };
}

/** `onReturn` for as long as the component is mounted. Pass a stable `refresh` (`useStableCallback`). */
export function useRefreshOnReturn(refresh: () => void): void {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- holds window focus and visibility listeners while mounted.
  useEffect(() => onReturn(window, document, refresh), [refresh]);
}
