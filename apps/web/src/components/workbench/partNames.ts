/**
 * Files as an engineer names them, for the engineering interface: a part, a
 * drawing, a study or a document by what it is called ("Servo bracket",
 * "Servo bracket drawing", "FEA summary"), not by its path or ending. The
 * name is the file's own, with its endings and separators taken off; a
 * study, a check or a job is named after the part it was run on.
 */

export interface PartName {
  /** What it is called: "Servo bracket". */
  readonly name: string;
  /** What it is: "Part", "Drawing", "FEA study". */
  readonly kind: string;
  /** Both, where one label must say both: "Servo bracket drawing"; a part or a document is its name. */
  readonly label: string;
}

/** Words an engineer writes in capitals. "cam" is left out: it is a part as often as a job. */
const ACRONYMS = new Set([
  "abs",
  "ac",
  "asa",
  "ble",
  "bom",
  "cad",
  "cfd",
  "cnc",
  "dc",
  "dfa",
  "dfm",
  "ecn",
  "eco",
  "erd",
  "esc",
  "fdm",
  "fea",
  "fmea",
  "gpio",
  "hdmi",
  "i2c",
  "imu",
  "lcd",
  "led",
  "mcu",
  "mrd",
  "nema",
  "nre",
  "pcb",
  "pcba",
  "petg",
  "pla",
  "prd",
  "psu",
  "rf",
  "rfq",
  "sla",
  "sls",
  "spi",
  "tpu",
  "uart",
  "usb",
  "xrd",
]);

const capitalize = (text: string) => (text === "" ? text : text[0]!.toUpperCase() + text.slice(1));

/**
 * A file's stem as a name: "servo_bracket_v2" reads "Servo bracket v2",
 * "enclosureLid" "Enclosure lid", "M3_STANDOFF" "M3 standoff". Part numbers
 * (MDBT50Q, XT60), the capitals an engineer uses (PCB, FEA, PRD) and a word
 * like xRD or iPhone, one small letter before its capitals, are kept.
 */
export function humanName(stem: string): string {
  const words = stem
    .replace(/([a-z]{2})([A-Z])/g, "$1 $2")
    .split(/[\s_.-]+/)
    .filter(Boolean);
  if (words.length === 0) return stem;
  // A name in capitals throughout ("README", "FINAL_ASSEMBLY") is shouted, not spelled.
  const shouted = !/[a-z]/.test(stem);
  const cased = words.map((word) => {
    const lower = word.toLowerCase();
    // Written in mixed case on purpose (xRD, iPhone): kept as it is.
    if (/^[a-z]+[A-Z]/.test(word)) return word;
    if (ACRONYMS.has(lower)) return lower.toUpperCase();
    if (word.length === 1) return word.toUpperCase();
    if (shouted ? /^[A-Z]+$/.test(word) : /^[A-Z][a-z]+$/.test(word)) return lower;
    return word;
  });
  return capitalize(cased.join(" "));
}

/** The name mid-sentence: "servo bracket", but "PCB mount" and "L bracket" keep their capitals. */
export function lowerName(name: string): string {
  return /^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name;
}

/** The name as it reads inside a sentence: "the servo bracket", "the PCB mount", "the L bracket". */
export function inSentence(name: string): string {
  return `the ${lowerName(name)}`;
}

/**
 * A mesh by its format, as an engineer asks for one ("send me the STL"): STL, 3MF, OBJ. A GLB is
 * the viewer's own picture of a part, so it stays a mesh.
 */
export function meshFormat(path: string): string {
  const format = /\.(stl|3mf|obj)$/i.exec(path)?.[1];
  return format === undefined ? "mesh" : format.toUpperCase();
}

/**
 * Endings, compound ones first, each with what the file is and what its label
 * adds to the name. `stemmed` endings are part of the name ("bom.csv" alone
 * is the bill of materials).
 */
const ENDINGS: ReadonlyArray<{
  readonly ending: RegExp;
  readonly kind: string | ((match: RegExpExecArray) => string);
  /** Added to the name in a label; empty for a part or a document, named by its name alone. */
  readonly suffix: string | ((match: RegExpExecArray) => string);
}> = [
  { ending: /\.fea\.(?:json|glb)$/i, kind: "FEA study", suffix: "FEA study" },
  { ending: /\.cam\.(?:json|glb)$/i, kind: "CAM job", suffix: "CAM job" },
  { ending: /\.harness\.ya?ml$/i, kind: "Harness", suffix: "harness" },
  { ending: /(?:^|[._-])gerbers?\.zip$/i, kind: "Gerbers", suffix: "Gerbers" },
  {
    ending: /(?:^|[._-])bom\.(?:csv|tsv)$/i,
    kind: "Bill of materials",
    suffix: "bill of materials",
  },
  {
    ending: /(?:^|[._-])pos\.(?:csv|tsv)$/i,
    kind: "Pick and place",
    suffix: "pick and place file",
  },
  { ending: /\.(?:nc|gcode|ngc|tap|gco)$/i, kind: "G-code", suffix: "G-code" },
  { ending: /\.(?:gbr|drl)$/i, kind: "Gerbers", suffix: "Gerbers" },
  { ending: /\.(?:step|stp|xbf)$/i, kind: "Part", suffix: "" },
  // A SolidCraft design: the part itself, as the engineer edits it in SolidCraft.
  { ending: /\.solidcraft$/i, kind: "Design", suffix: "" },
  { ending: /\.(?:stl|3mf|obj|glb)$/i, kind: "Mesh", suffix: (match) => meshFormat(match[0]) },
  { ending: /\.urdf$/i, kind: "Robot", suffix: "robot description" },
  { ending: /\.srdf$/i, kind: "Planning groups", suffix: "planning groups" },
  { ending: /\.sdf$/i, kind: "Simulation model", suffix: "simulation model" },
  { ending: /\.kicad_pcb$/i, kind: "Board", suffix: "board" },
  { ending: /\.kicad_sch$/i, kind: "Schematic", suffix: "schematic" },
  { ending: /\.(?:dxf|dwg|svg)$/i, kind: "Drawing", suffix: "drawing" },
  // The engineering drawing's sheet: `bracket_drawing.pdf`, beside its script.
  { ending: /(?:^|[._-])drawing\.pdf$/i, kind: "Drawing", suffix: "drawing" },
  { ending: /\.(?:md|mdx|txt|pdf)$/i, kind: "Document", suffix: "" },
  { ending: /\.(?:csv|tsv|xlsx)$/i, kind: "Table", suffix: "" },
  { ending: /\.(?:png|jpe?g|webp|gif|heic)$/i, kind: "Image", suffix: "" },
  { ending: /\.py$/i, kind: "Source", suffix: "source" },
];

