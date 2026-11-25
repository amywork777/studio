/**
 * Brainstorm's side of a set of concepts: where the agent writes each set (`brainstorm/set-<n>/`),
 * how Studio reads it to draw a card per concept under the reply, and the message a card's "More
 * like this" hands to the chat. Every number on a card comes from that file, which takes it from a
 * cad command.
 */

/** How many concepts a set has. */
const CONCEPTS_PER_SET = 4;

/** A set's file, relative to the project's folder: `brainstorm/set-2/concepts.json`. */
const SET_FILE = /^(?:\.\/)?brainstorm\/set-(\d+)\/concepts\.json$/;

/** One concept the agent built: a real part, its own script. */
export interface Concept {
  readonly name: string;
  /** One plain sentence on how it differs from the others. */
  readonly idea: string;
  /** Its part script, relative to the project's folder. */
  readonly script: string;
  /** Its picture (`cad model snapshot --preview`), relative to the project's folder. */
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

/** A path inside the project: relative, with no step up out of it. */
const insideProject = (path: string | null): string | null => {
  if (path === null) return null;
  const forward = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (/^(?:\/|[A-Za-z]:)/.test(forward) || forward.split("/").includes("..")) return null;
  return forward;
};

/** The set a changed file is, by its path: the number of `brainstorm/set-<n>/concepts.json`. */
export function conceptSetOf(path: string): number | null {
  const match = SET_FILE.exec(path.replaceAll("\\", "/"));
  return match === null ? null : Number(match[1]);
}

/** A file of a set (its list or a picture), which its cards show. */
export const isBrainstormFile = (path: string) =>
  /^(?:\.\/)?brainstorm\//.test(path.replaceAll("\\", "/"));

export const conceptSetFile = (set: number) => `brainstorm/set-${set}/concepts.json`;

/**
 * The concepts in a set's file, in its order. One with no script inside the project is left out,
 * and a second with the same script. A mass that is not a positive number is not checked (law 4).
 * Null when the file is not JSON.
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
    const script = insideProject(text(entry.script));
    if (script === null || !/\.py$/i.test(script) || seen.has(script)) return [];
    seen.add(script);
    const mass = entry.mass_g;
    return [
      {
        name: text(entry.name) ?? `Concept ${index + 1}`,
        idea: text(entry.idea) ?? "",
        script,
        picture: insideProject(text(entry.picture)),
        material: text(entry.material),
        massGrams: typeof mass === "number" && Number.isFinite(mass) && mass > 0 ? mass : null,
      },
    ];
  });
  return { set, concepts };
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
