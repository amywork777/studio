import type { ActionSectionDef, HardwareAction, HardwareActionGroup } from "./hardwareActions";
import { INDUSTRIES } from "./industries";

/**
 * The jobs of Studio's own industry plugins (`studio-plugins/`), one skill each, as that skill's own
 * task table names them. They join text-to-cad's (`HARDWARE_ACTIONS`) in the Toolbox, each under
 * its industry's name, and like every job show only while an enabled plugin has their skill, so an
 * industry turned off has none. They are not job skills (`jobSkills.ts`), which are text-to-cad's.
 */

const GROUPS: ReadonlyArray<HardwareActionGroup> = ["Evaluate", "Manufacture", "Document"];

/** An industry's section in a group: `woodworking:Manufacture`, titled by the industry. */
const sectionId = (industry: string, group: HardwareActionGroup) => `${industry}:${group}`;

/** A section per industry plugin in each group, titled by the industry. */
export const INDUSTRY_SECTIONS: ReadonlyArray<ActionSectionDef> = INDUSTRIES.filter(
  (industry) => industry.plugin !== null,
).flatMap((industry) =>
  GROUPS.map((group) => ({ id: sectionId(industry.id, group), group, title: industry.name })),
);

const SOLID = ["Part", "Assembly"];
/** A pattern is its script, or the DXF or SVG the script wrote. */
const PATTERN = ["Drawing", "Source"];
/** A carton is its folded model, or its dieline. */
const CARTON = ["Part", "Assembly", "Drawing"];

/** A job of an industry's skill, in that industry's section of its group. */
const job = (
  industry: string,
  action: Omit<HardwareAction, "section" | "skill">,
): HardwareAction => ({
  ...action,
  section: sectionId(industry, action.group),
  skill: industry,
});

