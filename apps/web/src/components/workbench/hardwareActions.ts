import type { STUDIO_PROCESSES } from "@t3tools/shared/studioProjects";

/**
 * Hardware first, code second (`brand.json` `"focus": "hardware"`). The
 * workbench groups a part's jobs the way CAD tools do: Evaluate (simulations,
 * fit, motion, mass), Manufacture by way of making it (a way's check and its
 * outputs together, the project's own way first), and Document. Each menu
 * keeps its everyday jobs in titled sections and the rest in a submenu each.
 * Every job is one the agent already knows through one of text-to-cad's
 * skills, offered only while an enabled plugin has that skill and only on the
 * kinds of file it applies to. A pick writes the job into the composer,
 * naming the part, to edit before sending.
 */
export const HARDWARE_FOCUS = import.meta.env.VITE_APP_FOCUS === "hardware";

export type HardwareActionGroup = "Evaluate" | "Manufacture" | "Document";

/** How the project's parts are made, as its setup says (`STUDIO_PROCESSES`). */
export type MakingProcess = (typeof STUDIO_PROCESSES)[number];

/** A section of a menu's jobs. */
export interface ActionSectionDef {
  readonly id: string;
  readonly group: HardwareActionGroup;
  readonly title: string;
  /** In Manufacture, the setup's processes this way of making is: the project's own leads. */
  readonly processes?: ReadonlyArray<MakingProcess>;
  /** Kept in a submenu under the menu's "more" heading, not in the menu itself. */
  readonly more?: boolean;
}

/**
 * The sections, as text-to-cad's skills cover the work: `fea` for strength, `cad` for fit,
 * motion, mass, pictures and video and for exporting STEP, STL and 3MF, `dfam-check` for each way of printing (FDM, SLA/DLP, SLS and
 * MJF, metal powder bed), `dfm` for machining, sheet metal and molding, and `urdf`, `sdf` and `srdf` for robot descriptions.
 */
export const ACTION_SECTIONS: ReadonlyArray<ActionSectionDef> = [
  { id: "simulation", group: "Evaluate", title: "Simulation" },
  { id: "fit-mass", group: "Evaluate", title: "Fit, motion and mass" },
  { id: "results", group: "Evaluate", title: "Results" },
  {
    id: "printing",
    group: "Manufacture",
    title: "3D printing",
    processes: [
      "3D printing (FDM)",
      "3D printing (resin)",
      "3D printing (SLS)",
      "3D printing (metal)",
    ],
  },
  {
    id: "machining",
    group: "Manufacture",
    title: "Machining and molding",
    processes: ["CNC machining", "Injection molding"],
  },
  {
    id: "sheet",
    group: "Manufacture",
    title: "Sheet metal and cutting",
    processes: ["Sheet metal", "Laser or waterjet cutting"],
  },
  { id: "files", group: "Manufacture", title: "Files and off-the-shelf parts" },
  { id: "drawings", group: "Document", title: "Drawings" },
  { id: "building", group: "Document", title: "Building it" },
  { id: "pictures", group: "Document", title: "Pictures and video" },
  { id: "reports", group: "Document", title: "Reports" },
  { id: "robot", group: "Document", title: "Robot description", more: true },
];

export interface HardwareAction {
  readonly id: string;
  readonly group: HardwareActionGroup;
  /** Its section (`ACTION_SECTIONS`). */
  readonly section: string;
  /** The one way of making it this job is for, where its section holds two. */
  readonly process?: MakingProcess;
  readonly label: string;
  /**
   * What you get: what its skill makes, its Toolbox tile's tooltip, in the voice of its library
   * entry's "You get" (`libraryCatalog.ts`). A sentence of at most 100 characters.
   */
  readonly gets: string;
  /** The text-to-cad skill the job runs on; null for one any agent can do. */
  readonly skill: string | null;
  /** The part kinds it applies to, as the context strip names them (`describePart`); null for any. */
  readonly kinds: ReadonlyArray<string> | null;
  /** It reads the part and reports, rather than making or writing something: starters lead with one. */
  readonly checks: boolean;
  /** The job, naming the part as given: a link to its file, which the composer shows as the part. */
  readonly prompt: (file: string) => string;
  /** The job as a starter names it, short: "Check bike hook for FDM printing". */
  readonly short: (name: string) => string;
}

