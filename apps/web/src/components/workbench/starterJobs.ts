import { withToolLine } from "./toolUsed";
import type { ProjectBrief } from "./briefFolder";
import { type HardwareAction, hardwareActions } from "./hardwareActions";
import { MENU_WORDS } from "./kinds";
import { describePart } from "./partContext";
import { partLink } from "./partLink";
import { lowerName } from "./partNames";
import type { ProjectFile, ProjectGroup } from "./projectFiles";

export interface Starter {
  /**
   * What the chip says: the Toolbox tile's name for the lead part ("Check for CNC machining"), the
   * part it means for any other ("Check L bracket for CNC machining").
   */
  readonly label: string;
  /** The kind of work it starts, which gives the chip its icon and hue (`kinds.ts`). */
  readonly kind: ProjectGroup;
  /** What goes into the composer, naming the part by a link to its file. */
  readonly prompt: string;
}

/** The kinds of project file a starter can be about, by group. */
const STARTER_GROUPS = new Set(["CAD", "Electronics", "Analysis", "Drawings"]);
const LIMIT = 4;

/** A study's picture: a `.glb` beside its numbers (`checkResults.ts`), a result, not a part. */
const isStudyPicture = (path: string, paths: ReadonlySet<string>) =>
  /\.glb$/i.test(path) &&
  (paths.has(path.replace(/\.glb$/i, ".json")) ||
    paths.has(path.replace(/\.glb$/i, ".result.json")));

/**
 * Starters come from the lead part (`leadPartOf`), then recently used parts, boards and studies,
 * each kind of job once and only what installed skills can do. With no files it starts from the
 * brief; with neither, nothing. `paths` keep numbers beside pictures.
 */
export function projectStarters(
  recentFiles: ReadonlyArray<ProjectFile>,
  skills: ReadonlySet<string>,
  brief: ProjectBrief | null,
  paths: ReadonlySet<string> = new Set(recentFiles.map((file) => file.path)),
  lead: ProjectFile | null = null,
): Starter[] {
  const subjects = [
    ...(lead === null ? [] : [lead]),
    ...recentFiles.filter((file) => file.path !== lead?.path),
  ]
    .filter((file) => STARTER_GROUPS.has(file.group) && !isStudyPicture(file.path, paths))
    .slice(0, 3);
  const starters: Starter[] = [];
  const add = (starter: Starter) => {
    if (starters.length < LIMIT && !starters.some((entry) => entry.label === starter.label)) {
      starters.push(starter);
    }
  };
  const jobs = subjects.map((file) => {
    // A cadgen 0.8 model is listed by its document id, with the name the engine gives it.
    const { name, kind } =
      file.document === undefined
        ? describePart(file.path, null)
        : { name: file.title, kind: file.kind };
    return {
      link: partLink({ path: file.path, name: file.title }),
      label: (action: HardwareAction) =>
        file.path === lead?.path ? action.label : action.short(lowerName(name)),
      // Every job for the part in menu order, and of its ways of making it only the project's
      // own: a chip never guesses how a part is made, so a project that has not said gets none.
      // Starters start work: a write-up (no skill of its own), an export or a bought part is none.
      all: hardwareActions(kind, skills, brief?.process)
        .flatMap((menu) =>
          menu.group === "Manufacture" ? menu.sections : [...menu.sections, ...menu.others],
        )
        .flatMap((section) => section.actions)
        .filter(
          (action) =>
            action.skill !== null &&
            action.section !== "files" &&
            (action.process === undefined || action.process === brief?.process),
        ),
    };
  });
  // Each kind of job once, from the first of them that takes it, so the starters cover the
  // work rather than one job on every part: a check of how it would be made (the brief's way
  // first), a check of strength, fit or mass, a document, then a way to make it. A kind no
  // installed skill does is left out, not filled with a second job of another kind.
  const kinds: ReadonlyArray<(action: HardwareAction) => boolean> = [
    (action) => action.group === "Manufacture" && action.checks,
    (action) => action.group === "Evaluate",
    (action) => action.group === "Document",
    (action) => action.group === "Manufacture" && !action.checks,
  ];
  for (const isKind of kinds) {
    for (const job of jobs) {
      const action = job.all.find(isKind);
      if (action) {
        add({
          label: job.label(action),
          kind: MENU_WORDS[action.group],
          prompt: withToolLine(action.label, action.prompt(job.link)),
        });
        break;
      }
    }
  }
  if (starters.length === 0 && brief !== null && brief.purpose.trim() !== "") {
    add({
      label: "Start the design from the brief",
      kind: "CAD",
      prompt: `Design the first part of this project from its brief: ${brief.purpose.trim()}`,
    });
  }
  return starters;
}
