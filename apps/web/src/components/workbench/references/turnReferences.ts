import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import { isAbsolutePath, workspaceRelativeFilePath } from "@t3tools/shared/path";
import { classifyToolActivity, collectToolFilePaths } from "@t3tools/shared/toolActivity";
import * as Predicate from "effect/Predicate";

import { workEntryIndicatesToolSuccess, type TimelineEntry } from "~/session-logic";
import { partLabel } from "../partNames";
import { isProjectWork } from "../projectFiles";
import { normalPath, sameNormalPath } from "../sameFile";
import { splitSources, type SourceTarget } from "./answerSources";

/**
 * The References under an answer: what it cites (`splitSources`), each source marked by whether
 * the agent opened it in this chat, from the tool calls the chat shows that completed. An answer
 * that cites nothing lists what its turn opened instead.
 */

/** What the agent opened in the chat: a file, with the lines it read when it read some, or a page. */
export type Opened = {
  target: Exclude<SourceTarget, { kind: "own" }>;
  /** The run it was opened in, and when. */
  runId: string | null;
  at: string;
  /** A page's title, when a search listed the page. */
  title?: string;
};

/** One row of the list. A source the agent cited keeps its target as the agent wrote it. */
export type AnswerReference = {
  readonly n: number;
  readonly target: SourceTarget;
  readonly opened: "this turn" | "earlier in this chat" | "not opened" | "own knowledge";
  /** A web page's title, when a search listed it. */
  readonly title?: string;
};

type OpenedTarget = Opened["target"];

const fileTarget = (path: string, lines: [number, number] | null): OpenedTarget => ({
  kind: "file",
  path,
  lines,
  heading: null,
});

/** An address as addresses are compared: parsed, so the host's case goes, and without its fragment. */
function addressKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    const hash = url.indexOf("#");
    return hash < 0 ? url : url.slice(0, hash);
  }
}

/**
 * What a target is compared by, worked out once: a file by its path as `sameFile` reads it (the
 * agent cites paths from its folder, and Claude's Read gives them in full), a page by its address
 * without the fragment.
 */
const keyOf = (target: OpenedTarget) =>
  target.kind === "file" ? normalPath(target.path) : addressKey(target.url);

/** The name a file's path ends in: two paths `sameFile` matches end in the same one. */
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Where an opening is looked up among those of its kind (`ChatScan.bySource`). */
const bucketOf = (target: OpenedTarget, key: string) =>
  target.kind === "file" ? `file:${nameOf(key)}` : `page:${key}`;

/** What makes a command more than programs and their words, when it is not in quotes. */
const SHELL_SYNTAX = /[&;<>()$`*?[]/;
const SHELL_WRAPPER = /(?:^|\/)(?:bash|sh|zsh)$/;

/**
 * A command's words, quotes taken off, in the programs a pipe joins (one may be empty, which no
 * read accepts); null for a command that is more than that: a list, a redirect, an expansion, a
 * glob, a second line or an unfinished quote.
 */
function shellPipeline(command: string): string[][] | null {
  let program: string[] = [];
  const pipeline = [program];
  let word = "";
  let started = false;
  let quote: string | null = null;
  const endWord = () => {
    if (started) program.push(word);
    word = "";
    started = false;
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command.charAt(index);
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
    } else if (quote === '"') {
      const next = command.charAt(index + 1);
      if (char === '"') quote = null;
      else if (char === "$" || char === "`") return null;
      else if (char === "\\" && next !== "" && '"\\$`'.includes(next)) {
        word += next;
        index += 1;
      } else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === "\\") {
      if (index + 1 >= command.length) return null;
      index += 1;
      word += command.charAt(index);
      started = true;
    } else if (char === "\n" || char === "\r") {
      return null;
    } else if (char === "|") {
      endWord();
      program = [];
      pipeline.push(program);
    } else if (/\s/.test(char)) {
      endWord();
    } else if (SHELL_SYNTAX.test(char)) {
      return null;
    } else {
      word += char;
      started = true;
    }
  }
  if (quote !== null) return null;
  endWord();
  return pipeline;
}

