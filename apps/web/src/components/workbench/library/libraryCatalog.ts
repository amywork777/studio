/**
 * The library: every kind of document Studio makes, and every installed plugin's skills, each
 * with its example in one of the examples Studio ships (`studio-sample/servo-bracket`, unless
 * `libraryExamples.json` names another). A document gathers
 * under one name the templates New offers and the part menus' jobs that make it. The library
 * page lists these; New, the part menus and Settings link into it.
 */

import type { InstalledPlugin } from "@t3tools/contracts";
import { formatProviderSkillDisplayName } from "@t3tools/shared/inlineSkills";

import {
  ACTION_SECTIONS,
  HARDWARE_ACTIONS,
  type HardwareAction,
  type HardwareActionGroup,
  MORE_LABELS,
} from "../hardwareActions";
import { jobOfSkill } from "../jobSkills";
import { MENU_WORDS } from "../kinds";
import { DOCUMENT_TEMPLATES, NEW_TEMPLATES, type NewTemplate } from "../newTemplates";
import libraryExamples from "./libraryExamples.json";
import { SAMPLE_ID } from "./sampleProject";
import { type Availability, missingSkill, TEXT_TO_CAD } from "./skillAvailability";

export { type Availability } from "./skillAvailability";

export interface LibraryDocument {
  readonly kind: "document";
  /** `doc:<slug>`, or `own:<file>` for one of the person's own templates. */
  readonly id: string;
  readonly name: string;
  readonly what: string;
  readonly give: string;
  /** "It asks you first", or null when it asks nothing first. */
  readonly asks: string | null;
  /** "You get". */
  readonly gets: string;
  /** New's templates that make it, by id. */
  readonly templates: ReadonlyArray<string>;
  /** The part menus' jobs that make it, by id. */
  readonly actions: ReadonlyArray<string>;
  /** Its example's file in its example (`exampleIn`); null where no example could make one. */
  readonly example: string | null;
  /** The example its example's file is in (`studio-sample/<id>`); null with no example. */
  readonly exampleIn: string | null;
  /** For one of the person's own templates: that template, as New offers it. */
  readonly ownTemplate?: NewTemplate;
}

export interface LibrarySkill {
  readonly kind: "skill";
  /** `skill:<pluginId>/<name>`. */
  readonly id: string;
  readonly pluginId: string;
  readonly pluginName: string;
  readonly name: string;
  /** Its name as the chat shows it: its own display name, else its name title-cased. */
  readonly displayName: string;
  readonly description: string;
  /** What its tile says: `description`, or a shorter cut of it (`SKILL_BLURBS`). */
  readonly blurb: string;
  readonly tryAsking: string | null;
  /** Its plugin is enabled. */
  readonly on: boolean;
  readonly example: string | null;
  readonly exampleIn: string | null;
}

export type LibraryEntry = LibraryDocument | LibrarySkill;

/**
 * Each entry's example: its file in an example Studio ships (`sample`, the servo bracket where it
 * names none).
 */
const EXAMPLES: Readonly<
  Record<string, { readonly sample?: string; readonly example: string } | null>
> = libraryExamples;

/** An entry's example file and the example it is in, by the entry's id; nulls where it has none. */
function exampleOf(id: string) {
  const item = EXAMPLES[id] ?? null;
  return {
    example: item?.example ?? null,
    exampleIn: item === null ? null : (item.sample ?? SAMPLE_ID),
  };
}

const TEMPLATES = [...NEW_TEMPLATES, ...DOCUMENT_TEMPLATES];

/** Every job a skill runs, in the menus' order. */
const jobsRunBy = (skill: string) =>
  HARDWARE_ACTIONS.filter((job) => job.skill === skill).map((job) => job.id);

/** The `cad` skill's manufacturing checks: its checks in Manufacture, one per way of making it. */
const manufacturingChecks = () =>
  HARDWARE_ACTIONS.filter(
    (job) => job.skill === "cad" && job.checks && job.group === "Manufacture",
  ).map((job) => job.id);

