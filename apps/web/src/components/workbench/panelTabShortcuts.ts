import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";

import { isMacPlatform } from "~/lib/utils";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { frontTab } from "./overviewPanel";

/** The panel's tabs in the order they show: the pinned Overview first, then the rest as they are. */
export function tabOrder(
  surfaces: ReadonlyArray<{ readonly id: string; readonly kind: string }>,
): string[] {
  return [
    ...surfaces.filter((surface) => surface.kind === "files"),
    ...surfaces.filter((surface) => surface.kind !== "files"),
  ].map((surface) => surface.id);
}

/**
 * Which tab a Chrome tab shortcut goes to: the next or the one before (Ctrl+Tab, Ctrl+Shift+Tab,
 * round the ends), or by its place (Cmd+1 to 8, and Cmd+9 the last, as Chrome does). Null when
 * there is no such tab.
 */
export function tabTarget(
  ids: ReadonlyArray<string>,
  activeId: string | null,
  move: { readonly step: 1 | -1 } | { readonly digit: number },
): string | null {
  if (ids.length === 0) return null;
  if ("digit" in move) {
    if (move.digit === 9) return ids.at(-1) ?? null;
    return ids[move.digit - 1] ?? null;
  }
  const at = activeId === null ? -1 : ids.indexOf(activeId);
  if (at === -1) return move.step === 1 ? ids[0]! : ids.at(-1)!;
  return ids[(at + move.step + ids.length) % ids.length]!;
}

/**
 * Chrome's tab shortcuts for the workspace panel's tabs, in the engineering interface: Ctrl+Tab
 * and Ctrl+Shift+Tab to go round them, Cmd+1 to 8 (Ctrl off a Mac) to one by its place and Cmd+9
 * to the last. Cmd and a number take the chord before T3 Code's own (the Nth thread of its coding
 * sidebar, which the engineering interface does not show).
 */
export function usePanelTabShortcuts(threadRef: ScopedThreadRef): void {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window keydown listener held while the workspace is mounted
  useEffect(() => {
    const mac = isMacPlatform(navigator.platform);
    const handle = (event: KeyboardEvent) => {
      if (event.altKey) return;
      const tab = event.key === "Tab" && event.ctrlKey && !event.metaKey;
      const digit =
        /^[1-9]$/.test(event.key) &&
        !event.shiftKey &&
        (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
      if (!tab && !digit) return;
      const panels = useRightPanelStore.getState();
      const state = selectThreadRightPanelState(panels.byThreadKey, threadRef);
      const target = tabTarget(
        tabOrder(state.surfaces),
        state.activeSurfaceId,
        tab ? { step: event.shiftKey ? -1 : 1 } : { digit: Number(event.key) },
      );
      if (target === null) return;
      event.preventDefault();
      event.stopPropagation();
      const surface = state.surfaces.find((entry) => entry.id === target);
      if (surface === undefined) panels.activateSurface(threadRef, target);
      else frontTab(threadRef, surface);
    };
    // Taken as it comes down, before anything listening on the way back up sees it.
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [threadRef]);
}