/** The command's programs, one shell layer unwrapped: `/bin/zsh -lc "cat a.md"` is `cat a.md`. */
function commandPipeline(command: string): string[][] | null {
  const pipeline = shellPipeline(command.trim());
  const [only, ...more] = pipeline ?? [];
  if (only === undefined || more.length > 0 || only.length !== 3) return pipeline;
  const [shell = "", flag, script = ""] = only;
  return SHELL_WRAPPER.test(shell) && (flag === "-c" || flag === "-lc")
    ? shellPipeline(script.trim())
    : pipeline;
}

/** The programs that print a file, each with the options that take the next word as their value. */
const READERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["cat", new Set<string>()],
  ["nl", new Set<string>()],
  ["head", new Set(["-n", "-c"])],
  ["tail", new Set(["-n", "-c"])],
]);
const SED_RANGE = /^(\d+)(?:,(\d+))?p$/;
const HEAD_COUNT = /^-n?(\d+)$/;

type FileRead = { path: string; lines: [number, number] | null };

/** The lines `sed -n` prints for `A,Bp` or `Ap`. */
function sedLines(script: string): [number, number] | null {
  const range = SED_RANGE.exec(script);
  if (range === null) return null;
  const from = Number(range[1]);
  const to = Number(range[2] ?? range[1]);
  return from >= 1 && from <= to ? [from, to] : null;
}

/** The first `count` lines, when it names some. */
const firstLines = (count: string | undefined): [number, number] | null =>
  count !== undefined && /^\d+$/.test(count) && Number(count) >= 1 ? [1, Number(count)] : null;

/** The lines `head` prints, from `-n N`, `-nN` or `-N`; all of them without. */
function headLines(args: ReadonlyArray<string>): [number, number] | null {
  for (const [index, arg] of args.entries()) {
    if (arg === "-n") return firstLines(args[index + 1]);
    const attached = HEAD_COUNT.exec(arg)?.[1];
    if (attached !== undefined) return firstLines(attached);
  }
  return null;
}

/** The one file a reader prints: its only word that is not a flag or a flag's value. */
function operand(program: string, args: ReadonlyArray<string>): string | null {
  const valued = READERS.get(program);
  if (valued === undefined) return null;
  const files: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (valued.has(arg)) index += 1;
    else if (!arg.startsWith("-") || arg === "-") files.push(arg);
  }
  const [path] = files;
  return files.length === 1 && path !== undefined && path !== "-" ? path : null;
}

/** `sed -n 'A,Bp' FILE`. */
function readSed(args: ReadonlyArray<string>): FileRead | null {
  const [flag, script = "", path = ""] = args;
  const lines = sedLines(script);
  const named = path !== "" && !path.startsWith("-");
  return flag === "-n" && args.length === 3 && lines !== null && named ? { path, lines } : null;
}

/**
 * `cat FILE | sed -n 'A,Bp'` and `nl FLAGS FILE | sed -n 'A,Bp'`: how Codex quotes lines of a file
 * with their numbers. It is the one pipe that reads.
 */
function readPiped(reader: ReadonlyArray<string>, printer: ReadonlyArray<string>): FileRead | null {
  const [program = "", ...args] = reader;
  const [sed, flag, script = ""] = printer;
  const path = program === "cat" || program === "nl" ? operand(program, args) : null;
  const lines = sed === "sed" && flag === "-n" && printer.length === 3 ? sedLines(script) : null;
  return path === null || lines === null ? null : { path, lines };
}

/**
 * A command that reads one file and does nothing else: `cat`, `nl`, `head` or `tail` with any
 * flags, `sed -n` printing a range of lines, or `cat`/`nl` piped to that `sed`. The lines are
 * known for `head -n N` and `sed`.
 */
function readCommand(command: string): FileRead | null {
  const [first = [], second, ...rest] = commandPipeline(command) ?? [];
  if (second !== undefined) return rest.length === 0 ? readPiped(first, second) : null;
  const [program = "", ...args] = first;
  if (program === "sed") return readSed(args);
  const path = operand(program, args);
  return path === null ? null : { path, lines: program === "head" ? headLines(args) : null };
}

/** The text-to-cad plugin's viewer tools that name a model, after any server or plugin prefix. */
const CAD_VIEWER_OPENER = /cad_(?:open|show)$/;
const HTTP_ADDRESS = /^https?:\/\//i;

const isLineNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

/** Claude's Read names its file `file_path`, and a part of it by `offset` and `limit` together. */
function claudeReadLines(input: unknown): [number, number] | null {
  if (!Predicate.isObject(input) || typeof input.file_path !== "string") return null;
  const { offset, limit } = input;
  return isLineNumber(offset) && isLineNumber(limit) ? [offset, offset + limit - 1] : null;
}

/**
 * The file a tool call read, as the work log counts a read (`classifyToolActivity`, the path
 * `collectToolFilePaths` finds, an image it viewed), or the model the CAD viewer was given.
 */
function toolOpening(
  item: Extract<OrchestrationV2TurnItem, { type: "dynamic_tool" }>,
  viewedImagePath: string | undefined,
): OpenedTarget | null {
  const [path] = collectToolFilePaths({ input: item.input });
  const reads =
    viewedImagePath !== undefined ||
    classifyToolActivity({
      itemType: "dynamic_tool_call",
      data: { toolName: item.toolName ?? undefined, input: item.input },
    }) === "read";
  if (reads) {
    const file = viewedImagePath ?? path;
    return file === undefined ? null : fileTarget(file, claudeReadLines(item.input));
  }
  const opensModel = item.toolName !== null && CAD_VIEWER_OPENER.test(item.toolName);
  return opensModel && path !== undefined ? fileTarget(path, null) : null;
}

/**
 * The pages a web search or fetch opened: its patterns that are addresses, which is the page
 * Claude's WebFetch fetched. Its results are what a search listed, not what was opened, and
 * Codex's other patterns are search words.
 */
function fetchedPages(item: Extract<OrchestrationV2TurnItem, { type: "web_search" }>) {
  return (item.patterns ?? [])
    .map((pattern) => pattern.trim())
    .filter((pattern) => HTTP_ADDRESS.test(pattern))
    .map((url): OpenedTarget => ({ kind: "url", url }));
}

/**
 * What a turn item opened. Whether the call completed is for the caller to ask. A search, of files
 * or of the web, lists what matches (for some agents only the path it searched): it opens nothing.
 */
function itemOpenings(item: OrchestrationV2TurnItem, viewedImagePath: string | undefined) {
  switch (item.type) {
    case "dynamic_tool": {
      const opened = toolOpening(item, viewedImagePath);
      return opened === null ? [] : [opened];
    }
    case "web_search":
      return fetchedPages(item);
    case "command_execution": {
      const read = readCommand(item.input);
      return read === null ? [] : [fileTarget(read.path, read.lines)];
    }
    default:
      return [];
  }
}

interface ChatOpening {
  readonly target: OpenedTarget;
  readonly runId: string | null;
  readonly at: string;
  /** Where its entry sits in the chat. */
  readonly position: number;
  /** What it is compared by (`keyOf`). */
  readonly key: string;
}

interface ChatScan {
  readonly openings: ReadonlyArray<ChatOpening>;
  /**
   * The openings a source may be, in the order of the chat (`bucketOf`): files by the name their
   * path ends in, pages by their address, so a source is compared with a few, not every opening.
   */
  readonly bySource: ReadonlyMap<string, ReadonlyArray<ChatOpening>>;
  /** Each run's openings, in the order of the chat. */
  readonly byRun: ReadonlyMap<string, ReadonlyArray<ChatOpening>>;
  /** Where each run's first entry sits in the chat. */
  readonly firstEntryOfRun: ReadonlyMap<string, number>;
  /** The titles searches gave pages, by address. */
  readonly titles: ReadonlyMap<string, string>;
}

/** `value` added to the list `map` keeps under `key`. */
function listUnder<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/**
 * The run an entry belongs to. T3's own `timelineEntryRunId` is private to the timeline's logic,
 * which imports this module, and it leaves a user's message out where this needs it: a prompt
 * starts its run.
 */
function entryRunId(entry: TimelineEntry): string | null {
  switch (entry.kind) {
    case "message":
      return entry.message.runId;
    case "work":
      return entry.entry.runId ?? null;
    case "html-render":
    case "mcp-app":
      return entry.runId;
    case "event":
      return entry.projectedItem.item.runId;
    case "proposed-plan":
      return entry.proposedPlan.runId;
  }
}

