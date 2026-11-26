import type { ComposerHandleRef } from "~/composerHandleContext";
import { toastManager } from "../ui/toast";

/**
 * Whether a job handed to the chat sends at once: it does into an empty composer; into a draft the
 * person is writing, it is added after their words and waits, so they see both and send.
 */
export function sendsAtOnce(draft: string): boolean {
  return draft.trim() === "";
}

/**
 * Hands a job to a chat (New, the Toolbox, ⌘K, the Overview): written into its composer, which
 * sends it once it holds it, unless the composer held a draft (`sendsAtOnce`). While the agent
 * waits on a question, the job is the answer to it. A chat that can't take it now (an approval
 * waiting, a question with only its own answers) says so rather than dropping the press.
 */
export function handToChat(composerRef: ComposerHandleRef, prompt: string): void {
  const composer = composerRef.current;
  if (composer === null) return;
  const send = sendsAtOnce(composer.readSnapshot().value);
  if (!composer.insertTextAtEnd(prompt, { ensureLeadingBoundary: true })) {
    toastManager.add({
      type: "info",
      title: "The chat is waiting on you",
      description: "Answer what it's asking, then start this job.",
    });
    return;
  }
  if (send) requestAnimationFrame(() => composer.submit());
}

/**
 * A view's own Send (the model's Quick Edit bar): the person pressed send there, so it starts the
 * turn now, as the chat's send button does. What the composer already holds goes with it, for that
 * is what the view queued (its picks and references) or what the person was adding to it.
 */
export function sendViewMessage(composerRef: ComposerHandleRef, text: string): void {
  const composer = composerRef.current;
  if (composer === null) throw new Error("Messages from apps need a chat.");
  if (!composer.insertTextAtEnd(text, { ensureLeadingBoundary: true })) {
    throw new Error("The chat is waiting on you: answer it, then send this again.");
  }
  composer.submit();
}
