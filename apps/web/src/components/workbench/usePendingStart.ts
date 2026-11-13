import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useEffect } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryServerConfigAtom } from "~/state/server";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { toastManager } from "../ui/toast";
import { NO_AGENT, OPEN_AGENTS } from "./agentWords";
import { firstChatName, takePendingStart } from "./startProject";
import { useStudioProjectAt } from "./useStudioProjects";

/** About two seconds of frames to wait for the composer to mount. */
const FRAMES = 120;
/** A chat that cannot send yet (files still read, its provider still loading) ignores Send. */
const RETRY_MS = 250;
const TRIES = 60;
/** Presses in a row with no AI agent to send to before it stops: a second, past a chat settling. */
const SURE = 4;

/**
 * Sends a new project's first message, set by Home's Start (`useStartProject.ts`), once the
 * project's new chat has a composer: its files first, then the text, then Send, as the person
 * would. Only in a chat not started yet, and only once (`takePendingStart`).
 */
export function usePendingStart(
  composerRef: ComposerHandleRef | null,
  folder: string | null,
  notStarted: boolean,
): void {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- waits frames for the composer to mount, then hands it the pending start
  useEffect(() => {
    if (composerRef === null || folder === null || !notStarted) return;
    let frame = 0;
    let waited = 0;
    const begin = () => {
      const composer = composerRef.current;
      if (composer === null) {
        if (++waited < FRAMES) frame = requestAnimationFrame(begin);
        return;
      }
      const start = takePendingStart(folder);
      if (start === null) return;
      if (start.files.length > 0) composer.addDroppedFiles([...start.files]);
      composer.insertTextAtEnd(start.prompt, { ensureLeadingBoundary: true });
      pressSendWhileHeld(composerRef, start.prompt.trim());
    };
    begin();
    return () => cancelAnimationFrame(frame);
  }, [composerRef, folder, notStarted]);
}

/** The chat a new project's first message goes to: what `useFirstChatName` renames. */
export interface FirstChat {
  readonly environmentId: EnvironmentId;
  readonly id: ThreadId;
  readonly title: string;
}

/**
 * A new project's first chat, once sent, takes the project's name, and the agent's name for the
 * project when it gives one (`firstChatName`), with T3 Code's own rename (`updateMetadata`, as the
 * sidebar's Rename): a title set so ends T3's making one from the message.
 */
export function useFirstChatName(
  thread: FirstChat | null,
  folder: string | null,
  draft: boolean,
): void {
  const environmentId = thread?.environmentId ?? null;
  const projectName = useStudioProjectAt(environmentId, folder)?.project.name ?? null;
  const updateMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const id = thread?.id ?? null;
  const title = thread?.title ?? "";
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- renames the server's thread once the project's name arrives from the server
  useEffect(() => {
    if (draft || environmentId === null || id === null || folder === null || projectName === null)
      return;
    const named = firstChatName(folder, id, projectName, title);
    if (named === null) return;
    void updateMetadata({ environmentId, input: { threadId: id, title: named } });
  }, [draft, environmentId, folder, id, projectName, title, updateMetadata]);
}

/**
 * What a press of Send would come to: "wait" while the chat still reads its files, "done" once it
 * no longer holds the message (sent, or changed by the person), "blocked" when it has no AI agent
 * to send to (`agent` false: null while the agents are not known yet, which is not a no), and
 * "press" otherwise.
 */
export function sendStep(box: {
  readonly attaching: boolean;
  readonly holds: boolean;
  readonly agent: boolean | null;
}): "wait" | "done" | "blocked" | "press" {
  if (box.attaching) return "wait";
  if (!box.holds) return "done";
  return box.agent === false ? "blocked" : "press";
}

/**
 * Presses Send until the composer no longer holds `message`; the chat ignores a press while a send
 * is under way. With no agent, or out of tries, it says so and leaves the message in the box. This
 * outlives the effect that began it: React may run that effect twice, and the start is taken once.
 */
export function pressSendWhileHeld(composerRef: ComposerHandleRef, message: string): void {
  let tries = 0;
  let blocked = 0;
  const press = () => {
    const composer = composerRef.current;
    const last = ++tries >= TRIES;
    if (composer !== null) {
      const step = sendStep({
        attaching: composer.hasPendingAttachments(),
        holds: composer.readSnapshot().value.includes(message),
        agent:
          appAtomRegistry.get(primaryServerConfigAtom) === null
            ? null
            : composer.getSendContext().providerAvailable,
      });
      if (step === "done") return;
      blocked = step === "blocked" ? blocked + 1 : 0;
      if (blocked === SURE) {
        toastManager.add({
          type: "warning",
          title: NO_AGENT,
          description: `Your message is in the chat box. Sign in from ${OPEN_AGENTS} there, then send it.`,
        });
        return;
      }
      if (last) {
        toastManager.add({
          type: "warning",
          title: "Your message is not sent yet",
          description: "It is in the chat box. Send it when the chat is ready.",
        });
        return;
      }
      if (step === "press") composer.submit();
    }
    if (!last) window.setTimeout(press, RETRY_MS);
  };
  window.setTimeout(press, RETRY_MS);
}
