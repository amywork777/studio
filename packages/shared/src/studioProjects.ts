import {
  type StudioProject,
  type StudioProjectBrief,
  usualGeneralTolerance,
} from "@t3tools/contracts";

/**
 * Studio projects (`StudioProject` in contracts): a named grouping of folders
 * with one brief. The server finds a thread's project by its folder and gives
 * the agent the other folders and `studioProjectContext`; the web app shows
 * and edits them.
 */

export const STUDIO_PROCESSES = [
  "Not decided",
  "CNC machining",
  "3D printing (FDM)",
  "3D printing (resin)",
  "3D printing (SLS)",
  "3D printing (metal)",
  "Sheet metal",
  "Laser or waterjet cutting",
  "Injection molding",
  "Casting",
  "Welded fabrication",
  "Printed circuit board",
] as const;

export const EMPTY_STUDIO_BRIEF: StudioProjectBrief = {
  purpose: "",
  requirements: "",
  units: "mm",
  material: "",
  process: "Not decided",
  quantity: "",
  links: "",
  notes: "",
};

export interface StudioProjectKind {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Where its work goes, told to the agent; empty for none. */
  readonly layout: ReadonlyArray<readonly [folder: string, holds: string]>;
  readonly process: (typeof STUDIO_PROCESSES)[number];
}

const MECHANICAL: StudioProjectKind["layout"] = [
  ["parts/", "model scripts and the STEP parts they build"],
  ["assemblies/", "assemblies of the parts"],
  ["drawings/", "engineering drawings and cut files (DXF)"],
  ["studies/", "FEA studies and their results"],
  ["manufacturing/", "CAM jobs, G-code, slices and order files"],
  ["docs/", "plans, reports, test plans and instructions"],
];
const ELECTRICAL: StudioProjectKind["layout"] = [
  ["electronics/", "boards, schematics and harnesses, with their Gerbers and BOMs"],
];

export const STUDIO_PROJECT_KINDS: ReadonlyArray<StudioProjectKind> = [
  {
    id: "part",
    label: "Mechanical part",
    description: "One part or a few: modeled, checked and made.",
    layout: MECHANICAL,
    process: "Not decided",
  },
  {
    id: "product",
    label: "Product",
    description: "An enclosure, its parts and the electronics inside.",
    layout: [...MECHANICAL.slice(0, 2), ...ELECTRICAL, ...MECHANICAL.slice(2)],
    process: "Not decided",
  },
  {
    id: "board",
    label: "Circuit board",
    description: "A board from schematic to fabrication files.",
    layout: [...ELECTRICAL, ["docs/", "plans, reports, test plans and instructions"]],
    process: "Printed circuit board",
  },
  {
    id: "robot",
    label: "Robot",
    description: "Links, joints and actuators, described for simulation.",
    layout: [
      ...MECHANICAL.slice(0, 2),
      ["robots/", "robot descriptions (URDF, SRDF)"],
      ...ELECTRICAL,
      ...MECHANICAL.slice(3),
    ],
    process: "Not decided",
  },
  {
    id: "blank",
    label: "Blank",
    description: "No layout: start from nothing.",
    layout: [],
    process: "Not decided",
  },
];

/** A folder path as compared: no trailing separator. */
export function studioFolderKey(folder: string): string {
  return folder.replace(/[\\/]+$/, "") || folder;
}

/** The folder's last segment, as a folder is named in Studio. */
export function studioFolderName(folder: string): string {
  return studioFolderKey(folder).split(/[\\/]/).pop() || folder;
}

/** The project a folder belongs to, with its id; null when it is in none. */
export function studioProjectAt(
  projects: Readonly<Record<string, StudioProject>>,
  folder: string,
): { readonly id: string; readonly project: StudioProject } | null {
  const key = studioFolderKey(folder);
  for (const [id, project] of Object.entries(projects)) {
    if (project.folders.some((entry) => studioFolderKey(entry) === key)) return { id, project };
  }
  return null;
}

/** The project's folders other than the one a thread works in. */
export function studioOtherFolders(project: StudioProject, folder: string): ReadonlyArray<string> {
  const key = studioFolderKey(folder);
  return project.folders.filter((entry) => studioFolderKey(entry) !== key);
}

/**
 * How an agent shows its work in Studio, in measure: one thing at a time in
 * the viewer, and a report when a job's results are worth keeping. Studio
 * opens the report, or the result, beside the chat.
 */
/** So every profile opens in Studio's workspace as a sketch, not as its sizes only. */
const EDITABLE_SKETCHES = [
  "Draw every 2D profile you extrude, revolve, cut, sweep or loft with `cad.sketch` (the cad skill's `references/sketching.md`): lines, arcs and circles held by relations and dimensions that take the part's named sizes. Studio's workspace opens only those as sketches; a profile made from build123d's shapes (`BuildSketch` with `Rectangle`, `Circle`, `Polygon` and the like) opens as its sizes only.",
  "When you change a part that still has such a profile, redraw it with `cad.sketch` in the same change, keeping its shape and sizes.",
].join("\n\n");

