/**
 * Where each editable piece of a document sits in its Markdown file: a remark plugin marks
 * headings, paragraphs, list items and table cells with `data-src="start:end"`, plus
 * `data-src-plain` for plain words, which are edited in place. An edit writes back at that place
 * and leaves the rest of the file as it was.
 */

interface SourceNode {
  type: string;
  children?: SourceNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hProperties?: Record<string, unknown> };
}

/** The kinds of piece an edit can land in, and how its words go back into the file. */
export type PieceKind = "heading" | "paragraph" | "listItem" | "tableCell";

const MARKED = new Set<string>(["heading", "paragraph", "listItem", "tableCell"]);

/** The span of a node's words: its first child's start to its last child's end. */
function wordsSpan(node: SourceNode): { start: number; end: number; plain: boolean } | null {
  // A list item's words are its first paragraph's; a nested list stays its own.
  const holder =
    node.type === "listItem" ? node.children?.find((child) => child.type === "paragraph") : node;
  const children = holder?.children ?? [];
  const first = children[0]?.position?.start.offset;
  const last = children.at(-1)?.position?.end.offset;
  if (first === undefined || last === undefined) return null;
  // A list item with a list inside it is not one piece of words: only its own paragraph's are.
  const alone = node.type !== "listItem" || node.children?.length === 1;
  return {
    start: first,
    end: last,
    plain: alone && children.every((child) => child.type === "text"),
  };
}

function mark(node: SourceNode): void {
  if (MARKED.has(node.type)) {
    const span = wordsSpan(node);
    if (span !== null) {
      node.data ??= {};
      node.data.hProperties = {
        ...node.data.hProperties,
        "data-src": `${span.start}:${span.end}`,
        "data-src-kind": node.type,
        ...(span.plain ? { "data-src-plain": "" } : {}),
      };
    }
  }
  for (const child of node.children ?? []) mark(child);
}

function remarkSourcePlaces() {
  return (tree: SourceNode) => mark(tree);
}

export const SOURCE_REMARK_PLUGINS = [remarkSourcePlaces];

/** A piece's place, read back from its `data-src`; null for a piece without one. */
export function readPlace(value: string | null): { start: number; end: number } | null {
  const match = value === null ? null : /^(\d+):(\d+)$/.exec(value);
  return match === null ? null : { start: Number(match[1]), end: Number(match[2]) };
}

/**
 * The file with a piece's words replaced: a heading's, a list item's and a table cell's stay on
 * one line (a cell's bars written so they stay text); a paragraph keeps its lines, a blank line
 * between two starting a new paragraph.
 */
export function withWords(
  source: string,
  place: { readonly start: number; readonly end: number },
  kind: PieceKind,
  words: string,
): string {
  const text = words.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const line =
    kind === "paragraph"
      ? text.replace(/\n{3,}/g, "\n\n").trim()
      : text.replace(/\s*\n\s*/g, " ").trim();
  const written = kind === "tableCell" ? line.replace(/(?<!\\)\|/g, "\\|") : line;
  return `${source.slice(0, place.start)}${written}${source.slice(place.end)}`;
}
