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
 * The sections, as text-to-cad's skills cover the work: `fea` for strength and its results; `cad`
 * for fit, motion, mass, pictures and a motion to play, exporting STEP, STL, 3MF and DXF, and checking each way
 * of making it (printing, machining, sheet metal, molding); `print3d` for slicing and printing; `cam`
 * for toolpaths and its jobs; `pcb` for circuit boards; and `robot-simulation` for robot files.
 */
export const ACTION_SECTIONS: ReadonlyArray<ActionSectionDef> = [
  { id: "simulation", group: "Evaluate", title: "Simulation" },
  { id: "fit-mass", group: "Evaluate", title: "Fit, motion and mass" },
  { id: "board-checks", group: "Evaluate", title: "Circuit board" },
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
  { id: "board-files", group: "Manufacture", title: "Circuit board" },
  { id: "drawings", group: "Document", title: "Drawings" },
  { id: "building", group: "Document", title: "Building it" },
  { id: "pictures", group: "Document", title: "Pictures and motion" },
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
  /**
   * What it needs that Studio does not bring: a program the person installs, or a download on first
   * use, as its skill's own files say (`text-to-cad/skills/<skill>/SKILL.md`). A sentence after
   * `gets` on its tile's line (`jobLine`).
   */
  readonly needs?: string;
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

/** A job's line on its tile and in its skill: what it makes, then what it needs, where it needs any. */
export const jobLine = (job: HardwareAction): string =>
  job.needs === undefined ? job.gets : `${job.gets} ${job.needs}`;

/**
 * The `pcb` skill's rule checks, exports and drawing of a board run KiCad's tools from kicode, which
 * the `cad` command downloads the first time a board needs them (the size is its SKILL.md's).
 */
const BOARD_TOOLS = "Downloads its board tools on first use, about 100 MB.";

const SOLID = ["Part", "Assembly"];
const PRINTABLE = ["Part", "Assembly", "Mesh"];

/** A printability check by the `cad` skill's manufacturing check for printing. */
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
  skill: "cad",
  kinds: PRINTABLE,
  checks: true,
  prompt: (file) => `Check ${file} for ${method}: ${looks}. Tell me what to change.`,
  short: (name) => `Check ${name} for ${method}`,
});