/** A document type, with its example from `libraryExamples.json`. */
const doc = (
  entry: Omit<LibraryDocument, "kind" | "example" | "exampleIn" | "ownTemplate">,
): LibraryDocument => ({
  kind: "document",
  ...entry,
  ...exampleOf(entry.id),
});

/** The document types, each named as New or the menus already name it. */
export const LIBRARY_DOCUMENTS: ReadonlyArray<LibraryDocument> = [
  doc({
    id: "doc:part",
    name: "Part",
    templates: ["part"],
    actions: [],
    what: "One solid, made to change by its dimensions.",
    give: "What it is for, and any sizes you already know.",
    asks: "The material and how it will be made.",
    gets: "The model script that makes it, in parts/, and a STEP of it when you ask.",
  }),
  doc({
    id: "doc:assembly",
    name: "Assembly",
    templates: ["assembly"],
    actions: [],
    what: "Parts placed together with mates, using the project's parts where they fit.",
    give: "The parts, and how they go together.",
    asks: null,
    gets: "The model script that places its parts by their mates, in assemblies/, and a STEP of the whole when you ask.",
  }),
  doc({
    id: "doc:sheet-metal",
    name: "Sheet metal part",
    templates: ["sheet-metal"],
    actions: [],
    what: "A bent sheet part with its flat pattern.",
    give: "What it is for, and the sheet it is bent from.",
    asks: "The inside bend radius and K-factor of the shop that bends it.",
    gets: "A STEP of the bent part and one of its flat pattern, with the scripts that make them, in parts/.",
  }),
  doc({
    id: "doc:drawing",
    name: "Engineering drawing",
    templates: ["drawing"],
    actions: ["drawing"],
    what: "A dimensioned PDF drawing with a title block, ready for a shop.",
    give: "The part.",
    asks: "Its tolerances, when the project's requirements don't give them.",
    gets: "A PDF sheet of views with measured dimensions, hole callouts and notes, and a title block naming the material.",
  }),
  doc({
    id: "doc:pmi",
    name: "3D PMI (MBD)",
    templates: [],
    actions: ["pmi"],
    what: "Datums, tolerances and notes on the model itself: a model-based definition a shop's CAM and inspection read.",
    give: "The part or assembly.",
    asks: "Its tolerances and how it is located, when the project's requirements don't give them.",
    gets: "Datums, dimensions with tolerances, geometric tolerances and notes on the model, in an AP242 STEP with its PMI.",
  }),
  doc({
    id: "doc:simulation",
    name: "Simulation",
    templates: ["strength-study"],
    actions: jobsRunBy("fea"),
    what: "Where a part or a bonded assembly is most stressed under its load, and whether it holds.",
    give: "The part, the load and where it pushes.",
    asks: "How it is held, and the material.",
    gets: "A study with the stress plot, the peak stress, the safety factor and a pass or fail.",
  }),
  doc({
    id: "doc:fit-mass",
    name: "Fit, motion and mass",
    templates: [],
    actions: ["fit", "motion", "mass"],
    what: "Whether an assembly's parts fit and move without hitting, and its weight and center of mass.",
    give: "The assembly.",
    asks: null,
    gets: "A report of where its parts touch, its tightest gaps and its range of motion.",
  }),
  doc({
    id: "doc:manufacturing-check",
    name: "Manufacturing check",
    templates: [],
    actions: manufacturingChecks(),
    what: "A review for the way it will be made, one finding at a time: 3D printing, CNC machining, sheet metal or molding.",
    give: "The part and its process.",
    asks: null,
    gets: "Findings, each passing, to fix or to check, with the fix.",
  }),
  doc({
    id: "doc:cam-job",
    name: "CAM job",
    templates: ["cam-job"],
    actions: ["toolpaths"],
    what: "Toolpaths and G-code for a 3-axis mill or router.",
    give: "The part.",
    asks: "The machine, the stock, your tools and how the part is held.",
    gets: "G-code for each setup, and its toolpaths to look over before cutting.",
  }),
  doc({
    id: "doc:print",
    name: "3D print",
    templates: ["print"],
    actions: ["slice"],
    what: "Sliced G-code for an FDM printer, checked before it prints.",
    give: "The part.",
    asks: "Your printer, filament and print settings.",
    gets: "A sliced print, checked against your printer and filament. You start the print yourself.",
  }),
  doc({
    id: "doc:cut-file",
    name: "Cut file",
    templates: ["cut-file"],
    actions: ["dxf"],
    what: "A DXF for laser, waterjet or plasma cutting.",
    give: "The part.",
    asks: null,
    gets: "A DXF of the outline and holes to cut, any bend lines on a layer of their own, in cut/.",
  }),
  doc({
    id: "doc:order",
    name: "Check for SendCutSend",
    templates: [],
    actions: ["sendcutsend"],
    what: "A check of the upload against SendCutSend's own rules, before you order.",
    give: "The cut file or STEP, and the material, thickness and services you want.",
    asks: "The material, thickness and services, where they aren't clear.",
    gets: "A preflight saying whether the upload is ready to send, each finding with SendCutSend's rule. Nothing is uploaded or ordered.",
  }),
  doc({
    id: "doc:standard-parts",
    name: "Off-the-shelf parts",
    templates: [],
    actions: ["standard-parts"],
    what: "Screws, bearings, motors and other parts you buy, with where to buy them.",
    give: "The part that needs them.",
    asks: null,
    gets: "Each part with where to buy it, and its STEP file where the maker offers one.",
  }),
  doc({
    id: "doc:circuit-board",
    name: "Circuit board",
    templates: ["board"],
    actions: jobsRunBy("pcb"),
    what: "A KiCad board and its schematic, its checks, and the files a fab and an enclosure need.",
    give: "The circuit in words, or a board or schematic you already have.",
    asks: "Which fab it is for, and the current its tracks carry.",
    gets: "The board and schematic as KiCad files, each check's findings with where they are and the fix, the fabrication files, and the board as STEP.",
  }),
  doc({
    id: "doc:export",
    name: "Export files",
    templates: [],
    actions: ["export"],
    what: "The part as STEP, STL and 3MF files for other CAD tools, printers and shops.",
    give: "The part.",
    asks: null,
    gets: "The files, saved beside the part.",
  }),
  doc({
    id: "doc:parts-list",
    name: "Parts list",
    templates: [],
    actions: ["parts-list"],
    what: "Every part of an assembly: how many, its material, and how it is made or where to buy it.",
    give: "The assembly.",
    asks: null,
    gets: "A table in docs/ of each part, then what the model leaves out and what is still open.",
  }),
  doc({
    id: "doc:instructions",
    name: "Assembly instructions",
    templates: ["instructions"],
    actions: ["instructions"],
    what: "Work instructions a technician builds from: one action per step, each with a figure of the assembly at that step.",
    give: "The assembly.",
    asks: "How formal it is (a prototype build order, production, or audited), and your company's template if you have one.",
    gets: "A PDF in docs/: the parts, materials and tools, then the steps with their torque or cure values.",
  }),
  doc({
    id: "doc:exploded",
    name: "Exploded view",
    templates: [],
    actions: ["exploded"],
    what: "Pictures of an assembly pulled apart, to show how its parts go together.",
    give: "The assembly.",
    asks: null,
    gets: "Exploded-view pictures as PNGs, in pictures/.",
  }),
  doc({
    id: "doc:pictures",
    name: "Pictures from every side",
    templates: [],
    actions: ["pictures"],
    what: "Pictures of a part or assembly from the front, side, top and an angle, for a presentation.",
    give: "The part or assembly.",
    asks: null,
    gets: "Four PNGs, front, side, top and angle, in pictures/.",
  }),
  doc({
    id: "doc:motion-video",
    name: "Motion to play",
    templates: [],
    actions: ["play-motion"],
    what: "An assembly moving through its range of motion, played in the viewer.",
    give: "The assembly, with the joints that move.",
    asks: null,
    gets: "A motion in the assembly's model script, which the viewer's Motion plays.",
  }),
  doc({
    id: "doc:test-plan",
    name: "Test plan",
    templates: ["test-plan"],
    actions: ["test-plan"],
    what: "Steps and pass criteria to prove a part does its job.",
    give: "The part or assembly.",
    asks: null,
    gets: "A plan in docs/: what it must do, the equipment, and each test with how to run it and what passes.",
  }),
  doc({
    id: "doc:write-up",
    name: "Write up the results",
    templates: [],
    actions: ["write-up"],
    what: "A short report of what was asked, what was done and what was found.",
    give: "The result to write up, such as a study.",
    asks: null,
    gets: "A report in docs/ with the results in units, pictures of them, the verdict and what to do next.",
  }),
  doc({
    id: "doc:robot",
    name: "Robot description",
    templates: ["robot"],
    actions: ["robot-files"],
    what: "Links, joints and limits of an assembly, for simulation.",
    give: "The assembly, and which parts move.",
    asks: null,
    gets: "A URDF and its meshes in robots/, validated, and an SRDF for MoveIt and an SDF for Gazebo when you want them.",
  }),
  doc({
    id: "doc:prd",
    name: "Product requirements (PRD)",
    templates: ["prd"],
    actions: [],
    what: "What the product must do and for whom, with measurable targets.",
    give: "What you are making, and for whom.",
    asks: null,
    gets: "A document in docs/ with the sections it always covers, shown before you start. Your own template can replace it.",
  }),
  doc({
    id: "doc:requirements",
    name: "Engineering requirements",
    templates: ["requirements"],
    actions: [],
    what: "Each requirement with a target, a tolerance and how it is verified.",
    give: "The PRD, or what the product must do.",
    asks: null,
    gets: "A table in docs/: each requirement's target, the PRD line it comes from, how it is verified and its status.",
  }),
  doc({
    id: "doc:fmea",
    name: "FMEA",
    templates: ["fmea"],
    actions: [],
    what: "Failure modes and effects, ranked by risk, with what to do about each.",
    give: "The part or product.",
    asks: null,
    gets: "A table of each failure mode, its effect, its risk priority number and the action, then the highest risks and what to do first.",
  }),
  doc({
    id: "doc:design-review",
    name: "Design review",
    templates: ["design-review"],
    actions: [],
    what: "Where the design stands against its requirements, and what to decide.",
    give: "The project as it stands.",
    asks: null,
    gets: "A review in docs/: the design with pictures, the requirements met and not, the results, the risks, and the decisions and actions to take.",
  }),
];

