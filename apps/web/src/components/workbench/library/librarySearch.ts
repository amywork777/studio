/**
 * The library page's address (`/library`, `LibraryPage`) and its search box. New, the part menus,
 * ⌘K and Settings link into it with `libraryHref`, so none of them imports the page.
 */

import type { StudioSample } from "@t3tools/contracts";

import { findExamples } from "../examples/examples";
import { HARDWARE_ACTIONS } from "../hardwareActions";
import { jobOfSkill } from "../jobSkills";
import { holdsWords } from "../quickFind";
import {
  findItIn,
  type LibraryDocument,
  type LibraryEntry,
  madeBy,
  showsUpAs,
  skillName,
} from "./libraryCatalog";

/** Where a document type is found: New, or the part menu one of its jobs is in. */
export type LibraryGroup = "New" | "Evaluate" | "Manufacture" | "Document";

/** The document types' groups, in the order the page shows them. */
export const LIBRARY_GROUPS: ReadonlyArray<LibraryGroup> = [
  "New",
  "Evaluate",
  "Manufacture",
  "Document",
];

/**
 * The library's place in the URL: the entry whose detail is open (so Back closes it), the group
 * it opens on, and the page it was opened from, where Make one goes back to.
 */
export interface LibrarySearch {
  readonly entry?: string | undefined;
  readonly group?: LibraryGroup | undefined;
  readonly from?: string | undefined;
}

/** A page of this app other than the library: a path, never another site's address. */
const RETURNABLE = /^\/(?![/\\])(?!library(?:[/?#]|$))/;

/**
 * The library's search as its route reads it from the URL. An unknown group, an entry that is not
 * a name, or a `from` that is not a page of this app is left out, not an error; an entry no one
 * has is ignored by the page. Every key is always set, since the router lays this over the URL's
 * raw search, where a bad value would otherwise show through.
 */
export function validateLibrarySearch(raw: Record<string, unknown>): LibrarySearch {
  return {
    entry: typeof raw.entry === "string" && raw.entry !== "" ? raw.entry : undefined,
    group: LIBRARY_GROUPS.find((group) => group === raw.group),
    from: typeof raw.from === "string" && RETURNABLE.test(raw.from) ? raw.from : undefined,
  };
}

/** A link into the library, for `navigate` or `<Link>`: `libraryHref({ group: "Evaluate", from })`. */
export function libraryHref(input: {
  readonly entry?: string;
  readonly group?: LibraryGroup;
  readonly from?: string;
}) {
  return { to: "/library", search: input } as const;
}

/**
 * The group a document type is listed under, so it shows in one place: the menu of its first job
 * (`actions`), else New.
 */
export function libraryGroup(entry: LibraryDocument): LibraryGroup {
  const first = entry.actions[0];
  return HARDWARE_ACTIONS.find((job) => job.id === first)?.group ?? "New";
}

/** The shelf of a type no skill makes: New only makes parts with a skill, so it is a document. */
export const documentGroup = (entry: LibraryDocument): LibraryGroup => {
  const group = libraryGroup(entry);
  return group === "New" ? "Document" : group;
};

/** Which shelf each of text-to-cad's skills stands on, by the work it does. */
const SKILL_GROUPS: Readonly<Record<string, LibraryGroup>> = {
  cad: "New",
  pcb: "New",
  "robot-simulation": "New",
  fea: "Evaluate",
  cam: "Manufacture",
  print3d: "Manufacture",
  sendcutsend: "Manufacture",
  "engineering-drawing": "Document",
  "work-instructions": "Document",
  render: "Document",
};

/**
 * The shelf of a skill: a job skill's is its job's menu, and one text-to-cad adds later stands with
 * the part menu of its first job.
 */
export const skillGroup = (skill: string): LibraryGroup =>
  SKILL_GROUPS[skill] ??
  jobOfSkill(skill)?.group ??
  HARDWARE_ACTIONS.find((job) => job.skill === skill)?.group ??
  "New";

/**
 * What the search box looks through: an entry's name, what it is, its skills, by their names and
 * as the page shows them (`shown`), and where it is.
 */
const searchText = (entry: LibraryEntry, shown: (skill: string) => string) =>
  (entry.kind === "document"
    ? [entry.name, entry.what, ...madeBy(entry), ...madeBy(entry, shown), ...findItIn(entry)]
    : [entry.name, entry.displayName, entry.description, ...showsUpAs(entry.name)]
  ).join("\n");

/**
 * The entries that hold every word typed, ignoring case, in their order; all of them for none. A
 * skill is named as the page names it, by the skills among `entries` (`skillName`).
 */
export function filterLibrary(entries: ReadonlyArray<LibraryEntry>, query: string): LibraryEntry[] {
  const skills = entries.filter((entry) => entry.kind === "skill");
  const shown = (skill: string) => skillName(skill, skills);
  return entries.filter((entry) => holdsWords(searchText(entry, shown), query));
}

/**
 * What ⌘K finds in the Library once something is typed, by the Library's own search: its examples
 * (`findExamples`) and its document types, each at most `shown`. Nothing typed finds nothing, so ⌘K
 * then Enter stays on the work.
 */
export function findInLibrary(
  examples: ReadonlyArray<StudioSample>,
  documents: ReadonlyArray<LibraryDocument>,
  query: string,
  shown: number,
): { readonly examples: StudioSample[]; readonly documents: LibraryDocument[] } {
  if (query.trim() === "") return { examples: [], documents: [] };
  return {
    examples: findExamples(examples, query).slice(0, shown),
    documents: filterLibrary(documents, query)
      .filter((entry) => entry.kind === "document")
      .slice(0, shown),
  };
}