export const HARDWARE_ACTIONS: ReadonlyArray<HardwareAction> = [
  {
    id: "strength",
    group: "Evaluate",
    section: "simulation",
    label: "Strength under load",
    gets: "A study with the stress plot, the peak stress, the safety factor and a pass or fail.",
    skill: "fea",
    kinds: [...SOLID, "FEA study", "Result"],
    checks: true,
    prompt: (file) =>
      `Check ${file} for strength under its working load. If it is a study already, walk me through its results; if not, ask me for the loads, supports and material you need. Then tell me where it is weakest, by how much, and what to change.`,
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
      `Check the parts in ${file} for collisions with an exact interference check, and for tight clearances, and tell me where they touch or rub and by how much.`,
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
    label: "Slice and print",
    gets: "G-code from OrcaSlicer checked against your printer, or the print opened on your Bambu.",
    needs: "Needs OrcaSlicer installed.",
    skill: "print3d",
    kinds: PRINTABLE,
    checks: false,
    prompt: (file) =>
      `Slice ${file} for FDM printing and check the G-code. Ask me which printer and filament; on a Bambu printer, get the print ready there and check with me before it starts.`,
    short: (name) => `Slice ${name} for printing`,
  },
  printCheck(
    "resin",
    "printing",
    "resin printing",
    "supports, thin walls, small holes and fine features, and the best orientation",
  ),
  {
    id: "powder",
    group: "Manufacture",
    section: "printing",
    label: "Check for powder printing",
    gets: "Findings for SLS or MJF printing, each passing, to fix or to check, with the fix.",
    skill: "cad",
    kinds: PRINTABLE,
    checks: true,
    prompt: (file) =>
      `Check ${file} for powder printing (SLS or MJF): wall thickness, small holes and features, and powder trapped inside. Tell me what to change.`,
    short: (name) => `Check ${name} for powder printing`,
  },
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
    skill: "cad",
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
    needs: "Needs FreeCAD 1.1 or newer installed.",
    skill: "cam",
    kinds: ["Part", "CAM job"],
    checks: false,
    prompt: (file) =>
      `Plan the toolpaths for ${file} and post its G-code. If it is a CAM job already, walk me through its cycle time, its tools and anything to fix before cutting; if not, ask me for the machine, stock, tools and workholding you need.`,
    short: (name) => `Post G-code for ${name}`,
  },
  {
    id: "sheet-metal",
    group: "Manufacture",
    section: "sheet",
    label: "Check as sheet metal",
    gets: "Findings for sheet metal, each passing, to fix or to check, with the fix.",
    skill: "cad",
    kinds: ["Part"],
    checks: true,
    prompt: (file) =>
      `Check ${file} as a sheet metal part: bend radii, reliefs, and hole and edge distances. Tell me what to change.`,
    short: (name) => `Check ${name} as sheet metal`,
  },
  {
    id: "dxf",
    group: "Manufacture",
    section: "sheet",
    label: "Flat pattern DXF",
    gets: "A DXF ready to cut: the outline and holes, and any bend lines on a layer of their own.",
    skill: "cad",
    kinds: ["Part", "Drawing"],
    checks: false,
    prompt: (file) =>
      `Make a cut-ready DXF of ${file} for laser or waterjet cutting. If it is bent sheet metal, flatten it and put its bend lines on a layer of their own.`,
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
    skill: "cad",
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
    gets: "Each part with where to buy it, and its STEP file where the maker offers one.",
    skill: null,
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Find the off-the-shelf parts ${file} needs, such as fasteners and bearings, with where to buy them, and import their STEP files.`,
    short: (name) => `Find standard parts for ${name}`,
  },
  {
    id: "board-check",
    group: "Evaluate",
    section: "board-checks",
    label: "Board checks",
    gets: "KiCad's rule checks, each finding with where it is on the board or schematic and the fix.",
    needs: BOARD_TOOLS,
    skill: "pcb",
    kinds: ["Board", "Schematic"],
    checks: true,
    prompt: (file) =>
      `Run KiCad's rule checks on ${file}: the design rule check on a board, the electrical rule check on a schematic. Tell me each problem, where it is, and how to fix it.`,
    short: (name) => `Check ${name}`,
  },
  {
    id: "board-review",
    group: "Evaluate",
    section: "board-checks",
    label: "Review before ordering",
    gets: "A review against the fab's limits, decoupling, track widths for current and the parts list.",
    needs: BOARD_TOOLS,
    skill: "pcb",
    kinds: ["Board"],
    checks: true,
    prompt: (file) =>
      `Review ${file} before I order it: the fab's limits, decoupling, track widths for the current they carry, and whether every part can be bought. Ask me which fab and what current you need.`,
    short: (name) => `Review the ${name} board`,
  },
  {
    id: "board-fab",
    group: "Manufacture",
    section: "board-files",
    label: "Fabrication files",
    gets: "Gerbers, drill files, the parts list and placement files, ready to upload to a fab.",
    needs: BOARD_TOOLS,
    skill: "pcb",
    kinds: ["Board"],
    checks: false,
    prompt: (file) =>
      `Export the fabrication files for ${file}: gerbers, drill files, the parts list and the placement file. Ask me which fab it is for.`,
    short: (name) => `Fabrication files for ${name}`,
  },
  {
    id: "board-step",
    group: "Manufacture",
    section: "board-files",
    label: "Board STEP",
    gets: "The board with its parts as a STEP file, to design its enclosure around.",
    needs: BOARD_TOOLS,
    skill: "pcb",
    kinds: ["Board"],
    checks: false,
    prompt: (file) =>
      `Export ${file} as a STEP file with its parts, to design an enclosure around.`,
    short: (name) => `Export the ${name} board as STEP`,
  },
  {
    id: "export",
    group: "Manufacture",
    section: "files",
    label: "Export",
    gets: "STEP, STL and 3MF files, saved beside the part.",
    skill: "cad",
    kinds: SOLID,
    checks: false,
    prompt: (file) => `Export ${file} as STEP, STL and 3MF.`,
    short: (name) => `Export ${name}`,
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
    // text-to-cad records no video (0.8 and later): the model carries the motion and the viewer plays it.
    id: "play-motion",
    group: "Document",
    section: "pictures",
    label: "Motion to play",
    gets: "A motion of the assembly through its range of travel, which the viewer's Motion plays.",
    skill: "cad",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) =>
      `Add a motion to ${file} that takes it through its range of motion, for the viewer's Motion to play. If it has one already, tell me its name and how to play it.`,
    short: (name) => `Motion of ${name} to play`,
  },
  {
    id: "render",
    group: "Document",
    section: "pictures",
    label: "Photoreal render",
    gets: "A photoreal still or turntable from Blender, a quick draft first, then the final.",
    needs: "Downloads Blender on first use, about 330 MB on a Mac and 420 MB on Windows.",
    skill: "render",
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Render ${file} as a photoreal hero shot with Blender: a quick draft first for me to look at, then the final.`,
    short: (name) => `Render ${name}`,
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
    id: "robot-files",
    group: "Document",
    section: "robot",
    label: "Robot files",
    gets: "A validated URDF with its links, joints, limits and meshes, and a MoveIt SRDF if you want.",
    skill: "robot-simulation",
    kinds: ["Part", "Assembly"],
    checks: false,
    prompt: (file) =>
      `Make a URDF for ${file} from its joints, limits and materials, and validate it. Ask me whether I also want a MoveIt SRDF.`,
    short: (name) => `Describe ${name} as a robot`,
  },
  {
    id: "mujoco",
    group: "Document",
    section: "robot",
    label: "MuJoCo model",
    gets: "An MJCF for MuJoCo with collision shapes, joint dynamics and actuators, checked for model health.",
    needs: "Downloads MuJoCo on first use, about 20 MB.",
    skill: "robot-simulation",
    kinds: ["Assembly"],
    checks: true,
    prompt: (file) =>
      `Make a MuJoCo model of ${file} from its joints, limits and materials, with collision shapes, joint dynamics and actuators, and check it with cad mujoco check. Tell me what the check found and ask me what each actuator should drive.`,
    short: (name) => `MuJoCo model of ${name}`,
  },
];

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

/** Whether a job works on a file of this kind. */
export function jobFits(action: HardwareAction, kind: string): boolean {
  return action.kinds === null || action.kinds.includes(kind);
}

/**
 * The jobs for a part of this kind that the enabled plugins' skills can do, by menu, in order; with
 * no kind, every job those skills can do, whatever it works on (the Toolbox, which shows them all).
 * Manufacture puts the project's own way of making it first, whole, and the other ways apart;
 * until the project has chosen one, every way waits apart.
 */
export function hardwareActions(
  kind: string | null,
  skills: ReadonlySet<string>,
  process: MakingProcess | string = "Not decided",
): HardwareActionMenu[] {
  const decided = process.trim() !== "" && process !== "Not decided";
  const offered = HARDWARE_ACTIONS.filter(
    (action) =>
      (kind === null || jobFits(action, kind)) &&
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