/** What to ask each of text-to-cad's skills, about the sample project. */
const TRY_ASKING: Readonly<Record<string, string>> = {
  cad: "Make a bracket for an MG996R servo from 2 mm aluminium.",
  cam: "Toolpaths for a 3-axis mill with a 6 mm end mill.",
  "engineering-drawing": "Make a drawing of the bracket for the shop.",
  fea: "Will it hold 20 N at the horn?",
  pcb: "Run the design rule check on my board and tell me what to fix.",
  print3d: "Slice the cable clip in PETG and send it to my P1S.",
  "robot-simulation": "Make the URDF for the servo mount.",
  sendcutsend: "Is the bracket ready to order from SendCutSend in 2 mm 5052?",
  "work-instructions": "Write the work instructions for building the servo mount.",
};

/** A job's one name: the skill that runs it reads as its library entry does, whatever its own files say. */
const JOB_NAMES: Readonly<Record<string, string>> = {
  fea: "Simulation",
};

/**
 * What a tile says of each of text-to-cad's skills: its `agents/openai.yaml` `short_description` in
 * its own words, cut to a phrase that fits the tile's two lines, so it ends whole and the words
 * that set it apart show.
 */
const SKILL_BLURBS: Readonly<Record<string, string>> = {
  cad: "Generate CAD artifacts",
  cam: "3-axis milling and drilling toolpaths",
  "engineering-drawing": "Dimensioned PDF of a CAD part",
  fea: "Linear static stress studies",
  pcb: "Edit and check KiCad circuit boards",
  print3d: "Slice and print on Bambu Lab printers",
  "robot-simulation": "URDF, SRDF and SDF robot descriptions",
  sendcutsend: "Review DXF/STEP against specs",
  "work-instructions": "Step-by-step assembly PDF",
};

