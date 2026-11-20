import type { ScopedThreadRef } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

/** A file opened beside a chat, as Home's Recent remembers it on this device. */
export interface RecentFile {
  readonly environmentId: string;
  readonly threadId: string;
  /** As it was opened: in the chat's folder, or a full path; a cadgen 0.8 model's document id. */
  readonly path: string;
  readonly at: string;
  /** What it is called, where its path does not say: a model's name. */
  readonly title?: string;
}

const KEY = "studio:recent-files";
/** Files remembered; the oldest are forgotten past this. */
const LIMIT = 30;

const sameFile = (a: RecentFile, b: RecentFile) =>
  a.environmentId === b.environmentId && a.threadId === b.threadId && a.path === b.path;

/** `files` with `file` opened now: newest first, each file once, the oldest forgotten past `limit`. */
function withRecentFile(
  files: ReadonlyArray<RecentFile>,
  file: RecentFile,
  limit = LIMIT,
): RecentFile[] {
  return [file, ...files.filter((entry) => !sameFile(entry, file))].slice(0, limit);
}

function readRecentFiles(): RecentFile[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is RecentFile =>
            typeof entry === "object" &&
            entry !== null &&
            ["environmentId", "threadId", "path", "at"].every(
              (field) => typeof (entry as Record<string, unknown>)[field] === "string",
            ),
        )
      : [];
  } catch {
    return [];
  }
}

let current: ReadonlyArray<RecentFile> | null = null;
const listeners = new Set<() => void>();
const snapshot = () => (current ??= readRecentFiles());

/** Remembers a file opened beside a chat (`openInPanel`), for Home's Recent. */
export function rememberRecentFile(threadRef: ScopedThreadRef, path: string, title?: string): void {
  current = withRecentFile(readRecentFiles(), {
    environmentId: threadRef.environmentId,
    threadId: threadRef.threadId,
    path,
    at: new Date().toISOString(),
    ...(title === undefined ? {} : { title }),
  });
  for (const listener of listeners) listener();
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage is full or off: Home's Recent lists chats alone.
  }
}

/** The files opened lately, newest first, kept current as files are opened. */
export function useRecentFiles(): ReadonlyArray<RecentFile> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    snapshot,
  );
}
