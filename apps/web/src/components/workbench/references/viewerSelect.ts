import { create } from "zustand";

/**
 * Picks a chat's message carried (a Quick Edit's references), asked of the CAD views beside that
 * chat as `studio/select` and answered on `studio/notifications/select-taken`. Each press has its
 * own `nonce`. A view of another document finds none of them, so of several answers the one that
 * found the most stands.
 */
export interface ViewerSelect {
  readonly references: ReadonlyArray<string>;
  readonly nonce: number;
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
  /** Asks the views beside the chat to select `references`; answers the press's nonce. */
  readonly select: (threadKey: string, references: ReadonlyArray<string>) => number;
  /** A view answered the press numbered `nonce`: the answer that found the most stands. */
  readonly answer: (nonce: number, taken: SelectAnswer) => void;
}>()((setState, get) => ({
  asks: {},
  answers: {},
  select: (threadKey, references) => {
    pressed += 1;
    setState({ asks: { ...get().asks, [threadKey]: { references, nonce: pressed } } });
    return pressed;
  },
  answer: (nonce, taken) => {
    const before = get().answers[nonce];
    if (before !== undefined && before.found >= taken.found) return;
    setState({ answers: { ...get().answers, [nonce]: taken } });
  },
}));

/** What the views beside the chat are asked to select now, or null. */
export function useViewerSelect(threadKey: string | null | undefined): ViewerSelect | null {
  return useViewerSelectStore((state) =>
    threadKey == null ? null : (state.asks[threadKey] ?? null),
  );
}
