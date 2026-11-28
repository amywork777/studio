/**
 * The library page's address (`/library`, `LibraryPage`) and its search box. New, the part menus,
 * ⌘K and Settings link into it with `libraryHref`, so none of them imports the page.
 */

import type { StudioSample } from "@t3tools/contracts";

import { findExamples } from "../examples/examples";
import { HARDWARE_ACTIONS } from "../hardwareActions";
import { jobOfSkill } from "../jobSkills";
import { holdsWords } from "../quickFind";
import { TOOLBOX_TABS, type ToolboxTab, toolboxTabOf } from "../toolbox";
import {
  findItIn,
  type LibraryDocument,
  type LibraryEntry,
  madeBy,
  showsUpAs,
  skillName,
} from "./libraryCatalog";

/** The page's shelves are the Toolbox's tabs, in the popup's order: Design, Check, Make, Document. */
export type LibraryGroup = ToolboxTab;

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
    group: TOOLBOX_TABS.find((group) => group === raw.group),
    from: typeof raw.from === "string" && RETURNABLE.test(raw.from) ? raw.from : undefined,
  };
}

/** A link into the library, for `navigate` or `<Link>`: `libraryHref({ group: "Check", from })`. */
export function libraryHref(input: {
  readonly entry?: string;
  readonly group?: LibraryGroup;
  readonly from?: string;
}) {
  return { to: "/library", search: input } as const;
}

/**
 * The shelf a document type is listed under, so it shows in one place: the Toolbox tab of its first
 * job (`actions`), else Design.
 */
export function libraryGroup(entry: LibraryDocument): LibraryGroup {
  const first = HARDWARE_ACTIONS.find((job) => job.id === entry.actions[0]);
  return first === undefined ? "Design" : toolboxTabOf(first);
}

/** The shelf of a type no skill makes: New only makes parts with a skill, so it is a document. */
export const documentGroup = (entry: LibraryDocument): LibraryGroup => {
  const group = libraryGroup(entry);
  return group === "Design" ? "Document" : group;
};

/** The skills whose jobs span the tabs: each shapes the design, so it stands in Design. */
const SKILL_GROUPS: Readonly<Record<string, LibraryGroup>> = {
  cad: "Design",
  pcb: "Design",
};

/**
 * The shelf of a skill: the Toolbox tab of its job (a job skill's own, else its first), so it
 * stands where the popup shows its jobs.
 */
export function skillGroup(skill: string): LibraryGroup {
  const job = jobOfSkill(skill) ?? HARDWARE_ACTIONS.find((action) => action.skill === skill);
  return SKILL_GROUPS[skill] ?? (job === undefined ? "Design" : toolboxTabOf(job));
}

/**
 * The footer link "See what each makes" under a Toolbox tab: the Toolbox page on that tab's
 * shelf. Its Make one comes back to `from` only while the workspace has a New to take the request
 * (`workspaceOpen`, as ⌘K's Library does); from elsewhere it goes to Home's.
 */
export function toolboxLibraryLink(
  tab: ToolboxTab,
  where: { readonly workspaceOpen: boolean; readonly from: string },
) {
  return libraryHref({ group: tab, ...(where.workspaceOpen ? { from: where.from } : {}) });
}

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