const TALKING_TO_THE_PERSON = [
  "The person is a mechanical engineer, not a programmer. Say what changed in the design and what it means in their words: parts, sizes, materials, fits, checks and drawings.",
  "",
  "- Do not talk about git, commits, branches, a script's line numbers or install steps. Studio keeps a version of the project at the end of every turn, so never offer to commit and never ask whether to.",
  "- When something on this computer had to be set up or worked around to do the job, say so in one plain sentence, not how.",
].join("\n");

/** Recommend, don't only report: the person picks from what you would do. */
const RECOMMEND = [
  "The person wants your recommendation, not only the facts. Every time:",
  "",
  "- Ask with your tool for asking the person a question, if you have one, else as a short list. Put the answer you recommend first, marked (Recommended), with one to three others. Studio takes the recommended answer when they send nothing.",
  "- Never ask an open question without a default. When a job needs many details (a machine, its tools, how the part is held), list the ones you will use and ask only whether to change any.",
  "- Where a wrong guess is unsafe (the controller a CNC post is for), offer the choices with none marked (Recommended), so sending nothing picks none.",
  "- When a check, study or review finds a problem, propose the fix you would make with what you expect it to give (for example: 4 mm sheet, about 1.6 safety factor), as a question whose recommended answer applies it and whose last answer leaves the part as it is. Do not change the part until they pick.",
  "- When the request or an answer gives what a check needs (a load for a strength check, a process for a manufacturing review), run that check in the same turn rather than only recording it.",
  "- Give a check's result as a verdict and the numbers that decide it (for example: passes, 44 MPa against 160 MPa yield, safety factor 3.6). Say what the check leaves out in one sentence, not a paragraph.",
  "- When a job is done, offer the next one it leads to (a strength check after a new part, a drawing or a quote once it passes, CAM for a machined part) as a question, the most useful first.",
  '- Never word a question as a yes-or-no offer ("Would you like me to…?", "Should I…?"). Do the next step yourself when it is plain and changes nothing they have not agreed to; otherwise name the choices in the question itself ("Which wall: 3 mm (Recommended), 2.5 mm, or keep 2 mm?").',
].join("\n");

const SHOW_YOUR_WORK = [
  "The person works beside you in Studio, with the viewer next to this chat. Show them what you make, one thing at a time:",
  "",
  "- When you make or change something they should look at (a part, an assembly, a board, a drawing, a study's result, a toolpath), show it in the viewer (text-to-cad's `cad_open` or `cad_show`) and say in a line what they are looking at. Show the one that matters; do not open every file you touch.",
  "- When a job gives results worth keeping (an analysis, a check, a comparison, a CAM plan, a board review), round them up in a short report in `docs/` in this thread's folder: what was asked, what you did, the results with units, a picture of the result where it helps (made with `cad snapshot`, saved beside the report and linked from it), the verdict, and what to do next. Write it for an engineer, in plain words, without code. Studio opens it beside the chat.",
  "- A small change or a quick answer needs no report.",
  "- Call parts and documents by their names (the servo bracket, its drawing, the FEA report), not by file names. When you point to a file, write its path in code formatting (`parts/servo_bracket.step`): Studio shows it as the part it is, one click from opening it.",
].join("\n");

/** How an answer cites what it rests on; Studio reads the closing block (`splitSources`). */
const SOURCES = [
  "When you answer a question about this project, mark each claim with the source it comes from: [1], [2], numbered in the order you first cite them. End the answer with a block that starts with a line reading exactly `Sources:`, one source a line:",
  "[1] path/to/file.py:12-18",
  "[2] docs/prd.md#The heading",
  "[3] https://example.com/page",
  "[4] own knowledge: what it is",
  "Cite only what you opened in this chat. A claim from your own knowledge, such as a standard you know but did not open, is cited as own knowledge. Studio shows the sources under your answer and marks any it cannot find among what you opened.",
].join("\n");

const THE_README = [
  "Keep `README.md` at the root of this thread's folder: Studio shows it as the project's Overview. Write it for an engineer, in plain words:",
  "",
  "- `#` and the project's name.",
  "- `## What it is`: a short paragraph on what the part or product is for, what it must do, and how it is made.",
  "- `## Decisions`: one line per decision, newest last, exactly as `- <what was decided> (<YYYY-MM-DD>, asked)`, for example `- Support the bike by its front wheel (2026-10-19, asked)`, with `by hand` in place of `asked` for a change the person made by hand (a Hand edit note). Add a line whenever a change settles something. Leave earlier lines as they are; when a decision is reversed, say so on the new line.",
  "- `## Open questions`: one line per question you could not settle, as `- <question> [<what you assumed> | <another answer>]`, for example `- Wall thickness? [2 mm | 3 mm]`, the answer you built with first. Studio asks each as taps on the Overview and sends the person's answer to the chat; take the question out once it is answered and add its decision line.",
  "- Anything else worth keeping in view, such as requirements, under its own `##` heading with a short name. Studio shows every section, folded to its heading, so add to the section a point belongs in rather than starting a dated one.",
  "- Past `What it is`, write short points, not paragraphs: one point a line, its detail nested two spaces under it, and `###` to split a long section.",
].join("\n");

