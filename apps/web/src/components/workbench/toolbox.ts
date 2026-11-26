import {
  type HardwareAction,
  type HardwareActionGroup,
  type HardwareActionMenu,
  jobFits,
} from "./hardwareActions";
import { libraryHref } from "./library/librarySearch";
import { MENU_WORDS } from "./kinds";
import { NEW_TEMPLATES, type NewTemplate } from "./newTemplates";
import { lowerName } from "./partNames";

/** A run of jobs in a group, under its title. */
export interface ToolboxSection {
  readonly title: string;
  readonly actions: ReadonlyArray<HardwareAction>;
}

/** One of the Toolbox's three groups and its jobs. */
export interface ToolboxGroup {
  readonly group: HardwareActionGroup;
  readonly sections: ReadonlyArray<ToolboxSection>;
}

const GROUP_ORDER: ReadonlyArray<HardwareActionGroup> = ["Evaluate", "Manufacture", "Document"];

/**
 * Jobs as the Toolbox shows them: always Evaluate, Manufacture and Document, in that order, a tab
 * each, every section open and every job a tile like the others. The menus' everyday sections come
 * first and the ones they keep under "More" after, nothing folded; a group with no job has no
 * sections.
 */
export function toolboxGroups(menus: ReadonlyArray<HardwareActionMenu>): ToolboxGroup[] {
  return GROUP_ORDER.map((group) => {
    const menu = menus.find((entry) => entry.group === group);
    return { group, sections: menu ? [...menu.sections, ...menu.others] : [] };
  });
}

/**
 * A group's sections in the rail's order: a section of one tile draws the next such section up to
 * it, so the two share a row wherever they stood (1, 2, 1 comes out 1, 1, 2). The one left over
 * stays where it was. In the list, not a dense grid, so tab order stays what the rail shows.
 */
export function pairLoneSections(
  sections: ReadonlyArray<ToolboxSection>,
): ReadonlyArray<ToolboxSection> {
  const isLone = (section: ToolboxSection) => section.actions.length === 1;
  const rest = [...sections];
  const paired: ToolboxSection[] = [];
  for (let section = rest.shift(); section !== undefined; section = rest.shift()) {
    paired.push(section);
    if (!isLone(section)) continue;
    const next = rest.findIndex(isLone);
    if (next !== -1) paired.push(...rest.splice(next, 1));
  }
  return paired;
}

/** The Toolbox's tabs: the person's own tools first, then each group. */
export type ToolboxTab = "Yours" | HardwareActionGroup;

const TABS: ReadonlyArray<ToolboxTab> = ["Yours", ...GROUP_ORDER];

const TAB_KEY = "studio:toolbox-tab";

/**
 * The tab the Toolbox opens on: the one left open on this device, else Yours, its home (Featured,
 * then what is starred and suggested), which holds the featured jobs even with nothing pinned.
 */
export function readToolboxTab(): ToolboxTab {
  let stored: ToolboxTab | undefined;
  try {
    const value = globalThis.localStorage?.getItem(TAB_KEY);
    stored = TABS.find((tab) => tab === value);
  } catch {
    stored = undefined;
  }
  return stored ?? "Yours";
}

/** Remembers, for this device, the tab the Toolbox shows. */
export function writeToolboxTab(tab: ToolboxTab): void {
  try {
    globalThis.localStorage?.setItem(TAB_KEY, tab);
  } catch {
    // Storage is full or off: the choice holds until the window closes.
  }
}

const allJobs = (groups: ReadonlyArray<ToolboxGroup>) =>
  groups.flatMap((group) => group.sections.flatMap((section) => section.actions));

/** The pinned jobs the enabled skills can still do, in the order pinned. */
export function pinnedJobs(
  groups: ReadonlyArray<ToolboxGroup>,
  pins: ReadonlyArray<string>,
): ReadonlyArray<HardwareAction> {
  const jobs = allJobs(groups);
  return pins.flatMap((id) => jobs.filter((job) => job.id === id));
}

/**
 * A few jobs made for the file in front's kind and not pinned, taken from each group in turn so
 * they span checking, making and documenting it. A job for any file is no suggestion.
 */