/** Each answer of a derive pass asks the same chat, so it is read once per array of entries. */
const scans = new WeakMap<ReadonlyArray<TimelineEntry>, ChatScan>();

function scanChat(entries: ReadonlyArray<TimelineEntry>): ChatScan {
  const known = scans.get(entries);
  if (known !== undefined) return known;
  const openings: ChatOpening[] = [];
  const bySource = new Map<string, ChatOpening[]>();
  const byRun = new Map<string, ChatOpening[]>();
  const firstEntryOfRun = new Map<string, number>();
  const titles = new Map<string, string>();
  for (const [position, entry] of entries.entries()) {
    const runId = entryRunId(entry);
    if (runId !== null && !firstEntryOfRun.has(runId)) firstEntryOfRun.set(runId, position);
    if (entry.kind !== "work") continue;
    const item = entry.entry.structuredPayload;
    if (item === undefined) continue;
    if (item.type === "web_search") {
      for (const { url, title } of item.results ?? []) {
        if (url !== undefined && title?.trim() && !titles.has(addressKey(url))) {
          titles.set(addressKey(url), title.trim());
        }
      }
    }
    const targets = itemOpenings(item, entry.entry.viewedImagePath);
    // Asked last: most calls open nothing, and the work log's test reads their output.
    if (targets.length === 0 || !workEntryIndicatesToolSuccess(entry.entry)) continue;
    for (const target of targets) {
      const key = keyOf(target);
      const opening = { target, runId, at: entry.entry.createdAt, position, key };
      openings.push(opening);
      listUnder(bySource, bucketOf(target, key), opening);
      if (runId !== null) listUnder(byRun, runId, opening);
    }
  }
  const scan = { openings, bySource, byRun, firstEntryOfRun, titles };
  scans.set(entries, scan);
  return scan;
}

const titleOf = (scan: ChatScan, target: SourceTarget) =>
  target.kind === "url" ? scan.titles.get(addressKey(target.url)) : undefined;

const openedLists = new WeakMap<ReadonlyArray<TimelineEntry>, ReadonlyArray<Opened>>();

/**
 * Completed tool calls only, which a collapsed turn still holds. A search lists files or pages and
 * opens none of them. The array is shared by every caller: read it, do not change it.
 */
export function openedInChat(entries: ReadonlyArray<TimelineEntry>): ReadonlyArray<Opened> {
  const known = openedLists.get(entries);
  if (known !== undefined) return known;
  const scan = scanChat(entries);
  const opened = scan.openings.map(({ target, runId, at }) => {
    const title = titleOf(scan, target);
    return { target, runId, at, ...(title === undefined ? {} : { title }) };
  });
  openedLists.set(entries, opened);
  return opened;
}

/** The openings that are the source `target`, files by `sameFile`'s rule, pages by address. */
function openingsOf(scan: ChatScan, target: OpenedTarget): ReadonlyArray<ChatOpening> {
  const key = keyOf(target);
  const candidates = scan.bySource.get(bucketOf(target, key)) ?? [];
  return target.kind === "file"
    ? candidates.filter((opening) => sameNormalPath(opening.key, key))
    : candidates;
}

/**
 * A cited source is opened this turn when the run opened it, else earlier in this chat when an
 * entry before the run's first one did. What later runs opened does not count for it. A page the
 * agent did open takes the title a search gave it.
 */
function markSource(
  scan: ChatScan,
  runId: string,
  before: number,
  source: { n: number; target: SourceTarget },
): AnswerReference {
  const { n, target } = source;
  if (target.kind === "own") return { n, target, opened: "own knowledge" };
  let opened: AnswerReference["opened"] = "not opened";
  for (const opening of openingsOf(scan, target)) {
    if (opening.runId === runId) {
      opened = "this turn";
      break;
    }
    if (opening.position < before) opened = "earlier in this chat";
  }
  const title = opened === "not opened" ? undefined : titleOf(scan, target);
  return { n, target, opened, ...(title === undefined ? {} : { title }) };
}

