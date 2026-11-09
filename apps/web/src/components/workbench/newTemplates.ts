/**
 * What a new piece of work can be, the way a CAD system's New dialog offers
 * templates (a part, an assembly, a drawing) but across engineering: studies,
 * manufacturing, robots, documents. Each runs on one
 * of text-to-cad's skills and can be made only while an enabled plugin has it;
 * New shows the rest dimmed, naming the skill (`templateOffers`).
 * A template either makes something new (a name, a folder, units) or works
 * from a part the project already holds (which one).
 */

import type { InstalledPlugin } from "@t3tools/contracts";

import { type Availability, missingSkill } from "./library/skillAvailability";

export type Discipline =
  | "CAD"
  | "Electronics"
  | "Analysis"
  | "Manufacturing"
  | "Robotics"
  | "Documents";

export const DISCIPLINES: ReadonlyArray<Discipline> = [
  "CAD",
  "Electronics",
  "Analysis",
  "Manufacturing",
  "Robotics",
  "Documents",
];

export interface NewTemplate {
  readonly id: string;
  readonly discipline: Discipline;
  readonly label: string;
  readonly description: string;
  /** The text-to-cad skill it runs on; null for one any agent can do. */
  readonly skill: string | null;
  /** `new`: names a new file; `from-part`: works from a part the project holds. */
  readonly source: "new" | "from-part";
  /** Where a new one goes, and what it is called until named. */
  readonly folder: string;
  readonly defaultName: string;
  /** A document's sections, in order: a built-in document template (`documentTemplates.ts`). */
  readonly outline?: ReadonlyArray<string>;
  /** A document template of the person's own: the file the agent follows, by its full path. */
  readonly file?: string;
}

export const NEW_TEMPLATES: ReadonlyArray<NewTemplate> = [
  {
    id: "part",
    discipline: "CAD",
    label: "Part",
    description: "One solid, made to change by its dimensions.",
    skill: "cad",
    source: "new",
    folder: "parts",
    defaultName: "Part",
  },
  {
    id: "assembly",
    discipline: "CAD",
    label: "Assembly",
    description: "Parts placed together with mates, using the project's parts where they fit.",
    skill: "cad",
    source: "new",
    folder: "assemblies",
    defaultName: "Assembly",
  },
  {
    id: "sheet-metal",
    discipline: "CAD",
    label: "Sheet metal part",
    description: "A bent sheet part with its flat pattern.",
    skill: "cad",
    source: "new",
    folder: "parts",
    defaultName: "Sheet metal part",
  },
  {
    id: "drawing",
    discipline: "CAD",
    label: "Engineering drawing",
    description: "A dimensioned engineering drawing of a part.",
    skill: "engineering-drawing",
    source: "from-part",
    folder: "drawings",
    defaultName: "drawing",
  },
  {
    id: "strength-study",
    discipline: "Analysis",
    label: "Strength under load",
    description: "Stress and deflection of a part under its working load.",
    skill: "fea",
    source: "from-part",
    folder: "studies",
    defaultName: "study",
  },
  {
    id: "cam-job",
    discipline: "Manufacturing",
    label: "G-code for CNC",
    description: "Toolpaths and G-code for a 3-axis mill or router.",
    skill: "cam",
    source: "from-part",
    folder: "cam",
    defaultName: "job",
  },
  {
    id: "print",
    discipline: "Manufacturing",
    label: "Slice and print",
    description: "Sliced G-code for an FDM printer, checked before it prints.",
    skill: "print3d",
    source: "from-part",
    folder: "print",
    defaultName: "print",
  },
  {
    id: "cut-file",
    discipline: "Manufacturing",
    label: "Flat pattern DXF",
    description: "A DXF for laser, waterjet or plasma cutting.",
    skill: "cad",
    source: "from-part",
    folder: "cut",
    defaultName: "cut",
  },
  {
    id: "robot",
    discipline: "Robotics",
    label: "Robot description",
    description: "Links, joints and limits of the project's parts, for simulation.",
    skill: "robot-simulation",
    source: "new",
    folder: "robots",
    defaultName: "robot",
  },
  {
    id: "test-plan",
    discipline: "Documents",
    label: "Test plan",
    description: "Steps and pass criteria to prove a part does its job.",
    skill: null,
    source: "from-part",
    folder: "docs",
    defaultName: "test_plan",
  },
  {
    id: "instructions",
    discipline: "Documents",
    label: "Assembly instructions",
    description: "A PDF a technician builds from, with a figure for each step.",
    skill: "work-instructions",
    source: "from-part",
    folder: "docs",
    defaultName: "assembly_instructions",
  },
];

