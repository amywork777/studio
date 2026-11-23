/**
 * A message the model view's Quick Edit sent (text-to-cad's `formatPromptMessage`): what the person
 * wrote, then what it is about, each file on a `File:` line and the picks under `References:`, then
 * any attachment that travels inline (the view's snapshot). The chat shows the person's words and the
 * rest as one chip (`ViewContextChip`); the agent reads the message whole.
 */
const NOUNS: Readonly<Record<string, readonly [string, string]>> = {
  f: ["face", "faces"],
  e: ["edge", "edges"],
  v: ["vertex", "vertices"],
};

/** A part's name as a person reads it: `led_module` is "LED module", `part` is "Part". */
function partName(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  if (words === "") return "";
  return words
    .split(" ")
    .map((word, index) =>
      /^(?:led|pcb|usb|cnc|fea)$/i.test(word)
        ? word.toUpperCase()
        : index === 0
          ? word.charAt(0).toUpperCase() + word.slice(1)
          : word,
    )
    .join(" ");
}

/** The picks a message names: each line under every `References:`, up to the next blank line. */
function referencesOf(about: string): string[] {
  const picks: string[] = [];
  let from = 0;
  for (;;) {
    const start = about.indexOf("References:\n", from);
    if (start === -1) return picks;
    from = start + "References:\n".length;
    for (const line of about.slice(from).split("\n")) {
      if (line.trim() === "" || /^[A-Z][\w ]*(?:\([^)]*\))?: /.test(line)) break;
      picks.push(line.trim());
    }
  }
}

/** A pick's part and what of it: `doc#arm/head/f:head.body_face3~…` is the head, a face. */
function pickOf(pick: string): { readonly part: string; readonly kind: string | null } {
  const anchor = pick.slice(pick.indexOf("#") + 1).split(";")[0] ?? "";
  const kind = /\/([a-z]+):/i.exec(anchor);
  const path = kind === null ? anchor : anchor.slice(0, kind.index);
  const last = path.split("/").filter(Boolean).at(-1) ?? "";
  // An instance's number and a part's own name after a colon are the model's, not the person's.
  const part = partName(last.replace(/<\d+>$/, "").replace(/:.*$/, ""));
  return { part, kind: kind?.[1]?.toLowerCase() ?? null };
}

const KIND_WORDS: Readonly<Record<string, string>> = { f: "face", e: "edge", v: "vertex" };

/** A pick as a person reads it in a list: "Head, face 2", "Base" for a whole part. */
export function pickWords(pick: string): string {
  const { part, kind } = pickOf(pick);
  if (kind === null) return part || pick;
  const number = /_(?:face|edge|vertex)(\d+)/i.exec(pick)?.[1];
  const what = KIND_WORDS[kind] ?? "pick";
  return `${part || "Part"}, ${what}${number === undefined ? "" : ` ${number}`}`;
}

/** What the view sent the message about: the parts picked in, how many of what, the picks and the file. */
export function viewContextOf(about: string): {
  /** Each part picked in, once, in the order picked: "Arm", "Head", "Base". */
  readonly parts: ReadonlyArray<string>;
  /** "7 picks", "1 face"; empty with no picks (the view as a whole). */
  readonly count: string;
  readonly picks: ReadonlyArray<string>;
  /** The file the picks are in (the `File:` line), null where it gave none. */
  readonly file: string | null;
} {
  const picks = referencesOf(about);
  const file = /^File: (\S.*)$/m.exec(about)?.[1]?.trim() ?? null;
  const read = picks.map(pickOf);
  const parts = [...new Set(read.map((pick) => pick.part).filter((part) => part !== ""))];
  const kinds = new Set(read.map((pick) => pick.kind));
  const only = kinds.size === 1 ? [...kinds][0] : null;
  const [one, many] = (only ? NOUNS[only] : undefined) ?? ["pick", "picks"];
  const count = picks.length === 0 ? "" : `${picks.length} ${picks.length === 1 ? one : many}`;
  return { parts, count, picks, file };
}

/** The chip's words: the parts picked in and how many of what ("Arm, Head · 7 picks"). */
export function viewContextLabel(about: string): string {
  const { parts, count } = viewContextOf(about);
  if (count === "") return "Model view";
  return parts.length === 0 ? count : `${parts.join(", ")} · ${count}`;
}

/**
 * A note edit mode left for the agent (text-to-cad's `editMode.js`: "In edit mode I added Fillet1, …
 * (parts/part.py, line 20)."): it goes to the agent with the next message but is not the person's words.
 */
const HAND_EDIT_NOTE = /^In edit mode I /;
/** A paragraph of what the view sent a message about: its file, its picks, an inline attachment. */
const CONTEXT = /^(?:File: \S|References:(?:\n|$)|Snapshot JSON|[{[])/;

/**
 * The person's words and the context the view sent with them; null for a message typed in the chat.
 * The composer may hold edit mode's notes ahead of a Quick Edit message: they and every context block
 * go behind the chip, wherever they stand, and only the person's own paragraphs are the words.
 */
export function viewMessageOf(text: string): {
  readonly words: string;
  readonly about: string;
  readonly label: string;
} | null {
  const words: string[] = [];
  const context: string[] = [];
  const notes: string[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (trimmed === "") continue;
    if (HAND_EDIT_NOTE.test(trimmed)) notes.push(trimmed);
    else if (CONTEXT.test(trimmed)) context.push(trimmed);
    else words.push(trimmed);
  }
  if (context.length === 0 && notes.length === 0) return null;
  if (context.length > 0 && !context.some((block) => /^(?:File: \S|References:)/.test(block))) {
    return null;
  }
  const about = [...notes, ...context].join("\n\n");
  const picked = viewContextOf(context.join("\n\n")).count !== "";
  const label = !picked && notes.length > 0 ? "Hand edit" : viewContextLabel(context.join("\n\n"));
  return { words: words.join("\n\n"), about, label };
}