const SOLID = ["Part", "Assembly"];
const PRINTABLE = ["Part", "Assembly", "Mesh"];

/** A printability check by the `dfam-check` skill. */
const printCheck = (
  id: string,
  section: string,
  method: string,
  looks: string,
): HardwareAction => ({
  id,
  group: "Manufacture",
  section,
  label: `Check for ${method}`,
  gets: `Findings for ${method}, each passing, to fix or to check, with the fix.`,
  skill: "dfam-check",
  kinds: PRINTABLE,
  checks: true,
  prompt: (file) => `Check ${file} for ${method}: ${looks}. Tell me what to change.`,
  short: (name) => `Check ${name} for ${method}`,
});

const JOBS: ReadonlyArray<HardwareAction> = [
  {
    id: "strength",
    group: "Evaluate",
    section: "simulation",
    label: "Strength under load",
    gets: "A study with the stress plot, the peak stress, the safety factor and a pass or fail.",
    skill: "fea",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Check ${file} for strength under its working load. Ask me for the loads, supports and material you need, then tell me where it is weakest and what to change.`,
    short: (name) => `Check ${name} under load`,
  },
  {
    id: "fit",
    group: "Evaluate",
    section: "fit-mass",
    label: "Fit and clearance",
    gets: "A report of any collision, where the parts touch and the tightest gaps.",
    skill: "cad",
    kinds: ["Assembly"],
    checks: true,
    prompt: (file) =>
      `Check the parts in ${file} for collisions and tight clearances, and tell me where they touch or rub and by how much.`,
    short: (name) => `Check the fit of ${name}`,
  },
  {
    id: "motion",
    group: "Evaluate",
    section: "fit-mass",
    label: "Range of motion",
    gets: "A report of the closest gap and any collision at each step of its travel.",
    skill: "cad",
    kinds: ["Assembly"],
    checks: true,
    prompt: (file) =>
      `Move ${file} through its range of motion and tell me where parts collide, bind or run out of travel.`,
    short: (name) => `Range of motion of ${name}`,
  },
  {
    id: "mass",
    group: "Evaluate",
    section: "fit-mass",
    label: "Weight and center of mass",
    gets: "The weight, volume and center of mass in the project's material, and what weighs most.",
    skill: "cad",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Tell me the weight, volume and center of mass of ${file} in the project's material, and what makes up most of the weight.`,
    short: (name) => `Weight of ${name}`,
  },
  {
    id: "fea-results",
    group: "Evaluate",
    section: "results",
    label: "Explain these results",
    gets: "A walk through the results: what fails, by how much, and what to change.",
    skill: "fea",
    kinds: ["FEA study", "Result"],
    checks: true,
    prompt: (file) =>
      `Walk me through the results in ${file} and tell me what fails, by how much, and what to change.`,
    short: (name) => `Explain the ${name} study`,
  },
  {
    id: "cam-results",
    group: "Evaluate",
    section: "results",
    label: "Explain this job",
    gets: "A walk through the job: its cycle time, its tools and what to fix before cutting.",
    skill: "cam",
    kinds: ["CAM job"],
    checks: true,
    prompt: (file) =>
      `Walk me through ${file} and tell me the cycle time, the tools, and anything to fix before cutting.`,
    short: (name) => `Explain the ${name} job`,
  },
  printCheck(
    "fdm",
    "printing",
    "FDM printing",
    "overhangs, thin walls, small holes, bridges and bed fit, and the best build orientation",
  ),
  {
    id: "slice",
    group: "Manufacture",
    section: "printing",
    label: "Slice for FDM",
    gets: "Sliced G-code from OrcaSlicer, checked against your printer and filament.",
    skill: "gcode",
    kinds: PRINTABLE,
    checks: false,
    prompt: (file) => `Slice ${file} for FDM printing and check the G-code.`,
    short: (name) => `Slice ${name} for printing`,
  },
  {
    id: "bambu",
    group: "Manufacture",
    section: "printing",
    label: "Print on a Bambu printer",
    gets: "The print opened in Bambu Connect or Bambu Studio, for you to check and start.",
    skill: "bambu-labs",
    kinds: PRINTABLE,
    checks: false,
    prompt: (file) =>
      `Slice ${file} and get it ready on my Bambu printer. Check with me before the print starts.`,
    short: (name) => `Print ${name} on the Bambu`,
  },
  printCheck(
    "resin",
    "printing",
    "resin printing",
    "supports, thin walls, small holes and fine features, and the best orientation",
  ),
  printCheck(
    "sls",
    "printing",
    "SLS printing",
    "wall thickness, small holes and features, and powder trapped inside",
  ),
  printCheck(
    "mjf",
    "printing",
    "MJF printing",
    "wall thickness, small holes and features, and powder trapped inside",
  ),
  printCheck(
    "metal-print",
    "printing",
    "metal printing",
    "overhangs and supports, thin walls, small holes and bridges, and the best orientation",
  ),
  {
    id: "cnc",
    group: "Manufacture",
    section: "machining",
    process: "CNC machining",
    label: "Check for CNC machining",
    gets: "Findings for CNC machining, each passing, to fix or to check, with the fix.",
    skill: "dfm",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Check ${file} for CNC machining: tool access, internal corners, thin walls and setups. Tell me what to change.`,
    short: (name) => `Check ${name} for CNC machining`,
  },
  {
    id: "toolpaths",
    group: "Manufacture",
    section: "machining",
    process: "CNC machining",
    label: "G-code for CNC",
    gets: "G-code for each setup, and its toolpaths to look over before cutting.",
    skill: "cam",
    kinds: ["Part"],
    checks: false,
    prompt: (file) =>
      `Plan the toolpaths for ${file} and post its G-code. Ask me for the machine, stock, tools and workholding you need.`,
    short: (name) => `Post G-code for ${name}`,
  },
  {
    id: "sheet-metal",
    group: "Manufacture",
    section: "sheet",
    label: "Check as sheet metal",
    gets: "Findings for sheet metal, each passing, to fix or to check, with the fix.",
    skill: "dfm",
    kinds: ["Part"],
    checks: true,
    prompt: (file) =>
      `Check ${file} as a sheet metal part: bend radii, reliefs, and hole and edge distances. Tell me what to change.`,
    short: (name) => `Check ${name} as sheet metal`,
  },
  {
    id: "flat-pattern",
    group: "Manufacture",
    section: "sheet",
    label: "Flat pattern DXF",
    gets: "The flat pattern as a DXF, its bend lines on a layer of their own.",
    skill: "dxf",
    kinds: ["Part"],
    checks: false,
    prompt: (file) =>
      `Make the flat pattern of ${file} as a DXF with its bend lines, ready to cut.`,
    short: (name) => `Flat pattern of ${name}`,
  },
  {
    id: "dxf",
    group: "Manufacture",
    section: "sheet",
    label: "Cut-ready DXF",
    gets: "A DXF of the outline and holes to cut, each cut closed and drawn once.",
    skill: "dxf",
    kinds: ["Part", "Drawing"],
    checks: false,
    prompt: (file) => `Make a cut-ready DXF of ${file} for laser or waterjet cutting.`,
    short: (name) => `Make a cut file of ${name}`,
  },
  {
    id: "sendcutsend",
    group: "Manufacture",
    section: "sheet",
    label: "Check for SendCutSend",
    gets: "A preflight against SendCutSend's rules, bends included. Nothing is uploaded or ordered.",
    skill: "sendcutsend",
    kinds: ["Part", "Drawing"],
    checks: false,
    prompt: (file) =>
      `Check ${file} for a SendCutSend order: material, thickness, any bends and the other services it needs.`,
    short: (name) => `Get ${name} ready for SendCutSend`,
  },
  {
    id: "molding",
    group: "Manufacture",
    section: "machining",
    process: "Injection molding",
    label: "Check for injection molding",
    gets: "Findings for injection molding, each passing, to fix or to check, with the fix.",
    skill: "dfm",
    kinds: ["Part"],
    checks: true,
    prompt: (file) =>
      `Check ${file} for injection molding: draft, wall thickness and undercuts. Tell me what to change.`,
    short: (name) => `Check ${name} for injection molding`,
  },
  {
    id: "standard-parts",
    group: "Manufacture",
    section: "files",
    label: "Off-the-shelf parts",
    gets: "Each part's STEP file from step.parts, checked against its record.",
    skill: "step-parts",
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Find the off-the-shelf parts ${file} needs, such as fasteners and bearings, with where to buy them, and import their STEP files.`,
    short: (name) => `Find standard parts for ${name}`,
  },
  {
    id: "export-step",
    group: "Manufacture",
    section: "files",
    label: "STEP",
    gets: "A STEP file, saved beside the part.",
    skill: "cad",
    kinds: SOLID,
    checks: false,
    prompt: (file) => `Export ${file} as STEP.`,
    short: (name) => `Export ${name} as STEP`,
  },
  {
    id: "export-mesh",
    group: "Manufacture",
    section: "files",
    label: "STL and 3MF",
    gets: "An STL and a 3MF, saved beside the part.",
    skill: "cad",
    kinds: SOLID,
    checks: false,
    prompt: (file) => `Export ${file} as STL and 3MF.`,
    short: (name) => `Export ${name} as STL and 3MF`,
  },
  {
    id: "drawing",
    group: "Document",
    section: "drawings",
    label: "Engineering drawing",
    gets: "A PDF sheet of views with measured dimensions, hole callouts, notes and a title block.",
    skill: "engineering-drawing",
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Make an engineering drawing of ${file} with its key dimensions and tolerances.`,
    short: (name) => `Draw ${name}`,
  },
  {
    id: "pmi",
    group: "Document",
    section: "drawings",
    label: "3D PMI",
    gets: "Datums, tolerances and notes on the model itself (model-based definition), exported as AP242 STEP.",
    skill: "cad",
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Add 3D PMI to ${file} as the cad skill's references/pmi.md says: datums on the faces it is located by, the sizes and positions that matter as tolerances, and a general profile note. Then export it as AP242 STEP with its PMI.`,
    short: (name) => `3D PMI for ${name}`,
  },
  {
    id: "parts-list",
    group: "Document",
    section: "building",
    label: "Parts list",
    gets: "A table in docs/ of each part: how many, its material, and how it is made or bought.",
    skill: null,
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) =>
      `Make a parts list for ${file} in docs/: each part, how many, its material, and how it is made or where to buy it.`,
    short: (name) => `Parts list for ${name}`,
  },
  {
    id: "instructions",
    group: "Document",
    section: "building",
    label: "Assembly instructions",
    gets: "A PDF a technician builds from: one action per step, each with a figure of the assembly.",
    skill: "work-instructions",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) =>
      `Write work instructions for ${file} with the work-instructions skill, as a PDF in docs/: one action per step, each with a figure of the assembly at that step.`,
    short: (name) => `Assembly instructions for ${name}`,
  },
  {
    id: "exploded",
    group: "Document",
    section: "building",
    label: "Exploded view",
    gets: "Exploded-view PNGs that show how its parts go together.",
    skill: "cad",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) => `Make exploded-view pictures of ${file} that show how its parts go together.`,
    short: (name) => `Exploded view of ${name}`,
  },
  {
    id: "pictures",
    group: "Document",
    section: "pictures",
    label: "Pictures from every side",
    gets: "Four PNGs, from the front, side, top and an angle, for a presentation.",
    skill: "cad",
    kinds: PRINTABLE,
    checks: false,
    prompt: (file) =>
      `Make pictures of ${file} from the front, side, top and an angle, for a presentation.`,
    short: (name) => `Pictures of ${name}`,
  },
  {
    id: "motion-video",
    group: "Document",
    section: "pictures",
    label: "Motion video",
    gets: "An MP4 video of the assembly moving through its range of motion.",
    skill: "cad",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) => `Make a video of ${file} moving through its range of motion.`,
    short: (name) => `Video of ${name} moving`,
  },
  {
    id: "test-plan",
    group: "Document",
    section: "reports",
    label: "Test plan",
    gets: "A plan in docs/: what to test, how, and the pass criteria.",
    skill: null,
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Write a test plan for ${file} in docs/: what to test, how, and the pass criteria.`,
    short: (name) => `Test plan for ${name}`,
  },
  {
    id: "write-up",
    group: "Document",
    section: "reports",
    label: "Write up the results",
    gets: "A report in docs/: the results with units, pictures, the verdict and what to do next.",
    skill: null,
    kinds: null,
    checks: false,
    prompt: (file) =>
      `Round up what this thread did and found on ${file} in a short report in docs/: what was asked, what was done, the results with units, pictures of the results, the verdict, and what to do next.`,
    short: (name) => `Write up the results for ${name}`,
  },
  {
    id: "urdf",
    group: "Document",
    section: "robot",
    label: "URDF",
    gets: "A validated URDF with its links, joints, limits and a mesh for each link.",
    skill: "urdf",
    kinds: ["Part", "Assembly"],
    checks: false,
    prompt: (file) => `Make a URDF for ${file} with its links, joints and limits.`,
    short: (name) => `Describe ${name} as a robot`,
  },
  {
    id: "sdf",
    group: "Document",
    section: "robot",
    label: "SDF for Gazebo",
    gets: "A validated SDF model for Gazebo, with its links, joints and meshes.",
    skill: "sdf",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) => `Make an SDF model of ${file} for simulating it in Gazebo.`,
    short: (name) => `SDF model of ${name}`,
  },
  {
    id: "srdf",
    group: "Document",
    section: "robot",
    label: "SRDF for MoveIt",
    gets: "A validated SRDF for MoveIt: planning groups, end effectors and collisions to ignore.",
    skill: "srdf",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) =>
      `Make a MoveIt SRDF for ${file}: its planning groups, end effectors and the collisions to ignore.`,
    short: (name) => `MoveIt SRDF for ${name}`,
  },
];

/** The skills whose manufacturing checks write a review with a findings table (`nodes/dfmReview.ts`). */
const REVIEWS = new Set(["dfm", "dfam-check", "sendcutsend"]);

/** What a check's review is saved as, after the part's file name: `_cnc_dfm.md`, `_sendcutsend.md`. */
export const reviewSuffix = (id: string) =>
  id === "sendcutsend" ? "_sendcutsend.md" : `_${id.replaceAll("-", "_")}_dfm.md`;

/**
 * The jobs whose results stay where they already go: a strength study in its study files, an
 * off-the-shelf part in the project as a part, an explanation in the chat.
 */
const KEPT_IN_PLACE = new Set(["strength", "standard-parts", "fea-results", "cam-results"]);

/** Where a job saves what it makes, as its ask says it: the part's own folder in `outputs/<job>/`. */
export const outputsLine = (id: string) =>
  ` Save what it makes in outputs/${id}/<part>/, where <part> is the part's file name without its extension, with the settings it used (a slicer's complete presets, say), and if that folder already has settings, use them unless I ask otherwise.`;

/**
 * Every job, saying where its results go wherever it is started (a Toolbox tile, ⌘K, a block on
 * the Nodes canvas), so they stay with the part: a manufacturing check's review in docs/, and what
 * any other job makes in `outputs/` (`nodes/jobOutputs.ts`).
 */
export const HARDWARE_ACTIONS: ReadonlyArray<HardwareAction> = JOBS.map((action) => {
  if (
    action.skill !== null &&
    REVIEWS.has(action.skill) &&
    (action.checks || action.id === "sendcutsend")
  ) {
    return {
      ...action,
      prompt: (file: string) =>
        `${action.prompt(file)} Save the review in docs/ as the part's file name followed by ${reviewSuffix(action.id)}, its findings table giving each finding's result as pass, fail, review or unverified.`,
    };
  }
  if (KEPT_IN_PLACE.has(action.id)) return action;
  return { ...action, prompt: (file: string) => `${action.prompt(file)}${outputsLine(action.id)}` };
});

const GROUPS: ReadonlyArray<HardwareActionGroup> = ["Evaluate", "Manufacture", "Document"];

/** A run of a menu's jobs, under its section's title. */
export interface ActionSection {
  readonly title: string;
  readonly actions: ReadonlyArray<HardwareAction>;
}

export interface HardwareActionMenu {
  readonly group: HardwareActionGroup;
  /** In the menu itself: in Manufacture, the project's own way of making it first. */
  readonly sections: ReadonlyArray<ActionSection>;
  /** The rest, a submenu each, under `moreLabel`. */
  readonly others: ReadonlyArray<ActionSection>;
  /** The heading over the submenus: "More simulations", "Other ways to make it". */
  readonly moreLabel: string;
}

/** What each group is for, in a line under its name in the Toolbox. */
export const GROUP_PURPOSES: Record<HardwareActionGroup, string> = {
  Evaluate: "Will it hold, fit and move as it should?",
  Manufacture: "Check it can be made, and make the files to make it.",
  Document: "Drawings, instructions and pictures for whoever builds it.",
};

export const MORE_LABELS: Record<HardwareActionGroup, string> = {
  Evaluate: "More simulations",
  Manufacture: "Other ways to make it",
  Document: "More documents",
};

/**
 * The jobs for a part of this kind that the enabled plugins' skills can do, by menu, in order.
 * Manufacture puts the project's own way of making it first, whole, and the other ways apart;
 * until the project has chosen one, every way waits apart.
 */
export function hardwareActions(
  kind: string,
  skills: ReadonlySet<string>,
  process: MakingProcess | string = "Not decided",
): HardwareActionMenu[] {
  const decided = process.trim() !== "" && process !== "Not decided";
  const offered = HARDWARE_ACTIONS.filter(
    (action) =>
      (action.kinds === null || action.kinds.includes(kind)) &&
      (action.skill === null || skills.has(action.skill)),
  );
  const filled = (defs: ReadonlyArray<ActionSectionDef>) =>
    defs
      .map((def) => ({
        title: def.title,
        actions: offered
          .filter((action) => action.section === def.id)
          .toSorted((a, b) => Number(b.process === process) - Number(a.process === process)),
      }))
      .filter((section) => section.actions.length > 0);
  return GROUPS.flatMap((group): HardwareActionMenu[] => {
    const defs = ACTION_SECTIONS.filter((def) => def.group === group);
    const ours = (def: ActionSectionDef) =>
      def.processes !== undefined && def.processes.some((entry) => entry === process);
    // A way of making it is in the menu itself only when it is the project's own.
    const inMenu = (def: ActionSectionDef) =>
      def.processes === undefined ? !def.more : decided && ours(def);
    const sections = filled([
      ...defs.filter(ours),
      ...defs.filter((def) => inMenu(def) && !ours(def)),
    ]);
    const others = filled(defs.filter((def) => !inMenu(def)));
    if (sections.length === 0 && others.length === 0) return [];
    const moreLabel = group === "Manufacture" && !decided ? "Ways to make it" : MORE_LABELS[group];
    return [{ group, sections, others, moreLabel }];
  });
}