/** Documents a product team writes, as Studio offers them: each section the agent fills, in order. */
export const DOCUMENT_TEMPLATES: ReadonlyArray<NewTemplate> = [
  {
    id: "prd",
    discipline: "Documents",
    label: "Product requirements (PRD)",
    description: "What the product must do and for whom, with measurable targets.",
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: "PRD",
    outline: [
      "Summary",
      "The problem and who has it",
      "Users and use cases",
      "Requirements, each measurable, as must, should and could",
      "Performance targets: loads, life, temperatures, cycles",
      "Size, weight and interfaces",
      "Safety and regulations",
      "Cost target and volumes",
      "How success is measured",
      "Out of scope",
      "Milestones",
      "Open questions",
    ],
  },
  {
    id: "requirements",
    discipline: "Documents",
    label: "Engineering requirements",
    description: "Each requirement with a target, a tolerance and how it is verified.",
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: "Engineering requirements",
    outline: [
      "A table of requirements: ID, requirement, target and tolerance, where it comes from (the PRD's line), how it is verified (analysis, test or inspection), and its status",
      "Interfaces",
      "Environment",
      "Standards",
      "Open questions",
    ],
  },
  {
    id: "fmea",
    discipline: "Documents",
    label: "FMEA",
    description: "Failure modes and effects, ranked by risk, with what to do about each.",
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: "FMEA",
    outline: [
      "A table: item and function, failure mode, effect, severity (1 to 10), cause, occurrence (1 to 10), current controls, detection (1 to 10), risk priority number, recommended action",
      "The highest risks, and what to do first",
    ],
  },
  {
    id: "design-review",
    discipline: "Documents",
    label: "Design review",
    description: "Where the design stands against its requirements, and what to decide.",
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: "Design review",
    outline: [
      "Purpose of the review",
      "The design as it stands, with pictures of its parts",
      "Requirements met, and not met",
      "Check and simulation results",
      "Risks",
      "Decisions needed",
      "Actions, with owners",
    ],
  },
];

/** A template as New offers it: whether it can be made now, else the skill it needs and why. */
export interface TemplateOffer {
  readonly template: NewTemplate;
  readonly availability: Availability;
}

/**
 * Every template New shows, in their order, documents after the rest: on where it needs no skill
 * or the enabled plugins' skills (`skills`) hold its skill, else off, naming that skill and the
 * plugin that lists it, as the library does (`missingSkill`).
 */
export function templateOffers(
  skills: ReadonlySet<string>,
  plugins: ReadonlyArray<InstalledPlugin>,
): TemplateOffer[] {
  return [...NEW_TEMPLATES, ...DOCUMENT_TEMPLATES].flatMap((template): TemplateOffer[] => {
    const { skill } = template;
    if (skill === null || skills.has(skill)) return [{ template, availability: { on: true } }];
    return [{ template, availability: missingSkill(skill, plugins) }];
  });
}

/** Whether a template writes a document of its own (a built-in one's sections, or a file to follow). */
export const isDocumentTemplate = (template: NewTemplate) =>
  template.outline !== undefined || template.file !== undefined;

