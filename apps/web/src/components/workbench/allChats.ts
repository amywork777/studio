import type { EnvironmentId } from "@t3tools/contracts";

import { useThreadShells } from "~/state/entities";
import { NO_PROJECT, noProjectChats, useNoProjectFolder } from "./freeformChat";
import { historyOutcome } from "./projectHistory";
import { useProjectList } from "./useProjectList";
import { projectChats, workspaceTitle } from "./workspaceTitle";

interface ChatLike {
  readonly id: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

/**
 * Every chat in every project, newest first, as a chat app lists its recent chats, with the name
 * of the project each is in. A chat in folders two projects share is listed once, under the first.
 */
export function allChats<T extends ChatLike>(
  projects: ReadonlyArray<{ readonly name: string; readonly threads: ReadonlyArray<T> }>,
): { readonly chats: T[]; readonly projectOf: ReadonlyMap<string, string> } {
  const byId = new Map<string, T>();
  const projectOf = new Map<string, string>();
  for (const project of projects) {
    for (const thread of project.threads) {
      if (byId.has(thread.id)) continue;
      byId.set(thread.id, thread);
      projectOf.set(thread.id, project.name);
    }
  }
  return { chats: projectChats([...byId.values()]), projectOf };
}

/** The chats whose name or project's name holds every word typed; all of them with nothing typed. */
export function findChats<T extends { readonly id: string; readonly title: string }>(
  chats: ReadonlyArray<T>,
  projectOf: ReadonlyMap<string, string>,
  query: string,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...chats];
  return chats.filter((chat) => {
    const text = `${chat.title} ${projectOf.get(chat.id) ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Of these chats, the ones waiting on the person: Chats' Needs you, and Home's count in the sidebar. */
export function waitingChats<T extends Parameters<typeof historyOutcome>[0]>(
  chats: ReadonlyArray<T>,
): T[] {
  return chats.filter((chat) => historyOutcome(chat) === "needs-you");
}

/** The chats waiting on the person first, each group otherwise in its own order: Chats' All. */
export function waitingChatsFirst<T extends Parameters<typeof historyOutcome>[0]>(
  chats: ReadonlyArray<T>,
): T[] {
  const isWaiting = (chat: T) => Number(historyOutcome(chat) === "needs-you");
  return chats.toSorted((a, b) => isWaiting(b) - isWaiting(a));
}

/**
 * Every chat the sidebar can reach: each Studio project's, the older chats in no project, from Home's
 * old Ask, which no longer exists (`freeformChat.ts`), and those in folders in no project.
 */
export function useAllChats(environmentId: EnvironmentId) {
  const { cards, loose } = useProjectList(environmentId);
  const free = useNoProjectFolder(environmentId).project;
  const threads = useThreadShells();
  const unfiled = noProjectChats(threads, environmentId, free?.id ?? null).filter(
    (thread) => thread.archivedAt === null,
  );
  return allChats([
    ...cards.map((card) => ({
      name: workspaceTitle(card.project.name, card.folder?.workspaceRoot ?? null),
      threads: card.threads,
    })),
    ...(unfiled.length > 0 ? [{ name: NO_PROJECT, threads: unfiled }] : []),
    ...loose.map(({ folder, threads: own }) => ({
      name: workspaceTitle(null, folder.workspaceRoot),
      threads: own,
    })),
  ]);
}