/**
 * text-to-cad's skills as they name themselves (`agents/openai.yaml`'s `display_name`), for where
 * no installed plugin names them, so a skill reads the same whether text-to-cad is installed or not.
 */
const TEXT_TO_CAD_NAMES: Readonly<Record<string, string>> = {
  ...JOB_NAMES,
  cad: "CAD",
  cam: "CAM",
  "engineering-drawing": "Engineering Drawing",
  pcb: "PCB",
  print3d: "3D Printing",
  "robot-simulation": "Robot simulation",
  sendcutsend: "SendCutSend",
  "work-instructions": "Work Instructions",
};

/**
 * New's templates behind an entry that New makes from nothing, the ones every New offers, or the
 * person's own template for an own entry. A template that works from a part (a drawing, a study)
 * is no New's: its entry is reached through its menu jobs.
 */
const templatesBehind = (entry: LibraryDocument) =>
  entry.ownTemplate === undefined
    ? entry.templates.flatMap((id) =>
        TEMPLATES.filter((template) => template.id === id && template.source === "new"),
      )
    : [entry.ownTemplate];

/** The part menus' jobs behind an entry. */
const jobsBehind = (entry: LibraryDocument) =>
  entry.actions.flatMap((id) => HARDWARE_ACTIONS.filter((job) => job.id === id));