function startingAProject(record: string | null): string {
  const readme =
    "- Write `README.md` as above: what it is, from the description, and a decision line for each thing the description settles.";
  return [
    "When the project is new (this chat's first message describes what to make), start with these, in your first turn and before any research or modelling, so the project's Overview fills in at once:",
    "",
    ...(record === null
      ? [readme]
      : [
          `- Give it a short name of two or three words (for example "Lanyard clip") as \`name\` in \`${record}\`, and one plain sentence on what it is (for example "A clip that holds a badge on a lanyard") as \`brief.purpose\`, never the description's own words.`,
          '- Name the first part after the project: its script and its `@model` function take the project\'s name in snake_case (`parts/lanyard_clip.py` and `def lanyard_clip()` for "Lanyard clip"), so the part and the project read one name.',
          "- In that file, set the setup the description says or clearly implies (a printer named means 3D printing), and commit the file in its folder with git.",
          readme,
        ]),
    "",
    "Then make the first draft in the same turn, without asking first. Where the description leaves something open, pick the common, sensible choice (a 3 mm inside bend radius for 3 mm sheet, clearance holes for the screws it names, a way of making it that suits the part) and build it. Show the draft and list what you assumed in a few short lines. When the description gives a load, run the strength check on the draft in the same turn.",
    "",
    "- After the draft, ask at most one question, about the assumption that matters most, with your tool for asking the person a question: two to four answers, the one you recommend first and marked (Recommended), as Questions and recommendations says. The person changes the rest by asking, or by hand.",
    "- When an answer settles something, add its decision line to the README in the same turn, and change the setup when the answer is part of it.",
  ].join("\n");
}

/** What the person attached stays in the project, so every chat can read it (`attachToReferences`). */
const REFERENCES = [
  "The project's PRD, data sheets and other files the person gave it are in `brief/references/`. Read what bears on the work before you design from it. A message that links a file there has just added it.",
  "",
  "- A PDF there has its sheets drawn beside it in `<name>-pages/` once Studio has read it: `page-01.png` and on, and `pages.json`, written last, with each sheet's size in inches and every callout's words and where it sits (`box`: left, top, width and height as fractions of the sheet). Read the pictures for the drawing and the words for its exact numbers; a sheet with `words: false` is a scan, read from its picture. Until `pages.json` is there, read the PDF itself.",
  "- A PDF, a sketch or a photo the person attaches: first read what it is. A dimensioned drawing shows a part in views with its dimensions, callouts and a title block, or is a sketch with sizes on it. Anything else is a reference: a datasheet, a spec sheet, a moodboard, notes, a photo with no sizes.",
  "- A dimensioned drawing of a part the project has, or one their note asks you to check: compare the part with it, with the `drawing-check` skill, as part of your answer. To model a part from one, open `drawing-check` before you start and follow it: it writes every dimension you read, in the drawing's units, into the check file Studio grades and shows, with what the model measures and every number that does not add up. Do not write your own pass or fail.",
  "- A reference: use what it says for the work. Run no drawing check on it and report no dimensions it lacks; it was never meant to have them.",
].join("\n");

const section = (title: string, body: string) =>
  body.trim() === "" ? [] : [`## ${title}`, "", body.trim(), ""];

/** The person's name and company for every drawing's title block (Settings, Engineering). */
export interface StudioTitleBlock {
  readonly company: string;
  readonly drawnBy: string;
}

/**
 * How every drawing sheet in the project is set up: the brief's standard, units and general
 * tolerance, and the person's title block, as text-to-cad's `Sheet` arguments.
 */
