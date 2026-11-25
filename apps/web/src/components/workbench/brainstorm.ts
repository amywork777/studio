/**
 * Brainstorm's side of a set of concepts. The agent keeps each set in the chat's concepts folder
 * (`studioConceptsFolder`, outside the project) as `set-<n>/`, and links its `concepts.json` at the
 * end of its reply; Studio reads that file to draw a card per concept under the reply. Every number
 * on a card comes from that file, which takes it from a cad command.
 */

/** How many concepts a set has. */
const CONCEPTS_PER_SET = 4;

/** A file name a set may hold: no folder, so nothing in a set's list points out of it. */
const SCRIPT = /^[A-Za-z_][A-Za-z0-9_]*\.py$/;
const PICTURE = /^[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp)$/i;

/** One concept the agent built: a real part, its own script in its set's folder. */
export interface Concept {
  readonly name: string;
  /** One plain sentence on how it differs from the others. */
  readonly idea: string;
  /** Its script's file name in the set's folder; its stem is its model's name. */
  readonly script: string;
  /** Its picture's file name in the set's folder (`cad model snapshot --preview`). */
  readonly picture: string | null;
  readonly material: string | null;
  /** Its mass as `cad model inspect` measured it; null when nothing measured it. */
  readonly massGrams: number | null;
}

export interface ConceptSet {
  readonly set: number;
  readonly concepts: ReadonlyArray<Concept>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A set's folder, and a file in it. */
export const conceptSetFolder = (folder: string, set: number) =>
  `${folder.replace(/[\\/]+$/, "")}/set-${set}`;
export const inConceptSet = (folder: string, set: number, file: string) =>
  `${conceptSetFolder(folder, set)}/${file}`;

/**
 * The sets a reply links, in its order, once each: `.../<threadId>/set-<n>/concepts.json`, however
 * the path was written (in full, with `~`, as a link or with Windows' slashes).
 */
export function conceptSetsIn(reply: string, threadId: string): number[] {
  const link = new RegExp(
    `${escapeRegExp(threadId)}[\\\\/]+set-(\\d+)[\\\\/]+concepts\\.json`,
    "g",
  );
  return [...new Set([...reply.matchAll(link)].map((match) => Number(match[1])))];
}

/**
 * The concepts in a set's file, in its order. One whose script is not a file of its set is left
 * out, and a second with the same script. A mass that is not a positive number is not checked
 * (law 4). Null when the file is not JSON (the agent is still writing it).
 */
export function readConceptSet(set: number, contents: string): ConceptSet | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return null;
  }
  const list = isRecord(parsed) && Array.isArray(parsed.concepts) ? parsed.concepts : [];
  const seen = new Set<string>();
  const concepts = list.flatMap((entry, index): Concept[] => {
    if (!isRecord(entry)) return [];
    const script = text(entry.script);
    if (script === null || !SCRIPT.test(script) || seen.has(script)) return [];
    seen.add(script);
    const picture = text(entry.picture);
    const mass = entry.mass_g;
    return [
      {
        name: text(entry.name) ?? `Concept ${index + 1}`,
        idea: text(entry.idea) ?? "",
        script,
        picture: picture !== null && PICTURE.test(picture) ? picture : null,
        material: text(entry.material),
        massGrams: typeof mass === "number" && Number.isFinite(mass) && mass > 0 ? mass : null,
      },
    ];
  });
  return { set, concepts };
}

/** A concept's model's name: its script's stem, which its `@model` function is named. */
export const conceptStem = (concept: Concept) => concept.script.replace(/\.py$/i, "");

/**
 * A concept's script as a part of the project named `stem`: its model's name, wherever the script
 * writes it (its function, its call, its label), becomes the part's, so its file and model agree.
 */
export function asProjectPart(contents: string, from: string, stem: string): string {
  return from === stem
    ? contents
    : contents.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, "g"), stem);
}

/** A mass as a card shows it: grams under a kilogram, else kilograms; "Not checked" without one. */
export function massLabel(grams: number | null): string {
  if (grams === null) return "Not checked";
  if (grams < 1000) return `${grams < 10 ? grams.toFixed(1) : Math.round(grams)} g`;
  return `${(grams / 1000).toFixed(grams < 10_000 ? 2 : 1)} kg`;
}

/** The lightest concept's script, where two or more were weighed; null otherwise. */
export function lightestConcept(concepts: ReadonlyArray<Concept>): string | null {
  const weighed = concepts.filter((concept) => concept.massGrams !== null);
  if (weighed.length < 2) return null;
  return weighed.reduce((low, concept) =>
    (concept.massGrams ?? Infinity) < (low.massGrams ?? Infinity) ? concept : low,
  ).script;
}

/** The message a card's "More like this" hands to the chat, naming the concept by its script. */
export function moreLikeThisPrompt(concept: Concept, scriptLink: string): string {
  return (
    `Make ${CONCEPTS_PER_SET} more concepts like ${concept.name} (${scriptLink}) with $brainstorm: ` +
    "keep what makes it work and vary the rest."
  );
}