/** Files every project has, named for what they hold. */
const KNOWN: ReadonlyArray<readonly [RegExp, string, string]> = [
  // The project's own README is what its Overview reads (`ReadmeOverview`).
  [/^(?:\.\/)?readme\.md$/i, "Overview", "Document"],
  [/(?:^|\/)project\.json$/i, "Project setup", "Setup"],
  [/(?:^|\/)brief\/project\.md$/i, "Project brief", "Document"],
  [/(?:^|\/)(?:AGENTS|CLAUDE)\.md$/i, "Notes for the agent", "Document"],
];

const baseName = (path: string) => path.replaceAll("\\", "/").split("/").at(-1) ?? path;

/** The answer and the picture text-to-cad 0.11 writes into the folder a solve or a plan names. */
const RESULT_FILE = /(?:^|\/)result\.(?:json|glb)$/i;
/** A folder of a CAM job's results, by its name: `CAM`, `cam/bracket`, `bracket-cam`. */
const CAM_FOLDER = /(?:^|[._-])(?:cam|toolpaths?|machining)$/i;
/** A folder named for what its results are rather than for the study (`FEA`, `studies`). */
const RESULTS_FOLDER =
  /^(?:fea|cam|sim|simulations?|stud(?:y|ies)|results?|analysis|analyses|toolpaths?|machining|out|output)$/i;

/**
 * A study's or a CAM job's result as text-to-cad 0.11 writes it, `<folder>/result.json` and
 * `result.glb` (`cad step solve … --out studies/tip-load`, `cad step plan … --out CAM`): a CAM
 * job's when a folder it is in is named for one, else an FEA study's; named after its folder
 * (`tip-load` is "Tip load"), or null where the folder only says what it holds. Null for any
 * other file.
 */
export function folderResult(
  path: string,
): { readonly kind: "FEA study" | "CAM job"; readonly name: string | null } | null {
  const normalized = path.replaceAll("\\", "/");
  if (!RESULT_FILE.test(normalized)) return null;
  const folders = normalized.split("/").slice(0, -1).filter(Boolean);
  const kind = folders.some((folder) => CAM_FOLDER.test(folder)) ? "CAM job" : "FEA study";
  const own = (folders.at(-1) ?? "").replace(/[._-](?:fea|cam|study|results?)$/i, "");
  return { kind, name: own === "" || RESULTS_FOLDER.test(own) ? null : humanName(own) };
}

/** The file as an engineer names it, or null for one that is not a part or a document of theirs. */
export function partName(path: string): PartName | null {
  const normalized = path.replaceAll("\\", "/");
  for (const [test, name, kind] of KNOWN) {
    if (test.test(normalized)) return { name, kind, label: name };
  }
  const result = folderResult(normalized);
  if (result !== null) {
    const { kind } = result;
    return result.name === null
      ? { name: kind, kind, label: kind }
      : { name: result.name, kind, label: `${result.name} ${kind}` };
  }
  // A named study, kept as the FEA skill keeps several: `FEA/bracket.bracket-load.glb`.
  const study = /(?:^|\/)FEA\/([^/]+?)(?:\.fea)?\.(?:json|glb)$/i.exec(normalized);
  if (study !== null) {
    const name = humanName(study[1]!);
    return { name, kind: "FEA study", label: `${name} FEA study` };
  }
  const file = baseName(normalized);
  for (const rule of ENDINGS) {
    const match = rule.ending.exec(file);
    if (match === null) continue;
    const kind = typeof rule.kind === "string" ? rule.kind : rule.kind(match);
    const suffix = typeof rule.suffix === "string" ? rule.suffix : rule.suffix(match);
    const stem = file.slice(0, match.index);
    // A file named for what it is ("bom.csv", "gerbers.zip") is called that.
    if (stem === "") {
      const name = capitalize(suffix === "" ? kind : suffix);
      return { name, kind, label: name };
    }
    const name = humanName(stem);
    const label =
      suffix === "" || name.toLowerCase().endsWith(suffix.toLowerCase())
        ? name
        : `${name} ${suffix}`;
    return { name, kind, label };
  }
  return null;
}

/** The label for a file anywhere it is named: an engineer's name where one is known, else its file name. */
export function partLabel(path: string): string {
  return partName(path)?.label ?? baseName(path);
}
