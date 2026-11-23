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

/** The chip's words: the part picked in and how many of what ("LED module · 1 face"). */
export function viewContextLabel(about: string): string {
  const picks = referencesOf(about);
  if (picks.length === 0) return "Model view";
  const first = /#([^/\s;#]+)\/([a-z]+):/i.exec(picks[0]!);
  const name = first ? partName(first[1]!) : "";
  const kinds = new Set(
    picks.map((pick) => /#[^/\s;#]+\/([a-z]+):/i.exec(pick)?.[1]?.toLowerCase()),
  );
  const [one, many] =
    kinds.size === 1 && first
      ? (NOUNS[first[2]!.toLowerCase()] ?? ["pick", "picks"])
      : ["pick", "picks"];
  const count = `${picks.length} ${picks.length === 1 ? one : many}`;
  return name === "" ? count : `${name} · ${count}`;
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
