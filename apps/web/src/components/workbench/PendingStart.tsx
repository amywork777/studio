import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";

import { useComposerHandleContext } from "~/composerHandleContext";
import { type FirstChat, useFirstChatName, usePendingStart } from "./usePendingStart";

/**
 * Sends a new project's first message, from Home, once the project's new chat has a composer
 * (`usePendingStart`), and names that chat after the project (`useFirstChatName`). It shows
 * nothing: the project's chats are listed down the left, in the sidebar (`StudioSidebar`).
 */
export function PendingStart(props: {
  readonly project: EnvironmentProject | null;
  /** A chat not started yet (a draft): only it sends the first message. */
  readonly draft: boolean;
  readonly thread: FirstChat | null;
}) {
  const folder = props.project?.workspaceRoot ?? null;
  usePendingStart(useComposerHandleContext(), folder, props.draft);
  useFirstChatName(props.thread, folder, props.draft);
  return null;
}
