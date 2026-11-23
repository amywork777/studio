/**
 * A message the model view's Quick Edit sent (text-to-cad's `formatPromptMessage`): what the person
 * wrote, then what it is about, each file on a `File:` line and the picks under `References:`, then
 * any attachment that travels inline (the view's snapshot). The chat shows the person's words and the
 * rest as one chip (`ViewContextChip`); the agent reads the message whole.
 */
const ABOUT = /(?:^|\n\n)(?=File: |References:\n)/;

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

/** The picks a message names: each line under `References:`, up to the next blank line. */
function referencesOf(about: string): string[] {
  const start = about.indexOf("References:\n");
  if (start === -1) return [];
  const lines = about.slice(start + "References:\n".length).split("\n");
  const picks: string[] = [];
  for (const line of lines) {
    if (line.trim() === "" || /^[A-Z][\w ]*(?:\([^)]*\))?: /.test(line)) break;
    picks.push(line.trim());
  }
  return picks;
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

/** The person's words and the context the view sent with them; null for a message typed in the chat. */
export function viewMessageOf(text: string): {
  readonly words: string;
  readonly about: string;
  readonly label: string;
} | null {
  const match = ABOUT.exec(text);
  if (match === null) return null;
  const about = text.slice(match.index).replace(/^\n\n/, "");
  if (!/^File: \S/.test(about) && !about.startsWith("References:\n")) return null;
  return { words: text.slice(0, match.index).trim(), about, label: viewContextLabel(about) };
}
