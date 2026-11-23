import { useEffect } from "react";
import { create } from "zustand";

/**
 * A message's picks, asked of one CAD view beside its chat (`studio/select`, answered on
 * `studio/notifications/select-taken`), as the message wrote them; the view resolves them. One
 * `nonce` a press. The view of the message's file takes it, else the one in front (`selectTakenBy`).
 */
export interface ViewerSelect {
  readonly references: ReadonlyArray<string>;
  readonly nonce: number;
  /** The message's `File:`: a path, or a document id that names no view's file. */
  readonly file: string | null;
}

const normalized = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");

/** Whether a view showing `viewFile` is the one the message's `file` names. */
function selectFileMatches(file: string | null, viewFile: string): boolean {
  if (file === null || file === "") return false;
  const asked = normalized(file);
  const shown = normalized(viewFile);
  return shown === asked || shown.endsWith(`/${asked}`) || asked.endsWith(`/${shown}`);
}

/** Whether the view showing `viewFile` takes an ask: the message's file's view, else the one in front. */
export function selectTakenBy(input: {
  readonly file: string | null;
  readonly viewFile: string;
  readonly front: boolean;
  readonly openFiles: ReadonlyArray<string>;
}): boolean {
  if (selectFileMatches(input.file, input.viewFile)) return true;
  return input.front && !input.openFiles.some((open) => selectFileMatches(input.file, open));
}

export interface SelectAnswer {
  readonly found: number;
  readonly missing: number;
}

let pressed = 0;

export const useViewerSelectStore = create<{
  /** Each chat's ask, the latest press only. */
  readonly asks: Readonly<Record<string, ViewerSelect>>;
  /** What the views said of each press, by its nonce. */
  readonly answers: Readonly<Record<number, SelectAnswer>>;
  /** The files of the CAD views open beside each chat, kept or in front. */
  readonly open: Readonly<Record<string, ReadonlyArray<string>>>;
  /** Asks a view beside the chat to select `references`; answers the press's nonce. */
  readonly select: (
    threadKey: string,
    references: ReadonlyArray<string>,
    file: string | null,
  ) => number;
  /** A view showing `file` is open beside the chat; returns its leaving. */
  readonly opened: (threadKey: string, file: string) => () => void;
  /** A view answered the press numbered `nonce`: the answer that found the most stands. */
  readonly answer: (nonce: number, taken: SelectAnswer) => void;
}>()((setState, get) => ({
  asks: {},
  answers: {},
  open: {},
  select: (threadKey, references, file) => {
    pressed += 1;
    setState({ asks: { ...get().asks, [threadKey]: { references, nonce: pressed, file } } });
    return pressed;
  },
  opened: (threadKey, file) => {
    setState({ open: { ...get().open, [threadKey]: [...(get().open[threadKey] ?? []), file] } });
    return () => {
      const files = [...(get().open[threadKey] ?? [])];
      const at = files.indexOf(file);
      if (at !== -1) files.splice(at, 1);
      setState({ open: { ...get().open, [threadKey]: files } });
    };
  },
  answer: (nonce, taken) => {
    const before = get().answers[nonce];
    if (before !== undefined && before.found >= taken.found) return;
    setState({ answers: { ...get().answers, [nonce]: taken } });
  },
}));

/**
 * What the view showing `place.file` beside its chat is asked to select now, or null: the ask is its
 * when its file is the message's, else when it is in front and no open view's file is.
 */
export function useViewerSelect(
  place: { readonly threadKey: string; readonly file: string } | null | undefined,
  front: boolean,
): ViewerSelect | null {
  const threadKey = place?.threadKey ?? null;
  const file = place?.file ?? null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers this view's file beside its chat in the module store the asks are matched against, while it is mounted
  useEffect(() => {
    if (threadKey === null || file === null) return undefined;
    return useViewerSelectStore.getState().opened(threadKey, file);
  }, [threadKey, file]);
  return useViewerSelectStore((state) => {
    if (threadKey === null || file === null) return null;
    const ask = state.asks[threadKey];
    if (ask === undefined) return null;
    const openFiles = state.open[threadKey] ?? [];
    return selectTakenBy({ file: ask.file, viewFile: file, front, openFiles }) ? ask : null;
  });
}