/**
 * Whether a file the agent opened is the project's work: in the thread's folder (a relative path is
 * there already, an absolute one must lie inside it) and not tooling in it. The agent's own skill
 * and tool docs live outside the folder, or in its hidden folders.
 */
function isWorkInFolder(path: string, root: string | null): boolean {
  const relative =
    isAbsolutePath(path) || path.startsWith("~/") ? workspaceRelativeFilePath(path, root) : path;
  return relative !== null && isProjectWork(relative);
}

/**
 * An answer that cites nothing: what its turn opened that is the project's work, once each, in the
 * order it was opened.
 */
function thisTurnsOpenings(scan: ChatScan, runId: string, root: string | null): AnswerReference[] {
  const references: AnswerReference[] = [];
  // What is listed already, looked up as the openings are (`bucketOf`): a file once, however written.
  const kept = new Map<string, string[]>();
  for (const opening of scan.byRun.get(runId) ?? []) {
    const { target, key } = opening;
    if (target.kind === "file" && !isWorkInFolder(target.path, root)) continue;
    const bucket = bucketOf(target, key);
    if (kept.get(bucket)?.some((other) => sameNormalPath(other, key))) continue;
    listUnder(kept, bucket, key);
    const title = titleOf(scan, target);
    references.push({
      n: references.length + 1,
      target,
      opened: "this turn",
      ...(title === undefined ? {} : { title }),
    });
  }
  return references;
}

interface KeptList {
  readonly answer: string;
  readonly runId: string;
  readonly root: string | null;
  readonly references: ReadonlyArray<AnswerReference>;
}

/** Each settled answer's list by its message's id, for the chat as read (`scanChat`). */
const keptLists = new WeakMap<ChatScan, Map<string, KeptList>>();

/**
 * An answer with no Sources block lists what its turn opened in `root`; one with no run gets none.
 * Given `id`, the list is cached per chat scan, so the array is shared: read it, do not change it.
 */
export function turnReferences(input: {
  id?: string;
  answer: string;
  runId: string | null;
  entries: ReadonlyArray<TimelineEntry>;
  root?: string | null;
}): ReadonlyArray<AnswerReference> {
  const { id, answer, runId } = input;
  if (runId === null) return [];
  const root = input.root ?? null;
  const scan = scanChat(input.entries);
  const lists = keptLists.get(scan) ?? new Map<string, KeptList>();
  const kept = id === undefined ? undefined : lists.get(id);
  if (kept?.answer === answer && kept.runId === runId && kept.root === root) return kept.references;
  const { sources } = splitSources(answer);
  // A run the chat does not hold comes after everything it does.
  const before = scan.firstEntryOfRun.get(runId) ?? input.entries.length;
  const references =
    sources.length === 0
      ? thisTurnsOpenings(scan, runId, root)
      : sources.map((source) => markSource(scan, runId, before, source));
  if (id !== undefined) {
    lists.set(id, { answer, runId, root, references });
    keptLists.set(scan, lists);
  }
  return references;
}

const linesPhrase = ([from, to]: [number, number]) =>
  from === to ? `line ${from}` : `lines ${from}–${to}`;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

/**
 * A row's words: what it is called and where in it. A file is called what the chat's file chips
 * call it (`partLabel`) and sits at its lines or its heading; a page is called by its title, else
 * its host, and a titled page sits at its host.
 */
export function referenceLabel(reference: AnswerReference): { name: string; where: string | null } {
  const { target, title } = reference;
  switch (target.kind) {
    case "file":
      return {
        name: partLabel(target.path),
        where: target.lines === null ? target.heading : linesPhrase(target.lines),
      };
    case "url": {
      const host = hostOf(target.url);
      return title === undefined ? { name: host, where: null } : { name: title, where: host };
    }
    case "own":
      return { name: target.text === "" ? "Own knowledge" : target.text, where: null };
  }
}

/**
 * A row's press as a screen reader names it: what it opens, where in it, and when the agent
 * opened it, so "not opened" is heard as it is seen.
 */
export function referenceOpenLabel(reference: AnswerReference): string {
  const { name, where } = referenceLabel(reference);
  return `Open ${where === null ? name : `${name}, ${where}`}, ${reference.opened}`;
}