export function suggestedJobs(
  groups: ReadonlyArray<ToolboxGroup>,
  kind: string | null,
  pins: ReadonlyArray<string>,
  limit = 4,
): ReadonlyArray<HardwareAction> {
  if (kind === null) return [];
  const queues = groups.map((group) =>
    group.sections
      .flatMap((section) => section.actions)
      .filter((job) => job.kinds?.includes(kind) === true && !pins.includes(job.id)),
  );
  const picked: HardwareAction[] = [];
  for (
    let round = 0;
    picked.length < limit && queues.some((queue) => queue.length > round);
    round++
  ) {
    for (const queue of queues) {
      const job = queue[round];
      if (job !== undefined && picked.length < limit) picked.push(job);
    }
  }
  return picked;
}

/**
 * The jobs the Toolbox's home leads with, in order: what most parts are taken through first. A
 * drawing check needs a drawing to check against, so it leads only when the project has one.
 */
const FEATURED: ReadonlyArray<string> = [
  "strength",
  "drawing",
  "fit",
  "pictures",
  "render",
  "export",
];

export interface FeaturedJob {
  readonly job: HardwareAction;
  /** Why it leads, from the project itself ("You added bracket.pdf: …"); null for none. */
  readonly reason: string | null;
}

/**
 * The home's Featured row: a few jobs for the file in front, the project's own reasons first (a
 * drawing in its References that the part has not been checked against puts Drawing check first),
 * then `FEATURED` in order. Only jobs that fit the file; with none open, none.
 */
export function featuredJobs(
  groups: ReadonlyArray<ToolboxGroup>,
  kind: string | null,
  nudges: {
    /** A drawing or sketch in the project's References with no drawing check on the part yet. */
    readonly uncheckedDrawing: string | null;
  },
  limit = 3,
): ReadonlyArray<FeaturedJob> {
  if (kind === null) return [];
  const jobs = allJobs(groups).filter((job) => jobFits(job, kind));
  const byId = (id: string) => jobs.find((job) => job.id === id);
  const picked: FeaturedJob[] = [];
  const check = byId("drawing-check");
  if (nudges.uncheckedDrawing !== null && check !== undefined) {
    picked.push({
      job: check,
      reason: `You added ${nudges.uncheckedDrawing}: check the model against every size on it.`,
    });
  }
  for (const id of FEATURED) {
    const job = byId(id);
    if (picked.length >= limit) break;
    if (job !== undefined && !picked.some((entry) => entry.job.id === id))
      picked.push({ job, reason: null });
  }
  return picked;
}

/**
 * A drawing or sketch in the project's References (`brief/references/`, not its drawn pages) that
 * no drawing check has been run against, by its file name; null with none.
 */
export function uncheckedDrawing(
  paths: ReadonlyArray<string>,
  drawingChecked: boolean,
): string | null {
  if (drawingChecked) return null;
  const found = paths.find((path) =>
    /^brief\/references\/[^/]+\.pdf$/i.test(path.replaceAll("\\", "/")),
  );
  return found === undefined ? null : (found.replaceAll("\\", "/").split("/").at(-1) ?? null);
}

/** A row of the Toolbox's home: its title, its tiles, and where See all goes (a group's tab). */
export interface HomeRow {
  readonly title: string;
  readonly jobs: ReadonlyArray<{ readonly job: HardwareAction; readonly subtitle: string }>;
  readonly group: HardwareActionGroup | null;
}

/**
 * The rows under the home's hero, as an app store's front page has them: For this part (the other
 * featured jobs, then a few made for it), Starred, then a row per group of the jobs that fit the
 * file in front, the hero's aside; each tile subtitled by its section ("Simulation"). Empty rows go.
 */