/** The jobs behind an entry: a document type's, a job skill's one, or all a text-to-cad skill does. */
function jobsOfEntry(entry: LibraryEntry): ReadonlyArray<HardwareAction> {
  if (entry.kind === "document") return jobsBehind(entry);
  if (entry.pluginId !== TEXT_TO_CAD) return [];
  const job = jobOfSkill(entry.name);
  return job === null ? HARDWARE_ACTIONS.filter((each) => each.skill === entry.name) : [job];
}

/**
 * What an entry needs that Studio does not bring (`HardwareAction.needs`), for its tile to say
 * before a press: said where every job behind it needs the same thing, in that job's own words.
 */
export function entryNeeds(entry: LibraryEntry): string | null {
  const needs = new Set(jobsOfEntry(entry).map((job) => job.needs ?? null));
  const [only] = needs;
  return needs.size === 1 ? (only ?? null) : null;
}

/**
 * The skills that make a document type, by its templates and its jobs. A type with one lives inside
 * that skill's detail (Makes); only a type no skill makes gets a tile of its own.
 */
export function skillsBehind(entry: LibraryDocument): ReadonlyArray<string> {
  return [
    ...new Set(
      [...templatesBehind(entry), ...jobsBehind(entry)].flatMap((maker) =>
        maker.skill === null ? [] : [maker.skill],
      ),
    ),
  ];
}

/** The entry one of New's templates belongs to. */
export function entryOfTemplate(templateId: string): LibraryDocument | null {
  return LIBRARY_DOCUMENTS.find((entry) => entry.templates.includes(templateId)) ?? null;
}

/** The entry one of the part menus' jobs belongs to. */
export function entryOfAction(actionId: string): LibraryDocument | null {
  return LIBRARY_DOCUMENTS.find((entry) => entry.actions.includes(actionId)) ?? null;
}

/**
 * Made by: its skills, each by its name or as `name` shows it (`skillName`), a template no skill
 * runs as "the <label> template", else the agent.
 */