function drawingConventions(brief: StudioProjectBrief, titleBlock: StudioTitleBlock | null) {
  const standard = brief.standard ?? "ISO";
  const tolerance = brief.generalTolerance?.trim() || usualGeneralTolerance(standard, brief.units);
  const text = (value: string) => JSON.stringify(value);
  const company = titleBlock?.company.trim() ?? "";
  const drawnBy = titleBlock?.drawnBy.trim() ?? "";
  return [
    "Set up every drawing sheet (`cad.eng_drawing.Sheet`) this way unless the person asks otherwise:",
    "",
    standard === "ASME"
      ? '- Standard: ASME Y14.5, third angle: `profile=Profile("ASME", "ASME Y14.5-2018")`, `projection="THIRD ANGLE"`'
      : '- Standard: ISO GPS, first angle: `profile=GENERIC`, `projection="FIRST ANGLE"`',
    brief.units === "in"
      ? '- Units: `units="in"`; every size prints in decimal inches, converted from the model\'s millimetres'
      : '- Units: `units="mm"`',
    `- General tolerance: \`general_tolerance=${text(tolerance)}\``,
    company === ""
      ? "- Company: not set; leave `company` empty"
      : `- Company: \`company=${text(company)}\``,
    drawnBy === ""
      ? "- Drawn by: not set; leave `author` empty"
      : `- Drawn by: \`author=${text(drawnBy)}\``,
    "",
    "Never invent a name, a company or a tolerance the person did not give.",
  ].join("\n");
}

/**
 * Where a chat's brainstormed concepts are kept: beside the project's record, outside every
 * folder of the project, so a concept is in the project only once the person uses it.
 */
export function studioConceptsFolder(projectsFolder: string, projectId: string, threadId: string) {
  return `${projectsFolder.replace(/[\\/]+$/, "")}/${projectId}/brainstorm/${threadId}`;
}

/**
 * What the agent is told about the project before any work: its folders
 * (which it can read and edit), how to work, the brief and where work goes.
 */
export function studioProjectContext(
  project: StudioProject,
  folder: string,
  /** The project's own `project.json`, where the agent changes the setup when asked. */
  record: string | null = null,
  titleBlock: StudioTitleBlock | null = null,
  /** This chat's concepts folder (`studioConceptsFolder`). */
  concepts: string | null = null,
): string {
  const { brief } = project;
  const key = studioFolderKey(folder);
  const folders = project.folders.map(
    (entry) => `- \`${entry}\`${studioFolderKey(entry) === key ? " (this thread's folder)" : ""}`,
  );
  const links = brief.links
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
  const layout = STUDIO_PROJECT_KINDS.find((kind) => kind.id === project.template)?.layout ?? [];
  return [
    `# Studio project: ${project.name}`,
    "",
    "This thread is part of a hardware project made of these folders. Read and change files in",
    "any of them as the work needs, by their full paths:",
    "",
    ...folders,
    "",
    `Work in ${brief.units}, and design for the material and process below unless asked otherwise.`,
    "",
    ...section("Purpose", brief.purpose),
    ...section("Requirements", brief.requirements),
    "## Spec",
    "",
    `- Units: ${brief.units}`,
    `- Material: ${brief.material.trim() || "Not decided"}`,
    `- Process: ${brief.process.trim() || "Not decided"}`,
    `- Quantity: ${brief.quantity.trim() || "Not decided"}`,
    "",
    ...section("Drawings", drawingConventions(brief, titleBlock)),
    ...section(
      "Changing the setup",
      record === null
        ? ""
        : [
            `The units, material, process, quantity, drafting standard and general tolerance are the`,
            `project's setup, kept in \`${record}\` under \`brief\`: \`units\` is "mm" or "in",`,
            `\`standard\` is "ISO" or "ASME", \`process\` is one of`,
            `${STUDIO_PROCESSES.map((process) => `"${process}"`).join(", ")}, and \`material\`,`,
            "`quantity` and `generalTolerance` are text. When asked to change the setup, change only those keys in that",
            "file, keep it valid JSON, and commit it in its folder with git. Then update the parts the",
            "change clearly affects in the same turn (a wall thickness, a bend radius, a hole for the new",
            "screws) and say what changed and which checks to rerun. Where it could go two very",
            "different ways, propose the one you recommend as a question instead.",
          ].join("\n"),
    ),
    ...section(
      "Concepts",
      concepts === null
        ? ""
        : `Concepts brainstormed in this chat go in \`${concepts}\`, never in the project's folders: the person moves the one they choose into the project.`,
    ),
    ...section("Links", links),
    ...section("Notes", brief.notes),
    ...section("References", REFERENCES),
    ...section("Sketches the person can edit", EDITABLE_SKETCHES),
    ...section("Talking to the person", TALKING_TO_THE_PERSON),
    ...section("Questions and recommendations", RECOMMEND),
    ...section("Show your work", SHOW_YOUR_WORK),
    ...section("Sources", SOURCES),
    ...section("The README", THE_README),
    ...section("Starting a project", startingAProject(record)),
    ...section(
      "Where work goes",
      layout.length === 0
        ? ""
        : [
            `In \`${project.folders[0] ?? folder}\`, keep the project's work where Studio looks for it:`,
            "",
            ...layout.map(([path, holds]) => `- \`${path}\`: ${holds}`),
          ].join("\n"),
    ),
  ]
    .join("\n")
    .trimEnd();
}
