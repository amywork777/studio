import { useState } from "react";

/**
 * Decisions are written `- <what was decided> (<YYYY-MM-DD>, asked)` or `by hand`
 * (`studioProjectContext`). Date-first lines and a `Decision: ...` line outside the section read too,
 * and every other section is kept as written.
 */

export interface ReadmeDecision {
  readonly text: string;
  readonly when: string | null;
  readonly how: "asked" | "by hand" | null;
}

/** A piece of a section, in the order it was written: a line of prose, a `###` heading, or a point at its depth. */
export type ReadmeBlock =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "subheading"; readonly text: string }
  | { readonly kind: "item"; readonly text: string; readonly depth: number };

/** A section of the README beyond What it is and Decisions: open questions, notes, risks. */
export interface ReadmeSection {
  readonly heading: string;
  readonly blocks: ReadonlyArray<ReadmeBlock>;
}

export interface ReadmeSections {
  readonly title: string | null;
  readonly whatItIs: string | null;
  readonly decisions: ReadonlyArray<ReadmeDecision>;
  readonly more: ReadonlyArray<ReadmeSection>;
}

/**
 * What a new project's README starts with (`ManagedProjectFolders.namedProjectReadme` on the
 * server): the project's icon and a line saying where it was made, not what it is.
 */
const STARTING_LINE = /^\s*(<[^>]+>|Created in \[[^\]]+\]\([^)]*\)\.?)\s*$/;
const LIST_ITEM = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/;
const SUBHEADING = /^#{3,6}\s+(.+?)\s*#*\s*$/;
/** Where one sentence ends and the next starts, past the abbreviations that end in a stop. */
const SENTENCE_END = /(?<!\b(?:e\.g|i\.e|vs|approx|no|fig)\.)(?<=[.!?])\s+(?=[A-Z0-9["(])/gi;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** `2026-10-19 — what was decided. Source: user brief.` */
const DATE_FIRST = /^(\d{4}-\d{2}-\d{2})\s*(?:[—–:-]\s*)?(.+)$/;
const SOURCE = /\s*Source:\s*([^.]*)\.?\s*$/i;
/** `Existing designs — researched 2026-11-05`, `Fit check - 2026-10-23`, `Fit check (2026-10-23)`. */
const DATED_HEADING =
  /^(.+?)\s*(?:[—–:-]\s+|\(\s*)(?:([a-z][a-z ]*?)\s+)?(\d{4}-\d{2}-\d{2})\s*\)?$/i;

const withoutStop = (text: string) => text.trim().replace(/\.$/, "");

const LOOSE_DECISION = /^\s*(?:[-*]\s+)?decision:\s*(.+?)\s*$/i;

function readDecision(item: string): ReadmeDecision {
  const plain = { text: item.trim(), when: null, how: null };
  const noted = /^(.*?)\s*\(([^()]*)\)\s*\.?\s*$/.exec(item);
  if (noted !== null) {
    const notes = (noted[2] ?? "").split(",").map((note) => note.trim().toLowerCase());
    const when = notes.find((note) => DATE.test(note)) ?? null;
    const how = notes.includes("by hand") ? "by hand" : notes.includes("asked") ? "asked" : null;
    if (when !== null || how !== null) return { text: (noted[1] ?? "").trim(), when, how };
  }
  const dated = DATE_FIRST.exec(item.trim());
  if (dated === null) return plain;
  const rest = dated[2] ?? "";
  const source = SOURCE.exec(rest);
  if (source === null) return { text: withoutStop(rest), when: dated[1] ?? null, how: null };
  return {
    text: withoutStop(rest.slice(0, source.index)),
    when: dated[1] ?? null,
    how: /hand/i.test(source[1] ?? "") ? "by hand" : "asked",
  };
}

/**
 * A section's lines as they read: each list item at its depth (by indentation), each `###` heading,
 * and prose as a line of its own, or as points where it runs to several sentences, so a long
 * paragraph reads as a list.
 */
function readSection(heading: string, lines: ReadonlyArray<string>): ReadmeSection {
  const blocks: ReadmeBlock[] = [];
  const indents: number[] = [];
  let paragraph: string[] = [];
  const close = () => {
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (text === "") return;
    indents.length = 0;
    const sentences = text.split(SENTENCE_END);
    if (sentences.length === 1) blocks.push({ kind: "paragraph", text });
    else
      blocks.push(
        ...sentences.map((sentence) => ({ kind: "item", text: sentence, depth: 0 }) as const),
      );
  };
  for (const line of lines) {
    const item = LIST_ITEM.exec(line)?.[1];
    const subheading = SUBHEADING.exec(line)?.[1];
    if (subheading !== undefined) {
      close();
      indents.length = 0;
      blocks.push({ kind: "subheading", text: subheading });
    } else if (item !== undefined) {
      close();
      const indent = line.length - line.trimStart().length;
      while ((indents.at(-1) ?? -1) >= indent) indents.pop();
      blocks.push({ kind: "item", text: item.trim(), depth: indents.length });
      indents.push(indent);
    } else if (line.trim() === "") close();
    else paragraph.push(line.trim());
  }
  close();
  return { heading, blocks };
}

/** A README heading as it reads: its title, and the date a dated one ends on, with its word if any. */
export function readmeHeading(heading: string): {
  readonly title: string;
  readonly word: string | null;
  readonly when: string | null;
} {
  const dated = DATED_HEADING.exec(heading.trim());
  if (dated === null) return { title: heading, word: null, when: null };
  return {
    title: dated[1] ?? heading,
    word: dated[2]?.toLowerCase() ?? null,
    when: dated[3] ?? null,
  };
}

/** A README's other sections as the Overview lists them: Open actions first, the rest in order. */
export function readmeRows(more: ReadonlyArray<ReadmeSection>): {
  readonly first: ReadonlyArray<ReadmeSection>;
  readonly rest: ReadonlyArray<ReadmeSection>;
} {
  const isFirst = (section: ReadmeSection) =>
    readmeHeading(section.heading).title.toLowerCase() === "open actions";
  return {
    first: more.filter((section) => isFirst(section)),
    rest: more.filter((section) => !isFirst(section)),
  };
}

/** A section's blocks with each run of points together, for one list each. */
export function readmeRuns(
  blocks: ReadonlyArray<ReadmeBlock>,
): ReadonlyArray<ReadmeBlock | ReadonlyArray<Extract<ReadmeBlock, { kind: "item" }>>> {
  const runs: Array<ReadmeBlock | Array<Extract<ReadmeBlock, { kind: "item" }>>> = [];
  for (const block of blocks) {
    const last = runs.at(-1);
    if (block.kind !== "item") runs.push(block);
    else if (Array.isArray(last)) last.push(block);
    else runs.push([block]);
  }
  return runs;
}

export function readmeSections(markdown: string | null): ReadmeSections {
  const empty: ReadmeSections = { title: null, whatItIs: null, decisions: [], more: [] };
  if (markdown === null || markdown.trim() === "") return empty;
  let title: string | null = null;
  const intro: string[] = [];
  const sections: Array<{ readonly heading: string; readonly lines: string[] }> = [];
  let current: string[] | null = null;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading?.[1] === "#" && title === null && current === null) {
      title = heading[2] ?? null;
      continue;
    }
    if (heading?.[1] === "##") {
      current = [];
      sections.push({ heading: (heading[2] ?? "").trim(), lines: current });
      continue;
    }
    (current ?? intro).push(line);
  }
  const named = (name: string) =>
    sections.find((section) => section.heading.toLowerCase() === name)?.lines;
  const text = (lines: ReadonlyArray<string> | undefined) =>
    lines === undefined ? null : lines.join("\n").trim() || null;
  const decisions = [
    ...(named("decisions") ?? []).flatMap((line) => {
      const item = LIST_ITEM.exec(line)?.[1];
      return item === undefined ? [] : [readDecision(item)];
    }),
    ...intro.flatMap((line) => {
      const item = LOOSE_DECISION.exec(line)?.[1];
      return item === undefined ? [] : [readDecision(item)];
    }),
  ];
  const more = sections
    .filter(({ heading }) => !["what it is", "decisions"].includes(heading.toLowerCase()))
    .map(({ heading, lines }) => readSection(heading, lines))
    .filter((section) => section.blocks.length > 0);
  const opening = intro.filter((line) => !STARTING_LINE.test(line) && !LOOSE_DECISION.test(line));
  return { title, whatItIs: text(named("what it is")) ?? text(opening), decisions, more };
}

export type ReadmeInline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly target: string }
  | { readonly kind: "strong"; readonly text: string };

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

