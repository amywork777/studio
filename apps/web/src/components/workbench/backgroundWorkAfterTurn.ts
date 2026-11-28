import type { OrchestrationV2PendingBackgroundTask } from "@t3tools/contracts";
import { presentPendingBackgroundWork } from "@t3tools/client-runtime/state/thread-execution";

/** The end-of-chat line for work the agent left running, in Studio's words. */
export interface BackgroundWorkAfterTurn {
  readonly title: string;
  readonly description: string;
}

/**
 * A Bash command past its time limit moves to the background and keeps going (one waiting on input,
 * forever), so after the reply its line says it is still running and that Stop ends it. Null while
 * the turn is live or the agent waits on the work, where T3's own line holds.
 */
export function backgroundWorkAfterTurn(
  tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>,
  runIsLive: boolean,
): BackgroundWorkAfterTurn | null {
  if (runIsLive) return null;
  const presentation = presentPendingBackgroundWork(tasks);
  if (presentation === null || presentation.waiting) return null;
  const [only] = presentation.items;
  const title =
    presentation.items.length === 1 && only !== undefined
      ? `Still running after the reply · ${only.label}`
      : `${presentation.items.length} still running after the reply`;
  const it = presentation.items.length === 1 ? "it" : "them";
  return {
    title,
    description: `The agent left ${it} running in the background. Stop ends ${it}.`,
  };
}
