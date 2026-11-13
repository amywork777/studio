import { studioFolderKey } from "@t3tools/shared/studioProjects";

import { BRIEF_REFERENCES } from "./briefFolder";
import { humanName } from "./partNames";

/**
 * The agent replaces the starting name in its first reply (`studioProjectContext`), and the first
 * message is held until the new workspace has a composer (`usePendingStart.ts`).
 */

const NAME_LENGTH = 32;
/** How a description asks for something before saying what: "I wanna make a", "Can you design". */
const LEADING_REQUEST = new RegExp(
  `^(?:(?:${[
    "please",
    "so",
    "okay",
    "ok",
    "hey",
    "i",
    "we",
    "i'd",
    "we'd",
    "i'm",
    "we're",
    "want to",
    "want",
    "wanna",
    "need to",
    "need",
    "would like to",
    "would like",
    "like to",
    "let's",
    "lets",
    "help me",
    "can you",
    "could you",
    "can we",
    "could we",
    "can i",
    "try to",
    "trying to",
    "going to",
    "gonna",
    "to",
    "make me",
    "make",
    "design",
    "create",
    "build",
    "model",
    "print",
  ].join("|")})\\s+)*(?:(?:a|an|the|some|my|our)\\s+)?`,
  "i",
);
/** Words that start a new clause: the name is what comes before one, once that is two words. */
const CLAUSE = new Set([
  "that",
  "which",
  "who",
  "maybe",
  "so",
  "because",
  "but",
  "if",
  "i",
  "we",
  "please",
  "is",
  "are",
]);
const DANGLING = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "on",
  "for",
  "to",
  "with",
  "that",
  "my",
  "in",
]);

/**
 * A name from the description's first words: its first sentence without the asking, up to where a
 * new clause starts, cut on a word near 32 characters.
 */
export function provisionalProjectName(description: string): string {
  const sentence =
    description
      .trim()
      .replace(/\s+/g, " ")
      .split(/[.!?;]|,\s/)[0] ?? "";
  const words = sentence.replace(LEADING_REQUEST, "").split(" ").filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if (kept.length >= 2 && CLAUSE.has(word.toLowerCase())) break;
    if ([...kept, word].join(" ").length > NAME_LENGTH && kept.length > 0) break;
    kept.push(word);
  }
  while (kept.length > 0 && DANGLING.has(kept[kept.length - 1]!.toLowerCase())) kept.pop();
  const name = kept.join(" ");
  return name === "" ? "New project" : name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * A file or folder attached to Home's box. In the desktop app it has a path on this computer, and
 * Start copies it into the project's References. Without one (the web app, or a file dragged from
 * another app), the browser's `file` goes with the first message instead, as a chat attaches it.
 */
export interface StartAttachment {
  readonly name: string;
  readonly path: string | null;
  readonly file: File | null;
}

/** A file's or folder's name: the last part of its path. */
export const nameOfPath = (path: string): string =>
  path.split(/[\\/]+/).findLast((part) => part !== "") ?? path;

/** Each copy in the project's References by its path in the project's folder, as copied. */
export function referencePaths(copied: ReadonlyArray<string>): string[] {
  return copied.map((path) => `${BRIEF_REFERENCES}/${nameOfPath(path)}`);
}

/**
 * A project started from files alone is named after the first, as Import names one: "Spatula
 * PRD" from `Spatula PRD.pdf`, "Sumo robot" from a `sumo-robot` folder.
 */
export function nameFromAttachment(name: string): string {
  const stem = name.trim().replace(/\.[A-Za-z][A-Za-z0-9]{0,7}$/, "");
  return stem === "" ? "New project" : humanName(stem);
}

/** How many of the copied files the first message names; the rest are counted. */
const LISTED = 12;

const SET_UP =
  "Read them all before anything else, then set the project up from them: its name, its units, material, process and quantity where they say, and the README with what it is, its requirements and the decisions they settle. Ask me only what they leave open.";

/**
 * Files that could not be copied (`attached`, the web app) go with the message.
 */
export function startMessage(input: {
  readonly description: string;
  readonly references: ReadonlyArray<string>;
  readonly attached: number;
  /** A new project; else a new chat in one of yours. */
  readonly newProject: boolean;
}): string {
  const said = input.description.trim();
  const { references, newProject } = input;
  if (references.length === 0) {
    if (said !== "" || input.attached === 0) return said;
    const files = input.attached === 1 ? "the attached file" : "the attached files";
    return newProject ? `Set up this project from ${files}.` : `Read ${files}.`;
  }
  const listed = references.slice(0, LISTED).map((path) => `- \`${path}\``);
  const more = references.length - listed.length;
  const list = [...listed, ...(more > 0 ? [`- and ${more} more in \`${BRIEF_REFERENCES}/\``] : [])];
  if (newProject) {
    return [
      ...(said === ""
        ? ["Set up this project from my files in its References:"]
        : [said, "", "My files for it are in the project's References:"]),
      ...list,
      "",
      SET_UP,
    ].join("\n");
  }
  return [
    ...(said === "" ? [] : [said, ""]),
    "I added these files to the project's References:",
    ...list,
    "",
    said === ""
      ? "Read them, and add what they settle to the README."
      : "Read them before anything else.",
  ].join("\n");
}

/** What the new project's first chat sends: the description or the new work's job, and any files. */
export interface PendingStart {
  readonly prompt: string;
  readonly files: ReadonlyArray<File>;
}

/** By the new project's folder: the workspace that opens there takes it. Session only. */
const pending = new Map<string, PendingStart>();

export function setPendingStart(folder: string, start: PendingStart): void {
  pending.set(studioFolderKey(folder), start);
}

/** The folder's first message, once: the second call gets null, so nothing is sent twice. */
export function takePendingStart(folder: string): PendingStart | null {
  const key = studioFolderKey(folder);
  const start = pending.get(key) ?? null;
  pending.delete(key);
  return start;
}

/**
 * By a new project's folder: the name Home's Start gave the project, the chat that takes it (the
 * first one sent there) and the name last given that chat. Session only, as the pending start is.
 */
const firstChats = new Map<
  string,
  { readonly startedAs: string; threadId: string | null; given: string | null }
>();

/** The project Home just started names its first chat (`firstChatName`). */
export function nameFirstChatAfterProject(folder: string, name: string): void {
  firstChats.set(studioFolderKey(folder), { startedAs: name.trim(), threadId: null, given: null });
}

/**
 * What a new project's first chat is renamed to now, so the sidebar, the top bar and the switcher
 * say one name: the project's name once the chat is sent (T3's title from the message gives way),
 * and once more when the agent names the project in its first turn. After that, and for any other
 * chat or project, null: the chat keeps whatever it is called.
 */
export function firstChatName(
  folder: string,
  threadId: string,
  projectName: string,
  chatTitle: string,
): string | null {
  const key = studioFolderKey(folder);
  const chat = firstChats.get(key);
  const name = projectName.trim();
  if (chat === undefined || name === "" || (chat.threadId ?? threadId) !== threadId) return null;
  chat.threadId = threadId;
  if (name !== chat.startedAs) firstChats.delete(key);
  if (name === chat.given) return null;
  chat.given = name;
  return chatTitle.trim() === name ? null : name;
}

/**
 * Whether Home's Start box can start: words or files make a start (files alone set a project up
 * from them), and not while another start is under way.
 */
export function canStart(
  description: string,
  attachments: ReadonlyArray<StartAttachment>,
  busy: boolean,
): boolean {
  return (description.trim() !== "" || attachments.length > 0) && !busy;
}