export const INDUSTRY_ACTIONS: ReadonlyArray<HardwareAction> = [
  job("apparel", {
    id: "seams",
    group: "Evaluate",
    label: "Check the seams",
    gets: "Each pair of seams measured against each other in every size, and any that do not match.",
    kinds: PATTERN,
    checks: true,
    prompt: (file) =>
      `Check the seams of ${file} with the apparel skill: measure every pair that is sewn together, in every size, and tell me any that do not match and by how much.`,
    short: (name) => `Check the seams of ${name}`,
  }),
  job("apparel", {
    id: "cutting-file",
    group: "Manufacture",
    label: "Cutting-room DXF",
    gets: "The graded pieces as an AAMA/ASTM DXF, with seam allowances, notches and grainlines.",
    kinds: PATTERN,
    checks: false,
    prompt: (file) =>
      `Write ${file} as an AAMA/ASTM DXF for a cutting room with the apparel skill, in every size.`,
    short: (name) => `Cutting-room DXF of ${name}`,
  }),
  job("apparel", {
    id: "print-pattern",
    group: "Manufacture",
    label: "Pattern to print",
    gets: "The pieces as an SVG at full size, to print at 100%.",
    kinds: PATTERN,
    checks: false,
    prompt: (file) =>
      `Write ${file} as a full-size SVG to print at home with the apparel skill. Ask me which size.`,
    short: (name) => `Print ${name} at full size`,
  }),
  job("apparel", {
    id: "size-spec",
    group: "Document",
    label: "Size spec",
    gets: "A table of the garment's finished measurements in every size, for a tech pack.",
    kinds: PATTERN,
    checks: false,
    prompt: (file) =>
      `Write the size spec of ${file} with the apparel skill: each finished measurement of the garment laid flat, in every size, for a tech pack.`,
    short: (name) => `Size spec of ${name}`,
  }),
  job("packaging", {
    id: "carton-fit",
    group: "Evaluate",
    label: "Carton fit",
    gets: "Whether the folded carton closes and the product fits inside, with any panel that collides.",
    kinds: CARTON,
    checks: true,
    prompt: (file) =>
      `Fold ${file} up around its product with the packaging skill and run an exact interference check. Tell me whether it closes, whether the product fits, and the clear space inside.`,
    short: (name) => `Check the fit of ${name}`,
  }),
  job("packaging", {
    id: "dieline",
    group: "Manufacture",
    label: "Dieline",
    gets: "A DXF of the carton laid flat, its cut lines and crease lines on layers of their own.",
    kinds: CARTON,
    checks: false,
    prompt: (file) =>
      `Export the dieline of ${file} as a DXF with the packaging skill, cuts and creases on layers of their own, and tell me the blank's size.`,
    short: (name) => `Dieline of ${name}`,
  }),
  job("woodworking", {
    id: "cut-list-check",
    group: "Evaluate",
    label: "Check the cut list",
    gets: "Every board measured in the model against the cut list, and any that differ.",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Check the cut list of ${file} against its model with the woodworking skill: measure every board, and tell me any that is not the blank the list says. Then check its joints for boards that collide.`,
    short: (name) => `Check the cut list of ${name}`,
  }),
  job("woodworking", {
    id: "cut-list",
    group: "Manufacture",
    label: "Cut list",
    gets: "Each board's size and how many, as a CSV, with the length of edge banding.",
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Make the cut list of ${file} with the woodworking skill: each board's length, width and thickness and how many, as a CSV, and the length of edge banding.`,
    short: (name) => `Cut list of ${name}`,
  }),
  job("woodworking", {
    id: "sheet-layout",
    group: "Manufacture",
    label: "Sheet layout",
    gets: "The boards laid out on sheets with the saw kerf, as a DXF, and how much of each is used.",
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Lay the boards of ${file} out on sheets with the woodworking skill, with the saw kerf, as a DXF. Ask me the sheet size if the project does not say, and tell me how many sheets and how much of each is used.`,
    short: (name) => `Sheet layout of ${name}`,
  }),
  job("jewelry", {
    id: "stone-seat",
    group: "Evaluate",
    label: "Stone and seat",
    gets: "Whether the stone sits in its seat clear of the metal and the finger, with any overlap.",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Check the stone of ${file} in its seat with the jewelry skill, by an exact interference check of the stone against the metal, and tell me whether it is clear of the finger.`,
    short: (name) => `Check the stone of ${name}`,
  }),
  job("jewelry", {
    id: "metal-weight",
    group: "Evaluate",
    label: "Metal weight",
    gets: "The piece's weight in silver, gold or platinum, from the model's volume.",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Tell me what ${file} weighs with the jewelry skill, from the volume of its metal. Ask me which metal if the project does not say.`,
    short: (name) => `Weigh ${name}`,
  }),
  job("jewelry", {
    id: "casting-check",
    group: "Manufacture",
    label: "Check for casting",
    gets: "Findings for printing its pattern in resin to cast from, each passing, to fix or to check.",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Check ${file} for casting with the jewelry skill: that the metal is one body, and its pattern for resin printing (thin walls, small features). Tell me what to change.`,
    short: (name) => `Check ${name} for casting`,
  }),
  job("jewelry", {
    id: "casting-file",
    group: "Manufacture",
    label: "File for the caster",
    gets: "An STL of the metal as one body, for a caster or a wax printer.",
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Export the metal of ${file} as an STL for a caster or a wax printer, with the jewelry skill.`,
    short: (name) => `Casting file of ${name}`,
  }),
  job("footwear", {
    id: "shoe-size",
    group: "Evaluate",
    label: "Shoe size",
    gets: "The sole's size in Mondopoint, EU and UK, from the foot's length and width.",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Tell me the shoe size of ${file} with the footwear skill, in Mondopoint, EU and UK, from the foot it was made for.`,
    short: (name) => `Shoe size of ${name}`,
  }),
  job("footwear", {
    id: "midsole-print",
    group: "Manufacture",
    label: "Check the midsole for printing",
    gets: "Findings for printing the midsole in powder (MJF), each passing, to fix or to check.",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Check the midsole of ${file} for powder printing (MJF) with the footwear skill: its size against the printer's and its wall thickness. Tell me what to change.`,
    short: (name) => `Check the midsole of ${name}`,
  }),
  job("footwear", {
    id: "flatten-upper",
    group: "Manufacture",
    label: "Flatten an upper piece",
    gets: "A flat pattern of a curved piece of the upper, as a DXF, with the stretch it needs.",
    kinds: ["Mesh"],
    checks: false,
    prompt: (file) =>
      `Flatten ${file}, one piece of an upper taken from a last, into its flat pattern with the footwear skill, as a DXF. Tell me how much the material has to stretch or compress.`,
    short: (name) => `Flatten ${name}`,
  }),
];
