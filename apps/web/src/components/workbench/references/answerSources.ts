/**
 * The Sources block that ends an answer about a project. The agent is told to write it
 * (`studioProjectContext`): a line reading `Sources:`, then one source a line, numbered as the
 * answer cites them, as in `[1] parts/bracket.py:12-18`. `splitSources` reads it back, so the
 * answer can show without the block and its sources be listed under it.
 */

export type SourceTarget =
  | { kind: "file"; path: string; lines: [number, number] | null; heading: string | null }
  | { kind: "url"; url: string }
  | { kind: "own"; text: string };

/** `Sources:` as models also write it: in bold or italics, as a heading, the colon in or out. */
const SOURCES_LINE = /^(?:#{1,6}[ \t]+)?(\*{1,3}|_{1,3})?Sources(?::\1|\1:?)$/;
/** A rule alone on its line, which models set between an answer and its Sources. */
const TRAILING_RULE = /(?:^|\n)[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
const LIST_BULLET = /^[-*]\s+/;
/**
 * `[3] parts/bracket.py:12-18`, or `[3]: …` as a footnote is written, the colon with or without a
 * space after it. With no colon the space is needed, which keeps a link, `[3](https://…)`, from
 * reading as a source.
 */
const SOURCE_ENTRY = /^\[(\d+)\](?::\s*|\s+)(\S.*)$/;
/**
 * The description after a plain path, to the end of the line: ` — …`; after a line range, `: …`
 * or ` (…)`; after a file extension, ` (…)`. So `a.py:12-18 (the hole)` and `a.py (the hole)`
 * read as `a.py`, while `docs/Design notes (v2).md` keeps its parentheses.
 */
const DESCRIPTION = / [—–-] .*$|(?<=:\d+(?:[-–—]\d+)?)(?::.*|\s+\(.*\))$|(?<=\.\w+)\s+\(.*\)$/;
/**
 * A target that starts with a backtick span: the span is the target as written, a file name in it
 * can hold ` - `, and `:12-18` or `#Heading` may follow it directly. Anything else after the span
 * is a description, however it begins: ` (…)`, ` — …`, `: …` or plain words.
 */
const BACKTICK_TARGET = /^`([^`]+)`(:\d+(?:[-–—]\d+)?|#.*)?/;
/** A target in angle brackets is taken whole, with a description after it as ` — …`. */
const ANGLE_TARGET = /^<([^>]*)>(?: [—–-] .*)?$/;
/**
 * `[title](address)`, taken whole too; a `.`, `,` or `;` after it is left out. The address can
 * hold parentheses (`Torx_(screw_drive)`), so it ends at the first `)` that a space or the end of
 * the line follows.
 */
const MARKDOWN_LINK = /^\[[^\]]*\]\((\S+?)\)(?=[.,;]*(?:\s|$))/;
/**
 * The separator is a colon, or a dash with a space after it: `own knowledge-based` loses nothing.
 */
const OWN_KNOWLEDGE = /^own knowledge\b\s*(?::|[—–-](?=\s))?/i;
/** An address ends at its first space, so a description after it needs no cutting. */
const WEB_ADDRESS = /^https?:\/\/\S+/i;
/** `path#Heading`. A `#` after a space is part of a description, as in `— #6-32 screws`. */
const PATH_WITH_HEADING = /^((?:.*?\S)?)#(.*)$/;
/** `path:12` or `path:12-18`, the range also written with an en or an em dash. */
const PATH_WITH_LINES = /^(.*?):(\d+)(?:[-–—](\d+))?$/;

/** A link's address, or the target in its backticks or angle brackets: a target read whole. */
function wholeTarget(text: string): string | null {
  const link = MARKDOWN_LINK.exec(text)?.[1];
  if (link !== undefined) return link;
  const ticked = BACKTICK_TARGET.exec(text);
  if (ticked !== null) return `${ticked[1] ?? ""}${ticked[2] ?? ""}`.trim();
  const angled = ANGLE_TARGET.exec(text);
  return angled === null ? null : (angled[1] ?? "").trim();
}

/** A file with no path is no source. Backticks never belong to a path, wherever they sit. */
function fileTarget(
  path: string,
  lines: [number, number] | null,
  heading: string | null,
): SourceTarget | null {
  const name = path.replaceAll("`", "").trim();
  return name === "" ? null : { kind: "file", path: name, lines, heading };
}

/**
 * `path#Heading`, whose heading keeps the rest of the line; else `path:12-18`, `path:12` or a
 * plain `path`, which loses a description after it when `cutDescription` is set. Line 0 is no line.
 */
function readFileTarget(target: string, cutDescription: boolean): SourceTarget | null {
  const titled = PATH_WITH_HEADING.exec(target);
  if (titled !== null) return fileTarget(titled[1] ?? "", null, (titled[2] ?? "").trim() || null);
  const plain = (cutDescription ? target.replace(DESCRIPTION, "") : target).trim();
  const ranged = PATH_WITH_LINES.exec(plain);
  if (ranged === null) return fileTarget(plain, null, null);
  const [, path = "", first = "", last = first] = ranged;
  const from = Number(first);
  const to = Number(last);
  return fileTarget(
    path,
    from < 1 || to < 1 ? null : [Math.min(from, to), Math.max(from, to)],
    null,
  );
}

/**
 * A link, a leading backtick span and an angle-bracket target are taken whole. Otherwise a plain
 * path or an address drops its trailing description (`DESCRIPTION`); a heading and own knowledge
 * keep the rest of the line.
 */
function readTarget(text: string): SourceTarget | null {
  const whole = wholeTarget(text);
  const target = whole ?? text;
  if (OWN_KNOWLEDGE.test(target)) {
    return { kind: "own", text: target.replace(OWN_KNOWLEDGE, "").trim() };
  }
  const address = WEB_ADDRESS.exec(target)?.[0];
  if (address !== undefined) return { kind: "url", url: address };
  return readFileTarget(target, whole === null);
}

/**
 * The block is the last Sources line and the `[n] target` lines under it; anything else under it
 * makes it part of the answer. Unreadable lines and repeated numbers are dropped, and a horizontal
 * rule right before the Sources line goes with it.
 */
export function splitSources(markdown: string): {
  body: string;
  sources: Array<{ n: number; target: SourceTarget }>;
} {
  const whole = { body: markdown, sources: [] };
  const lines = markdown.split("\n");
  const header = lines.findLastIndex((line) => SOURCES_LINE.test(line.trim()));
  if (header < 0) return whole;
  const block = lines
    .slice(header + 1)
    .map((line) => line.trim().replace(LIST_BULLET, ""))
    .filter((line) => line !== "");
  if (!block.every((line) => line.startsWith("["))) return whole;
  const sources: Array<{ n: number; target: SourceTarget }> = [];
  for (const line of block) {
    const entry = SOURCE_ENTRY.exec(line);
    if (entry === null) continue;
    const n = Number(entry[1]);
    const target = readTarget(entry[2] ?? "");
    if (n > 0 && target !== null && !sources.some((source) => source.n === n)) {
      sources.push({ n, target });
    }
  }
  const body = lines.slice(0, header).join("\n").trimEnd().replace(TRAILING_RULE, "").trimEnd();
  return { body, sources };
}
