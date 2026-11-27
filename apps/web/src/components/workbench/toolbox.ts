import type { LucideIcon } from "lucide-react";

import {
  type HardwareAction,
  type HardwareActionGroup,
  type HardwareActionMenu,
  jobFits,
} from "./hardwareActions";
import { libraryHref } from "./library/librarySearch";
import { fileTint, KIND_ICONS, MENU_ICONS, MENU_TINTS, MENU_WORDS } from "./kinds";
import { NEW_TEMPLATES, type NewTemplate } from "./newTemplates";
import { lowerName } from "./partNames";

/** A run of jobs in a group, under its title. */
export interface ToolboxSection {
  readonly title: string;
  readonly actions: ReadonlyArray<HardwareAction>;
}

/** The Toolbox's tabs, by what the engineer means to do: shape it, check it, make it, document it. */
export type ToolboxTab = "Design" | "Check" | "Make" | "Document";

const TOOLBOX_TABS: ReadonlyArray<ToolboxTab> = ["Design", "Check", "Make", "Document"];

/** One of the Toolbox's tabs and its jobs. */
export interface ToolboxGroup {
  readonly tab: ToolboxTab;
  readonly sections: ReadonlyArray<ToolboxSection>;
}

/** What each tab is for, in a line under its name. */
export const TOOLBOX_PURPOSES: Readonly<Record<ToolboxTab, string>> = {
  Design: "Ideas to start from, and parts to buy rather than make.",
  Check: "Will it hold, fit, move and be made as it should?",
  Make: "The files to print, machine, cut or order it.",
  Document: "Drawings, instructions and pictures for whoever builds it.",
};

/** Each tab's picture and hue: Check, Make and Document as their files are, Design as CAD's. */
export const TOOLBOX_ICONS: Readonly<Record<ToolboxTab, LucideIcon>> = {
  Design: KIND_ICONS.CAD,
  Check: MENU_ICONS.Evaluate,
  Make: MENU_ICONS.Manufacture,
  Document: MENU_ICONS.Document,
};

export const TOOLBOX_TINTS: Readonly<Record<ToolboxTab, string>> = {
  Design: fileTint("CAD"),
  Check: MENU_TINTS.Evaluate,
  Make: MENU_TINTS.Manufacture,
  Document: MENU_TINTS.Document,
};

/** The sections whose jobs shape the design itself, not check, make or document it. */
const DESIGN_SECTIONS: ReadonlySet<string> = new Set(["concepts", "standard"]);

/**
 * A job's tab: Design for concepts and off-the-shelf parts, Check for every analysis and every
 * check that it can be made, Make for the files to make it, and Document for the rest.
 */
export function toolboxTabOf(action: Pick<HardwareAction, "group" | "section" | "checks">) {
  if (DESIGN_SECTIONS.has(action.section)) return "Design";
  if (action.group === "Evaluate") return "Check";
  if (action.group === "Manufacture") return action.checks ? "Check" : "Make";
  return "Document";
}

/**
 * Jobs as the Toolbox shows them: always Design, Check, Make and Document, a tab each, every
 * section open. Sections keep the menus' order (the project's own way of making it first, the
 * ones the menus keep under "More" after), each split among the tabs its jobs belong to. A tab's
 * starred jobs (`pins`) lead it under Starred, in the order starred, and leave their sections.
 */
export function toolboxGroups(
  menus: ReadonlyArray<HardwareActionMenu>,
  pins: ReadonlyArray<string> = [],
): ToolboxGroup[] {
  const sections = menus.flatMap((menu) => [...menu.sections, ...menu.others]);
  return TOOLBOX_TABS.map((tab) => {
    const inTab = (job: HardwareAction) => toolboxTabOf(job) === tab;
    const jobs = sections.flatMap((section) => section.actions.filter(inTab));
    const starred = pins.flatMap((id) => jobs.filter((job) => job.id === id));
    const rest = sections
      .map((section) => ({
        title: section.title,
        actions: section.actions.filter((job) => inTab(job) && !pins.includes(job.id)),
      }))
      .filter((section) => section.actions.length > 0);
    return {
      tab,
      sections: [
        ...(starred.length === 0 ? [] : [{ title: "Starred", actions: starred }]),
        ...pairLoneSections(rest),
      ],
    };
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

const TAB_KEY = "studio:toolbox-tab";

/** The tab the Toolbox opens on: the one left open on this device, else Design. */
export function readToolboxTab(): ToolboxTab {
  try {
    const value = globalThis.localStorage?.getItem(TAB_KEY);
    return TOOLBOX_TABS.find((tab) => tab === value) ?? "Design";
  } catch {
    return "Design";
  }
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

/** Every job whose name, what it makes, menu or tab holds each word typed. */
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
    const text = `${job.label} ${job.gets} ${MENU_WORDS[job.group]} ${toolboxTabOf(job)}`;
    return words.every((word) => text.toLowerCase().includes(word));
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
  const listed = kindsListed(action.kinds);
  if (start !== null) return `Works on ${listed}. This project has none yet: press to start one.`;
  return `Works on ${listed}. Open one to use it.`;
}

/** Kinds as a sentence says them: "a part or an assembly", "an FEA study". */
function kindsListed(kinds: ReadonlyArray<string>): string {
  const said = kinds.map((name) => {
    const lower = lowerName(name);
    return `${/^([aeiou]|FEA\b)/.test(lower) ? "an" : "a"} ${lower}`;
  });
  return new Intl.ListFormat("en", { type: "disjunction" }).format(said);
}

/** What a job takes in, for its details: "A part or an assembly", or "Any file". */
export function worksOnWords(action: Pick<HardwareAction, "kinds">): string {
  if (action.kinds === null) return "Any file";
  const listed = kindsListed(action.kinds);
  return listed.charAt(0).toUpperCase() + listed.slice(1);
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
 * The line under a tab none of whose jobs fit the file in front (a CAM job has nothing in
 * Design), where every row is dimmed; null when one fits.
 */
export function toolboxLeftOut(group: ToolboxGroup, kind: string): string | null {
  const fits = group.sections.some((section) =>
    section.actions.some((action) => jobFits(action, kind)),
  );
  if (fits) return null;
  return `None of these work on this ${lowerName(kind)}. Pause on one to see what it works on.`;
}

/** The Library's group for a tab's jobs; Design's span two, so it opens the whole Library. */
const LIBRARY_GROUPS: Readonly<Record<ToolboxTab, HardwareActionGroup | null>> = {
  Design: null,
  Check: "Evaluate",
  Make: "Manufacture",
  Document: "Document",
};

/**
 * The footer link "See what each makes": the Library open on the tab's group. Its Make one comes
 * back to `from` only while the workspace has a New to take the request (`workspaceOpen`, as ⌘K's
 * Library does); from elsewhere it goes to Home's.
 */
export function toolboxLibraryLink(
  tab: ToolboxTab,
  where: { readonly workspaceOpen: boolean; readonly from: string },
) {
  const group = LIBRARY_GROUPS[tab];
  return libraryHref({
    ...(group === null ? {} : { group }),
    ...(where.workspaceOpen ? { from: where.from } : {}),
  });
}
