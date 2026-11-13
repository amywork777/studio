import { inSentence, meshFormat, partName } from "./partNames";

/**
 * What a step or turn changed, by part and document rather than file: a part's files (script, STEP,
 * mesh, drawing, studies) are one entry, "Servo bracket: model, drawing"; a document, table or
 * picture is its own; anything with no engineer's name is counted, not listed.
 */

export interface DesignChange {
  /** What it is called: "Servo bracket", "FEA report". */
  readonly name: string;
  /** The name with what changed, where one thing did: "Servo bracket drawing"; else the name. */
  readonly label: string;
  /** What of it changed, in order: "model", "drawing", "FEA study". Empty for a document. */
  readonly aspects: ReadonlyArray<string>;
  /** What it is, for its icon: the kind of the file it opens to, else of its first file. */
  readonly kind: string;
  /** The file to open to see it (a STEP over its mesh, a study's model over its numbers); null when none shows it. */
  readonly open: string | null;
  /** Its model script, where it has one: a model opens by its id, which the folder's models name. */
  readonly script: string | null;
}

/** Kinds that are files of their own, not of a part. */
const STANDALONE = new Set(["Document", "Table", "Image", "Setup"]);

/** What a file of this kind is of its part. A model script is the model. */
const ASPECT: Readonly<Record<string, string>> = {
  Part: "model",
  Design: "model",
  Source: "model",
  Mesh: "mesh",
  Drawing: "drawing",
  "FEA study": "FEA study",
  "CAM job": "CAM job",
  "G-code": "G-code",
  Board: "board",
  Schematic: "schematic",
  Harness: "harness",
  Gerbers: "Gerbers",
  "Bill of materials": "bill of materials",
  "Pick and place": "pick and place file",
  Robot: "robot description",
  "Simulation model": "simulation model",
  "Planning groups": "planning groups",
};
const aspectOf = (kind: string) => ASPECT[kind] ?? kind.toLowerCase();

/** Which file shows a part best, first first. A model script shows nothing on its own. */
const OPEN_ORDER = [
  "Part",
  "Board",
  "Schematic",
  "Drawing",
  "FEA study",
  "CAM job",
  "Mesh",
  "Robot",
  "Harness",
];
const openRank = (kind: string) => {
  if (kind.endsWith(" check")) return OPEN_ORDER.indexOf("FEA study") + 0.5;
  const rank = OPEN_ORDER.indexOf(kind);
  return rank < 0 ? Number.POSITIVE_INFINITY : rank;
};

/** A study's numbers open as its result model beside them (`checkResults.ts`), 0.11's in its folder. */
const viewable = (path: string) =>
  path
    .replace(/\.fea\.json$/i, ".fea.glb")
    .replace(/\.result\.json$/i, ".glb")
    .replace(/(^|\/)result\.json$/i, "$1result.glb");

/** Folders whose files are tooling, never design, and files that are for the agent. */
const TOOLING =
  /(?:^|\/)(?:\.[^/]*|node_modules|__pycache__|dist|build|tmp)\/|(?:^|\/)(?:AGENTS|CLAUDE)\.md$/i;
/** Code that helps build parts without being one. */
const HELPER_CODE = /(?:^|\/)(?:lib|libs|utils?|helpers?|common|scripts?|tests?)\//i;

export function designChanges(paths: ReadonlyArray<string>): {
  readonly changes: ReadonlyArray<DesignChange>;
  /** Files with no engineer's name: tooling, settings, source with no part. */
  readonly other: number;
} {
  const families = new Map<
    string,
    { name: string; aspects: string[]; files: Array<{ path: string; kind: string }> }
  >();
  let other = 0;
  for (const raw of new Set(paths.map((path) => path.replaceAll("\\", "/")))) {
    const named = TOOLING.test(raw) ? null : partName(raw);
    if (named === null || (named.kind === "Source" && HELPER_CODE.test(raw))) {
      other += 1;
      continue;
    }
    const standalone = STANDALONE.has(named.kind);
    const key = standalone ? `${named.kind}\n${named.label}` : named.name.toLowerCase();
    const family = families.get(key) ?? {
      name: standalone ? named.label : named.name,
      aspects: [],
      files: [],
    };
    if (!standalone) {
      // A mesh is its format: "Clip STL", "model, STL, drawing".
      const aspect = named.kind === "Mesh" ? meshFormat(raw) : aspectOf(named.kind);
      if (!family.aspects.includes(aspect)) family.aspects.push(aspect);
    }
    family.files.push({ path: raw, kind: named.kind });
    families.set(key, family);
  }

  const changes = [...families.values()].map((family): DesignChange => {
    const standalone = family.aspects.length === 0;
    const shown = standalone
      ? family.files[0]!
      : family.files.toSorted((a, b) => openRank(a.kind) - openRank(b.kind))[0]!;
    const open = standalone || Number.isFinite(openRank(shown.kind)) ? viewable(shown.path) : null;
    // One aspect, and not the part itself, is named with it: "Servo bracket drawing".
    const only = family.aspects.length === 1 ? family.aspects[0]! : null;
    const label =
      only === null || only === "model" || family.name.toLowerCase().endsWith(only.toLowerCase())
        ? family.name
        : `${family.name} ${only}`;
    // A part named for what it is ("Bill of materials") says it once.
    const aspects = family.aspects.filter(
      (aspect) => aspect.toLowerCase() !== family.name.toLowerCase(),
    );
    const script = family.files.find((file) => file.kind === "Source")?.path ?? null;
    return { name: family.name, label, aspects, kind: shown.kind, open, script };
  });
  // A document or picture named as a part is ("Flat pattern" beside the flat pattern) says what it
  // is, so no two entries read the same.
  const labels = changes.map((change) => change.label.toLowerCase());
  const said = changes.map((change, index) =>
    change.aspects.length === 0 &&
    STANDALONE.has(change.kind) &&
    labels.indexOf(labels[index]!) !== labels.lastIndexOf(labels[index]!)
      ? { ...change, label: `${change.label} ${change.kind.toLowerCase()}` }
      : change,
  );
  return { changes: said, other };
}

/**
 * The changes in a phrase for a sentence: "the servo bracket", "the servo
 * bracket and the FEA report", "the servo bracket and 2 more"; `extra` counts
 * files beyond them. Null when nothing has a name.
 */
export function changesPhrase(changes: ReadonlyArray<DesignChange>, extra = 0): string | null {
  const [first, second, ...rest] = changes;
  if (first === undefined) return null;
  const more = rest.length + extra;
  if (second !== undefined && more === 0) {
    return `${inSentence(first.label)} and ${inSentence(second.label)}`;
  }
  const others = (second === undefined ? 0 : 1) + more;
  return others === 0 ? inSentence(first.label) : `${inSentence(first.label)} and ${others} more`;
}

/** How many changes a turn's line shows before the rest fold into "3 more". */
export const CHANGES_SHOWN = 4;

/** A turn's changes as its line shows them: the first few, unless opened, and how many are left. */
export function foldChanges<Change>(
  changes: ReadonlyArray<Change>,
  expanded: boolean,
  limit = CHANGES_SHOWN,
): { readonly shown: ReadonlyArray<Change>; readonly hidden: number } {
  // One more than the limit would fold a single chip behind a control as big as it.
  if (expanded || changes.length <= limit + 1) return { shown: changes, hidden: 0 };
  return { shown: changes.slice(0, limit), hidden: changes.length - limit };
}