export function madeBy(
  entry: LibraryDocument,
  name: (skill: string) => string = (skill) => skill,
): ReadonlyArray<string> {
  const makers = [
    ...templatesBehind(entry).map((template) =>
      template.skill === null ? `the ${template.label} template` : name(template.skill),
    ),
    ...jobsBehind(entry).flatMap((job) => (job.skill === null ? [] : [name(job.skill)])),
  ];
  return makers.length === 0 ? ["the agent"] : [...new Set(makers)];
}

/** Where a job sits: its menu and section, or the menu's heading over its submenus. */
const menuPlace = (job: HardwareAction) => {
  const section = ACTION_SECTIONS.find((candidate) => candidate.id === job.section);
  const heading = section?.more === true ? MORE_LABELS[job.group] : (section?.title ?? job.section);
  return `${MENU_WORDS[job.group]} › ${heading}`;
};

/** Find it in: New's discipline for each template, then each job's place in its menu. */
export function findItIn(entry: LibraryDocument): ReadonlyArray<string> {
  return [
    ...new Set([
      ...templatesBehind(entry).map((template) => `New › ${template.discipline}`),
      ...jobsBehind(entry).map(menuPlace),
    ]),
  ];
}

/** Make one: the first template behind it, which New makes from nothing (not from a part). */
export function makeOneTemplate(entry: LibraryDocument): NewTemplate | null {
  return templatesBehind(entry)[0] ?? null;
}

/** Each of the person's own templates as an entry of its own, named by its file. */
export function ownTemplateEntries(files: ReadonlyArray<NewTemplate>): LibraryDocument[] {
  return files.flatMap((template): LibraryDocument[] =>
    template.file === undefined
      ? []
      : [
          {
            kind: "document",
            id: `own:${template.file}`,
            name: template.label,
            what: template.description,
            give: "What it is for, in your words.",
            asks: null,
            gets: "A document in docs/ that follows your template section by section.",
            templates: [template.id],
            actions: [],
            example: null,
            exampleIn: null,
            ownTemplate: template,
          },
        ],
  );
}

/** A skill's name as the chat shows it: its own display name, else its name title-cased. */
const chatName = (name: string, displayName: string | null) =>
  formatProviderSkillDisplayName(displayName === null ? { name } : { name, displayName });

/**
 * A skill's one name wherever the library shows it (its card and detail, Made by, what an entry
 * needs): as an installed plugin names it, else as text-to-cad names its own skills, else as the
 * chat would title it.
 */
export function skillName(name: string, skills: ReadonlyArray<LibrarySkill>): string {
  return (
    skills.find((skill) => skill.name === name)?.displayName ??
    TEXT_TO_CAD_NAMES[name] ??
    chatName(name, null)
  );
}

/**
 * A skill's own prompt as a person would say it: "Use $cad to make it" is written for the agent, so
 * it reads "Make it", and any other `$name` loses its sign.
 */
export function plainPrompt(prompt: string): string {
  return prompt
    .replace(/^Use \$[\w-]+ to (\p{L})/u, (_, first: string) => first.toUpperCase())
    .replace(/\$([a-z][\w-]*)/gi, "$1");
}

/**
 * A job skill's tile (`jobSkills.ts`): the skill that does its job, by the name it shows, and the
 * example of the document type it makes.
 */
function jobTile(name: string) {
  const job = jobOfSkill(name);
  if (job === null) return null;
  return {
    blurb: `With the ${TEXT_TO_CAD_NAMES[job.skill] ?? chatName(job.skill, null)} skill`,
    example: exampleOf(entryOfAction(job.id)?.id ?? ""),
  };
}

/**
 * Every skill of every installed plugin, on while its plugin is enabled: text-to-cad's own first,
 * then Studio's job skills it carries, in the menus' order.
 */
