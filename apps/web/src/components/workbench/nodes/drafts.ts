/**
 * A part, assembly or off-the-shelf part added on the Nodes canvas before it exists: a card that
 * takes wires (the sizes and parts it will use) and a few words, then asks the agent to make it.
 * It stands in the graph as a script that imports what is wired into it, so its wires are drawn
 * as every other; once the agent's script (or imported STEP) appears, the real part takes its
 * place. Plain functions, no React.
 */

import { SHAPE, type GraphPart } from "./nodeGraph";

export type DraftKind = "Part" | "Assembly" | "Stock";

export interface Draft {
  readonly id: string;
  readonly kind: DraftKind;
  readonly name: string;
  /** What is wired into it: a node and the output it takes. */
  readonly inputs: ReadonlyArray<{ readonly from: string; readonly socket: string }>;
  /** When it was asked for (seconds) and the parts there were then; null before. */
  readonly sent: { readonly at: number; readonly before: ReadonlyArray<string> } | null;
}

/** What each kind is called on the canvas, in the words Studio already uses. */
export const DRAFT_TITLES: Record<DraftKind, string> = {
  Part: "New part",
  Assembly: "New assembly",
  Stock: "Off-the-shelf part",
};

const fileStem = (path: string) =>
  (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "").toLowerCase();

/** A name as a script's file name: "Belt clamp" is `belt_clamp`. */
export function slugOf(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[0-9]/.test(slug) ? `part_${slug}` : slug;
}

/** Where the agent is asked to write it. */
export const draftFile = (draft: Draft) =>
  `${draft.kind === "Assembly" ? "assemblies" : "parts"}/${slugOf(draft.name)}.py`;

/** Its place in the graph: a script no other can import (its name has a dash). */
export const draftPart = (draft: Draft): GraphPart => ({
  id: draft.id,
  name: draft.name.trim() || DRAFT_TITLES[draft.kind],
  script: `drafts/${draft.id}.py`,
  kind: draft.kind === "Assembly" ? "Assembly" : "Part",
  updated: null,
});

/**
 * The script it stands in as, so the graph wires it: a shape taken is its module imported whole, a
 * size taken is imported by name, and a STEP with no script is named in a string, as a script that
 * reads it would.
 */
export function draftSource(
  draft: Draft,
  nodes: ReadonlyMap<string, Pick<GraphPart, "id" | "script">>,
): string {
  return draft.inputs
    .flatMap(({ from, socket }) => {
      const node = nodes.get(from);
      if (node === undefined) return [];
      if (!node.script.toLowerCase().endsWith(".py")) {
        return [`"${node.id.split("/").pop() ?? node.id}"`];
      }
      const module = fileStem(node.script);
      return [socket === SHAPE ? `import ${module}` : `from ${module} import ${socket}`];
    })
    .join("\n");
}

/**
 * The ask that makes it. `uses` names what is wired in ("[Motor plate](…)", "MOTOR_BOLT_PATTERN
 * from [Sizes](…)"); `ask` is what the engineer wrote.
 */
export function draftPrompt(draft: Draft, uses: ReadonlyArray<string>, ask: string): string {
  const what = ask.trim().replace(/[.\s]+$/, "");
  if (draft.kind === "Stock") {
    return `Find ${what} on step.parts and import its STEP file into this project, checked against its record.`;
  }
  const list =
    uses.length < 2 ? (uses[0] ?? "") : `${uses.slice(0, -1).join(", ")} and ${uses.at(-1)}`;
  const name = draft.name.trim();
  const lines = [
    draft.kind === "Assembly"
      ? `Make a new assembly, ${name}: ${what}.`
      : `Make a new part, ${name}: ${what}.`,
  ];
  if (list !== "") {
    lines.push("", draft.kind === "Assembly" ? `It puts together ${list}.` : `It uses ${list}.`);
  }
  lines.push(
    "",
    `Write it as ${draftFile(draft)}, importing what it uses by name so it follows them, then build it.`,
  );
  return lines.join("\n");
}

/**
 * Whether what it asked for has appeared, so the real part takes its place: a part or assembly
 * with its file's name, or, for an off-the-shelf part, any new part with no script (a STEP).
 */
export function draftMade(draft: Draft, parts: ReadonlyArray<GraphPart>): boolean {
  if (draft.sent === null) return false;
  const before = new Set(draft.sent.before);
  const fresh = parts.filter((part) => !before.has(part.id));
  if (draft.kind === "Stock") {
    return fresh.some((part) => !part.script.toLowerCase().endsWith(".py"));
  }
  const slug = slugOf(draft.name);
  return fresh.some((part) => fileStem(part.script) === slug);
}
