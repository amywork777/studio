import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { SquarePenIcon } from "lucide-react";

import {
  type ComposerThreadDraftState,
  composerDraftHasUserContent,
  DraftId,
  type DraftSessionState,
  useComposerDraftStore,
} from "~/composerDraftStore";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { childRowClass } from "./ChatRows";
import { showChat } from "./overviewPanel";

interface UnsentChat {
  readonly draftId: DraftId;
  readonly session: DraftSessionState;
  readonly preview: string;
}

/** What an unsent chat shows: its text's first line, else how many things are attached to it. */
function previewOf(composer: ComposerThreadDraftState): string {
  const text =
    replaceComposerContextReferences(composer.prompt, (occurrence) => occurrence.label)
      .trim()
      .split("\n", 1)[0] ?? "";
  if (text.length > 0) return text;
  const attached =
    Math.max(composer.images.length, composer.persistedAttachments.length) +
    composer.files.length +
    composer.terminalContexts.length +
    composer.previewAnnotations.length +
    composer.reviewComments.length;
  return `${attached} attachment${attached === 1 ? "" : "s"}`;
}

/**
 * The project's chats that were started and never sent: something typed or attached, and then New
 * chat pressed, which leaves it where it is and starts another. Newest first, as T3's sidebar lists
 * its draft rows; the one open now is not listed, as you are in it.
 */
export function useUnsentChats(
  projects: ReadonlyArray<ScopedProjectRef>,
  currentDraftId: string | null,
): UnsentChat[] {
  const sessions = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const composers = useComposerDraftStore((store) => store.draftsByThreadKey);
  const keys = new Set(projects.map((ref) => `${ref.environmentId}:${ref.projectId}`));
  const unsent: UnsentChat[] = [];
  for (const [key, session] of Object.entries(sessions)) {
    if (session.promotedTo != null || key === currentDraftId) continue;
    if (!keys.has(`${session.environmentId}:${session.projectId}`)) continue;
    const composer = composers[key];
    if (!composer || !composerDraftHasUserContent(composer)) continue;
    unsent.push({ draftId: DraftId.make(key), session, preview: previewOf(composer) });
  }
  return unsent.toSorted((a, b) => b.session.createdAt.localeCompare(a.session.createdAt));
}

/** Each unsent chat as a row above the project's chats, led by the pen T3 marks unsent work with. */
export function UnsentChatRows(props: { readonly chats: ReadonlyArray<UnsentChat> }) {
  const navigate = useNavigate();
  return (
    <SidebarMenu size="compact">
      {props.chats.map(({ draftId, session, preview }) => (
        <SidebarMenuItem key={draftId}>
          <SidebarMenuButton
            size="compact"
            title={`Unsent: ${preview}`}
            onClick={() => {
              showChat(scopeThreadRef(session.environmentId, session.threadId));
              void navigate({ to: "/draft/$draftId", params: { draftId } });
            }}
          >
            <SquarePenIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className={childRowClass(false)}>{preview}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