export function homeRows(input: {
  readonly groups: ReadonlyArray<ToolboxGroup>;
  readonly kind: string | null;
  readonly featured: ReadonlyArray<FeaturedJob>;
  readonly suggested: ReadonlyArray<HardwareAction>;
  readonly pinned: ReadonlyArray<HardwareAction>;
}): HomeRow[] {
  const sectionOf = new Map(
    input.groups.flatMap((group) =>
      group.sections.flatMap((section) =>
        section.actions.map((job) => [job.id, section.title] as const),
      ),
    ),
  );
  const tile = (job: HardwareAction) => ({ job, subtitle: sectionOf.get(job.id) ?? "" });
  const hero = input.featured[0]?.job.id;
  const featured = new Set(input.featured.map((entry) => entry.job.id));
  const forPart = [
    ...input.featured.slice(1).map((entry) => entry.job),
    ...input.suggested.filter((job) => !featured.has(job.id)),
  ];
  const rows: HomeRow[] = [
    { title: "For this part", jobs: forPart.map(tile), group: null },
    { title: "Starred", jobs: input.pinned.map(tile), group: null },
    ...input.groups.map((group) => ({
      title: MENU_WORDS[group.group],
      jobs: group.sections
        .flatMap((section) => section.actions)
        .filter((job) => job.id !== hero && input.kind !== null && jobFits(job, input.kind))
        .map(tile),
      group: group.group,
    })),
  ];
  return rows.filter((row) => row.jobs.length > 0);
}

/** Every job whose name, what it makes or group holds each word typed. */
export function searchJobs(
  groups: ReadonlyArray<ToolboxGroup>,
  query: string,
): ReadonlyArray<HardwareAction> {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  if (words.length === 0) return [];
  return allJobs(groups).filter((job) => {
    const text = `${job.label} ${job.gets} ${MENU_WORDS[job.group]}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** A group's jobs, in all its sections. */
export function jobCount(group: ToolboxGroup): number {
  return group.sections.reduce((count, section) => count + section.actions.length, 0);
}

/**
 * Why a job's tile can't be pressed for the file in front (`kind`, null with none open), by what
 * the job works on: "Works on a board or a schematic. Open one to use it." Null when the job fits
 * the file, and its tile runs it.
 */
export function toolboxWorksOn(
  action: HardwareAction,
  kind: string | null,
  start: NewTemplate | null = null,
): string | null {
  if (kind !== null && jobFits(action, kind)) return null;
  if (action.kinds === null) return "Works on any file. Open one to use it.";
  const kinds = action.kinds.map((name) => {
    const lower = lowerName(name);
    // "an assembly", and "an FEA study" as it is said.
    return `${/^([aeiou]|FEA\b)/.test(lower) ? "an" : "a"} ${lower}`;
  });
  const listed = new Intl.ListFormat("en", { type: "disjunction" }).format(kinds);
  if (start !== null) return `Works on ${listed}. This project has none yet: press to start one.`;
  return `Works on ${listed}. Open one to use it.`;
}

/** New's start for what a job works on, the first kind of its list that New makes. */
const START_FOR_KIND: Readonly<Record<string, string>> = {
  Part: "part",
  Assembly: "assembly",
  Board: "board",
  Schematic: "board",
};

/**
 * Null while the project has something the job works on (the tile says to open it), and for a job on
 * any file or on what only another job makes (a study, a drawing alone).
 */
export function toolboxStart(
  action: HardwareAction,
  projectKinds: ReadonlySet<string>,
): NewTemplate | null {
  if (action.kinds === null || action.kinds.some((kind) => projectKinds.has(kind))) return null;
  const id = action.kinds.map((kind) => START_FOR_KIND[kind]).find((found) => found !== undefined);
  return NEW_TEMPLATES.find((template) => template.id === id) ?? null;
}

/**
 * The line under a group none of whose jobs fit the file in front (a CAM job has nothing in
 * Analysis), where every tile is dimmed; null when one fits.
 */
export function toolboxLeftOut(group: ToolboxGroup, kind: string): string | null {
  const fits = group.sections.some((section) =>
    section.actions.some((action) => jobFits(action, kind)),
  );
  if (fits) return null;
  return `None of these work on this ${lowerName(kind)}. Pause on one to see what it works on.`;
}

/**
 * The footer link "See what each makes": the Library open on the group. Its Make one comes back to
 * `from` only while the workspace has a New to take the request (`workspaceOpen`, as ⌘K's Library
 * does); from elsewhere it goes to Home's.
 */
export function toolboxLibraryLink(
  group: HardwareActionGroup,
  where: { readonly workspaceOpen: boolean; readonly from: string },
) {
  return libraryHref({ group, ...(where.workspaceOpen ? { from: where.from } : {}) });
}