export function librarySkills(plugins: ReadonlyArray<InstalledPlugin>): LibrarySkill[] {
  return plugins.flatMap((plugin) =>
    (plugin.skillDetails ?? [])
      .map((detail): LibrarySkill => {
        const id = `skill:${plugin.id}/${detail.name}`;
        const ours = plugin.id === TEXT_TO_CAD;
        const job = ours ? jobTile(detail.name) : null;
        if (job !== null) {
          return {
            kind: "skill",
            id,
            pluginId: plugin.id,
            pluginName: plugin.displayName,
            name: detail.name,
            displayName: chatName(detail.name, detail.displayName),
            description: detail.description,
            blurb: job.blurb,
            tryAsking: detail.defaultPrompt === null ? null : plainPrompt(detail.defaultPrompt),
            on: plugin.enabled,
            ...job.example,
          };
        }
        return {
          kind: "skill",
          id,
          pluginId: plugin.id,
          pluginName: plugin.displayName,
          name: detail.name,
          displayName:
            (ours ? JOB_NAMES[detail.name] : undefined) ??
            chatName(detail.name, detail.displayName),
          description: detail.description,
          blurb: (ours ? SKILL_BLURBS[detail.name] : undefined) ?? detail.description,
          tryAsking:
            (ours ? TRY_ASKING[detail.name] : undefined) ??
            (detail.defaultPrompt === null ? null : plainPrompt(detail.defaultPrompt)),
          on: plugin.enabled,
          ...(ours ? exampleOf(id) : { example: null, exampleIn: null }),
        };
      })
      .toSorted((a, b) => jobRank(a.name) - jobRank(b.name)),
  );
}

/** A skill's place among its plugin's: a job skill's in the menus, after every other skill. */
const jobRank = (name: string) => {
  const job = jobOfSkill(name);
  return job === null ? -1 : HARDWARE_ACTIONS.indexOf(job);
};

/** The menus, in the order Studio shows them. */
const MENUS = [...new Set(ACTION_SECTIONS.map((section) => section.group))];

/** A skill's jobs in one menu, in its order; a submenu's jobs show as the menu's heading, once. */
const menuLabels = (group: HardwareActionGroup, skill: string) => [
  ...new Set(
    ACTION_SECTIONS.filter((section) => section.group === group).flatMap((section) => {
      const jobs = HARDWARE_ACTIONS.filter(
        (job) => job.section === section.id && job.skill === skill,
      );
      if (jobs.length === 0) return [];
      return section.more === true ? [MORE_LABELS[group]] : jobs.map((job) => job.label);
    }),
  ),
];

/**
 * Shows up as: "<place>: <labels>" for New, by the templates it makes from nothing, then each menu
 * that offers the skill.
 */
export function showsUpAs(skill: string): ReadonlyArray<string> {
  // A job skill is its one job: where the menus offer it.
  const job = jobOfSkill(skill);
  if (job !== null) {
    const section = ACTION_SECTIONS.find((candidate) => candidate.id === job.section);
    return [
      `${MENU_WORDS[job.group]}: ${section?.more === true ? MORE_LABELS[job.group] : job.label}`,
    ];
  }
  const places = [
    {
      place: "New",
      labels: TEMPLATES.filter(
        (template) => template.skill === skill && template.source === "new",
      ).map((template) => template.label),
    },
    ...MENUS.map((group) => ({ place: MENU_WORDS[group], labels: menuLabels(group, skill) })),
  ];
  return places
    .filter(({ labels }) => labels.length > 0)
    .map(({ place, labels }) => `${place}: ${labels.join(", ")}`);
}

/**
 * On when any template or job behind it is offered: it needs no skill, or an enabled plugin has
 * its skill. Otherwise it names the first skill it needs, and the plugin that lists it.
 */
export function availability(
  entry: LibraryDocument,
  plugins: ReadonlyArray<InstalledPlugin>,
): Availability {
  const enabled = new Set(plugins.flatMap((plugin) => (plugin.enabled ? plugin.skills : [])));
  const needs = [...templatesBehind(entry), ...jobsBehind(entry)].map(({ skill }) => skill);
  if (needs.some((skill) => skill === null || enabled.has(skill))) return { on: true };
  const missing = needs.find((skill): skill is string => skill !== null);
  return missing === undefined ? { on: true } : missingSkill(missing, plugins);
}
