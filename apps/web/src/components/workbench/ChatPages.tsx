import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { Input } from "../ui/input";
import { SidebarInset } from "../ui/sidebar";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { findChats, useAllChats, waitingChats, waitingChatsFirst } from "./allChats";
import { chatStanding } from "./chatStanding";
import type { ChatsSearch } from "./chatsSearch";
import { PageTitle } from "./PageTitle";
import { StudioTopBar } from "./StudioTopBar";
import { useOpenChat } from "./useOpenChat";
import { chatLabel } from "./workspaceTitle";

/**
 * A page of Studio beside the rail, as the Projects page is laid out: its top bar, then a column.
 * Chats, the Library (`LibraryPage`) and each example's page, and Trash (`TrashPage`) are each one.
 */
export function ChatPage(props: {
  readonly title: string;
  /** How many the page lists, beside its title; none for a page of one thing. */
  readonly count?: number;
  readonly lede?: string;
  readonly search?: ReactNode;
  /** The page's one action, at the end of its title. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <StudioTopBar>
          {props.search === undefined ? null : (
            <div className="w-full max-w-72">{props.search}</div>
          )}
        </StudioTopBar>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
          <WorkspacePageContainer>
            <PageTitle
              title={props.title}
              count={props.count}
              lede={props.lede}
              action={props.action}
            />
            {props.children}
          </WorkspacePageContainer>
        </div>
      </div>
    </SidebarInset>
  );
}

/** Chats as a page lists them: each with its project and how it stands, in the order given. */
function ChatList(props: {
  readonly chats: ReadonlyArray<EnvironmentThreadShell>;
  readonly projectOf: ReadonlyMap<string, string>;
  readonly empty: string;
}) {
  const openChat = useOpenChat();
  useNowMinute();
  if (props.chats.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{props.empty}</p>;
  }
  return (
    <ul className="flex min-w-0 flex-col border-t border-border">
      {props.chats.map((chat) => {
        const state = chatStanding(chat);
        const project = props.projectOf.get(chat.id);
        return (
          <li key={chat.id} className="border-b border-border">
            <button
              type="button"
              onClick={() => openChat(chat)}
              className="flex w-full min-w-0 items-center gap-3 px-3 py-1 text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-foreground">{chatLabel(chat.title)}</span>
                {project === undefined ? null : (
                  <span className="truncate text-xs text-muted-foreground">{project}</span>
                )}
              </span>
              <span className={cn("shrink-0 text-xs tabular-nums", state.tone)}>{state.text}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ChatsPageContent(props: {
  readonly environmentId: EnvironmentId;
  readonly search: ChatsSearch;
}) {
  const navigate = useNavigate();
  const everyChat = useAllChats(props.environmentId);
  const [query, setQuery] = useState("");
  const filter = props.search.filter;
  const waiting = waitingChats(everyChat.chats);
  const all = waitingChatsFirst(everyChat.chats);
  const listed = filter === "needs-you" ? waiting : all;
  const shown = findChats(listed, everyChat.projectOf, query);
  return (
    <ChatPage
      title="Chats"
      count={listed.length}
      search={
        <Input
          type="search"
          size="sm"
          placeholder="Search chats"
          aria-label="Search chats"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      }
    >
      <ToggleGroup
        aria-label="Show"
        value={[filter ?? "all"]}
        onValueChange={(next) => {
          const value = next[0];
          if (value === "all" || value === "needs-you") {
            void navigate({
              to: "/chats",
              search: { filter: value === "all" ? undefined : value },
            });
          }
        }}
      >
        <Toggle value="all">All</Toggle>
        <Toggle value="needs-you">Needs you</Toggle>
      </ToggleGroup>
      <ChatList
        chats={shown}
        projectOf={everyChat.projectOf}
        empty={
          filter === "needs-you" && waiting.length === 0
            ? "Nothing is waiting on you. When a chat asks a question or needs an approval, it shows here."
            : everyChat.chats.length === 0
              ? "No chats yet. A project's first chat starts with it."
              : "No chat matches that."
        }
      />
    </ChatPage>
  );
}

/**
 * Studio's Chats page (the rail's Chats): every chat in every project, those waiting on you first
 * and otherwise the newest first, each with its project's name and how it stands, and a box to find
 * one by its name or its project's. The Needs you filter, kept in the URL, keeps the chats waiting
 * on your answer or approval.
 */
export function ChatsPage(props: { readonly search: ChatsSearch }) {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : (
    <ChatsPageContent environmentId={environmentId} search={props.search} />
  );
}