/**
 * A line of README text in the pieces the Overview shows: plain text, links (a file of the
 * project, or a web page) and bold. Code marks drop away; the words stay.
 */
export function readmeInline(text: string): ReadonlyArray<ReadmeInline> {
  const pieces: ReadmeInline[] = [];
  const addText = (more: string) => {
    if (more === "") return;
    const previous = pieces.at(-1);
    if (previous?.kind === "text")
      pieces[pieces.length - 1] = { kind: "text", text: previous.text + more };
    else pieces.push({ kind: "text", text: more });
  };
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    addText(text.slice(last, at));
    const [whole, label, target, strong, code] = match;
    if (label !== undefined && target !== undefined)
      pieces.push({ kind: "link", text: label, target });
    else if (strong !== undefined) pieces.push({ kind: "strong", text: strong });
    else addText(code ?? "");
    last = at + whole.length;
  }
  addText(text.slice(last));
  return pieces;
}

/** Words with no marks in them (a link, bold, code): the ones the Overview lets you type into. */
export function isPlainReadmeText(text: string): boolean {
  return !/[[\]*`<>]/.test(text);
}

/**
 * The README with one piece's words changed, where the Overview shows them: the first place the
 * old words stand, matched however its lines were wrapped. Null when they are no longer there, or
 * when the new words are empty (a piece is changed here, not removed).
 */
export function replaceReadmeText(markdown: string, before: string, after: string): string | null {
  const words = after.trim();
  if (words === "" || before.trim() === "") return null;
  const escaped = before.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(escaped.replace(/\s+/g, "\\s+")).exec(markdown);
  if (match === null) return null;
  return markdown.slice(0, match.index) + words + markdown.slice(match.index + match[0].length);
}

/** The longest a first README takes to come in, and the most any one word waits on the last. */
const WRITE_IN_MS = 1800;
const WORD_MS = 45;

/** When each of a first README's words comes in: at a writing pace, a long one a little faster. */
export function writtenWordDelays(words: number): (word: number) => number {
  const step = Math.min(WORD_MS, WRITE_IN_MS / Math.max(words, 1));
  return (word) => Math.round(word * step);
}

/** What the Overview remembers of a new project's README: that it waited, and the words that ended it. */
export interface ReadmeWriteIn {
  readonly waited: boolean;
  readonly first: string | null;
}

/** `written`: the README's words once it says what the project is; null until then. */
export function nextReadmeWriteIn(
  before: ReadmeWriteIn,
  writing: boolean,
  written: string | null,
): ReadmeWriteIn {
  const waited = before.waited || (writing && written === null);
  return { waited, first: before.first ?? (waited ? written : null) };
}

/**
 * A new project's README as it comes to be. `waiting`: the first chat is on the turn that writes
 * it and it has no words yet. `writingIn`: the words that ended that wait, shown once as they
 * arrive; the agent's later changes, and the Overview opened again, read as they are.
 */
export function useReadmeWriteIn(input: {
  readonly writing: boolean;
  readonly written: string | null;
}): { readonly waiting: boolean; readonly writingIn: boolean } {
  const { writing, written } = input;
  const [memory, setMemory] = useState<ReadmeWriteIn>({ waited: false, first: null });
  const next = nextReadmeWriteIn(memory, writing, written);
  if (next.waited !== memory.waited || next.first !== memory.first) setMemory(next);
  return {
    waiting: writing && written === null,
    writingIn: next.first !== null && next.first === written,
  };
}