/** A built-in document as a sentence names it. */
const DOCUMENT_NOUNS: Readonly<Record<string, string>> = {
  prd: "product requirements document (PRD)",
  requirements: "engineering requirements document",
  fmea: "FMEA (failure modes and effects analysis)",
  "design-review": "design review",
};

/** How the agent is told to fill a document: from what the project holds, guessing nothing. */
const FILL =
  "Fill each from the project's brief, its parts, their checks and the decisions in its README; write what is not known yet as an open question, not a guess.";

/** A file name the agent can use as is: lowercase words joined by underscores. */
export function fileStem(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "untitled"
  );
}

export interface NewWork {
  readonly template: NewTemplate;
  readonly name: string;
  readonly folder: string;
  readonly units: "mm" | "in";
  /** For a `from-part` template: the part as the job names it, a link to its file. */
  readonly part: string | null;
  /** What the person wants, in their words. */
  readonly description: string;
  /** A template file as the composer links it (`serializeComposerFileLink`), for one of the person's own. */
  readonly templateLink?: string;
}

/** The job a new piece of work starts as, written for the agent. */
export function newWorkPrompt(work: NewWork): string {
  const { template } = work;
  const wants = work.description.trim();
  const ask = wants === "" ? "" : ` ${wants.replace(/[.\s]*$/, ".")}`;
  const folder = work.folder.trim().replace(/^\/+|\/+$/g, "") || template.folder;
  const target = `${folder}/${fileStem(work.name)}`;
  if (template.file !== undefined) {
    const word = /\.docx?$/i.test(template.file)
      ? " It is a Word file: read its text first (on a Mac, `textutil -convert txt -stdout` on it)."
      : "";
    return `Write ${work.name.trim() || template.label} for this project as ${target}.md, following the template ${work.templateLink ?? template.file} section by section: its order, its headings, and its tables with their columns and row numbers.${word} ${FILL}${ask}`;
  }
  if (template.outline !== undefined) {
    const noun = DOCUMENT_NOUNS[template.id] ?? template.label;
    return `Write the ${noun} for this project as ${target}.md, with these sections: ${template.outline.join("; ")}. ${FILL}${ask}`;
  }
  const part = work.part ?? "the part I choose";
  const units = work.units === "in" ? "inches" : "millimeters";
  switch (template.id) {
    // A part or an assembly is a CAD model (`@model`): its script is the design, and builds it.
    case "part":
      return `Create a new part as a CAD model in ${target}.py, in ${units}.${ask}`;
    case "assembly":
      return `Create a new assembly as a CAD model in ${target}.py, in ${units}, using the project's parts where they fit.${ask}`;
    case "sheet-metal":
      return `Create a new sheet metal part as a CAD model in ${target}.py, in ${units}, with its flat pattern.${ask}`;
    case "drawing":
      return `Make an engineering drawing of ${part} with its key dimensions and tolerances, in ${units}.${ask}`;
    case "strength-study":
      return `Run a strength study on ${part} under its working load. Ask me for the loads, supports and material you need, then tell me where it is weakest and what to change.${ask}`;
    case "cam-job":
      return `Plan a CAM job for ${part} and post its G-code. Ask me for the machine, stock, tools and workholding you need.${ask}`;
    case "print":
      return `Slice ${part} for FDM printing and check the G-code.${ask}`;
    case "cut-file":
      return `Make a cut-ready DXF of ${part} for laser or waterjet cutting.${ask}`;
    case "robot":
      return `Create a new robot description, ${target}, with its links, joints and limits, using the project's parts where they fit.${ask}`;
    case "test-plan":
      return `Write a test plan for ${part} as ${folder}/${fileStem(work.name)}.md: what to test, how, and the pass criteria.${ask}`;
    case "instructions":
      return `Write work instructions for ${part} with the work-instructions skill, as ${folder}/${fileStem(work.name)}.pdf: one action per step, each with a figure of the assembly at that step.${ask}`;
    default:
      return `${template.label}: ${target}.${ask}`;
  }
}
