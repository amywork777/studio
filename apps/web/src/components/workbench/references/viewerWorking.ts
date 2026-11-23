import { create } from "zustand";

/**
 * Which chats have an agent turn under way, for the CAD views beside them (`studio/working`): the
 * view says "Studio is changing this part…" and shows what changed on the next rebuild.
 */
export const useViewerWorkingStore = create<{
  readonly working: Readonly<Record<string, true>>;
  readonly set: (threadKey: string, working: boolean) => void;
}>()((setState, get) => ({
  working: {},
  set: (threadKey, working) => {
    const { working: before } = get();
    if (Boolean(before[threadKey]) === working) return;
    const { [threadKey]: _was, ...rest } = before;
    setState({ working: working ? { ...rest, [threadKey]: true } : rest });
  },
}));

/** What a view beside the chat is told: `{ working: true }` while a turn runs, else null. */
export function useViewerWorking(
  threadKey: string | null | undefined,
): { readonly working: true } | null {
  const working = useViewerWorkingStore((state) =>
    threadKey == null ? false : state.working[threadKey] === true,
  );
  return working ? WORKING : null;
}

const WORKING = Object.freeze({ working: true as const });
