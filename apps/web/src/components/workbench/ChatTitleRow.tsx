import { MessageSquareIcon } from "lucide-react";

import { KIND_TINT } from "./kinds";
import { chatLabel } from "./workspaceTitle";

/**
 * The open chat's name, at the top of the chat column under the window's strip: the strip holds the
 * project and the tabs, and the chat names itself where its messages are.
 */
export function ChatTitleRow(props: { readonly title: string }) {
  const label = chatLabel(props.title);
  return (
    <div
      className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-xs text-muted-foreground sm:px-4"
      data-studio-chat-title=""
    >
      <MessageSquareIcon className={`size-3.5 shrink-0 ${KIND_TINT}`} aria-hidden="true" />
      <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
    </div>
  );
}
