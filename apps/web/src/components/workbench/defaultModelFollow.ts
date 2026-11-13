import type { ModelSelection } from "@t3tools/contracts";

/**
 * The engineering composer has no model picker, so a model chosen in Settings reaches the chat open
 * behind Settings. Settings unmounts that chat, so the change waits as one pending entry keyed to
 * it (`chatInFront`); a later change replaces it, and the chat takes it once, when its key matches,
 * through the picker's own path (`onProviderModelSelect`).
 */
export interface PendingModelFollow {
  readonly threadKey: string;
  readonly selection: ModelSelection;
}

let chatInFront: string | null = null;
let pending: PendingModelFollow | null = null;

/** `ChatView` says which chat is shown. */
export function setChatInFront(threadKey: string | null): void {
  if (threadKey !== null) chatInFront = threadKey;
}

/**
 * Settings chose a model (`selection`) or reset it to Automatic (null). A choice waits for the
 * chat that was in front; a reset applies to no open chat, and drops any choice still waiting.
 */
export function proposeModelFollow(selection: ModelSelection | null): void {
  pending =
    selection !== null && chatInFront !== null ? { threadKey: chatInFront, selection } : null;
}

/**
 * The selection to put on the chat whose key is `activeThreadKey`, or null. Only the engineering
 * interface follows, only for the chat the change was made for, and only with something pending
 * (so a chat loading cold, with no change made, never changes).
 */
export function followToApply(input: {
  readonly engineering: boolean;
  readonly pending: PendingModelFollow | null;
  readonly activeThreadKey: string | null;
}): ModelSelection | null {
  if (!input.engineering || input.pending === null || input.activeThreadKey === null) return null;
  return input.pending.threadKey === input.activeThreadKey ? input.pending.selection : null;
}

/** The chat takes its pending change: what to apply, which is then no longer pending. */
export function takePendingFollow(
  engineering: boolean,
  activeThreadKey: string | null,
): ModelSelection | null {
  const selection = followToApply({ engineering, pending, activeThreadKey });
  if (selection !== null) pending = null;
  return selection;
}

/** Forgets everything, for tests. */
export function resetModelFollow(): void {
  chatInFront = null;
  pending = null;
}
