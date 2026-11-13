import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

import type { RightPanelSurface } from "~/rightPanelStore";
import { sameFile, surfaceFile } from "../sameFile";

/**
 * A script line for a part's CAD view to select, sent as `studio/focus` and let go on
 * `studio/notifications/focus-taken`. Each press has its own `nonce`, so a view takes each ask
 * once and an answer to an earlier press never lets a later one go.
 */
export interface ViewerFocus {
  readonly path: string;
  readonly line: number;
  readonly nonce: number;
}

/** Each chat's asks, by the STEP of the part each is for. */
type ByThread = Readonly<Record<string, Readonly<Record<string, ViewerFocus>>>>;

let pressed = 0;

export const useViewerFocusStore = create<{
  readonly byThread: ByThread;
  /** Asks the view of `step` beside the chat to show `at`, in place of any ask for it before. */
  readonly focus: (threadKey: string, step: string, at: { path: string; line: number }) => void;
  /** The view of `step` has taken the ask numbered `nonce`; an ask made since stands. */
  readonly take: (threadKey: string, step: string, nonce: number) => void;
}>()((setState, get) => ({
  byThread: {},
  focus: (threadKey, step, { path, line }) => {
    pressed += 1;
    const { byThread } = get();
    const others = Object.entries(byThread[threadKey] ?? {}).filter(
      ([kept]) => !sameFile(kept, step),
    );
    setState({
      byThread: {
        ...byThread,
        [threadKey]: { ...Object.fromEntries(others), [step]: { path, line, nonce: pressed } },
      },
    });
  },
  take: (threadKey, step, nonce) => {
    const { byThread } = get();
    const asks = Object.entries(byThread[threadKey] ?? {});
    const kept = asks.filter(([part, ask]) => !(sameFile(part, step) && ask.nonce === nonce));
    if (kept.length === asks.length) return;
    const { [threadKey]: _taken, ...rest } = byThread;
    setState({
      byThread: kept.length === 0 ? rest : { ...rest, [threadKey]: Object.fromEntries(kept) },
    });
  },
}));

/** The ask for a view of `file` beside the chat, however either names the file; null for none. */
export function viewerFocusOf(
  state: { readonly byThread: ByThread },
  threadKey: string,
  file: string,
): ViewerFocus | null {
  const asks = Object.entries(state.byThread[threadKey] ?? {});
  return asks.find(([step]) => sameFile(step, file))?.[1] ?? null;
}

/** Where a view's asks are kept: the chat it is beside, and the file its tab shows. */
export interface ViewerFocusPlace {
  readonly threadKey: string;
  readonly file: string;
}

/**
 * Where the view a panel tab shows keeps its asks: the tab's chat, and the file the tab shows,
 * named as `openInPanel` finds a tab by it (`surfaceFile`): the file it opened on or, for the view
 * the agent opened, the one the agent's call named. Null for a tab of no file, asked nothing.
 */
export function viewerFocusPlace(
  threadRef: ScopedThreadRef,
  surface: RightPanelSurface,
): ViewerFocusPlace | null {
  const file = surfaceFile(surface);
  return file === null ? null : { threadKey: scopedThreadKey(threadRef), file };
}

/** What a view is asked to show now (`studio/focus`), or null; a view with no place, nothing. */
export function useViewerFocus(place: ViewerFocusPlace | null | undefined): ViewerFocus | null {
  return useViewerFocusStore((state) =>
    place == null ? null : viewerFocusOf(state, place.threadKey, place.file),
  );
}

/**
 * The view has taken the ask numbered `nonce` (`studio/notifications/focus-taken`), or gone before
 * it read its part: either way the ask goes, and an ask made since stands.
 */
export function takeViewerFocus(place: ViewerFocusPlace, nonce: number): void {
  useViewerFocusStore.getState().take(place.threadKey, place.file, nonce);
}
