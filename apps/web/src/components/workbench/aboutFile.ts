import { partName, SOLIDCRAFT_DESIGN } from "./partNames";

/**
 * What a file with no viewer of its own is, in a sentence an engineer would say, for its page in
 * the engineering interface (`StudioFilePage`): G-code, Gerbers, a schematic, a spreadsheet. The
 * page offers to open it in its own app rather than showing its text as code.
 */
const ABOUT: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /(?:^|\/)project\.json$/i,
    "The project's setup: its name, its units and how it is made. Change it by asking in the chat.",
  ],
  [
    /\.(?:gcode|nc|ngc|tap|gco)$/i,
    "G-code: the toolpath a CNC machine or a printer runs, line by line.",
  ],
  [/\.(?:gbr|drl)$/i, "A Gerber or drill file: what a board maker makes the board from."],
  [/gerbers?\.zip$/i, "The board's Gerber and drill files, zipped to send to a board maker."],
  [/\.kicad_sch$/i, "A KiCad schematic. Open it in KiCad to change it, or ask in the chat."],
  [/\.harness\.ya?ml$/i, "The wiring harness as data: its connectors, wires and their lengths."],
  [/\.obj$/i, "A 3D mesh (OBJ)."],
  [SOLIDCRAFT_DESIGN, "A SolidCraft design."],
  [/\.dwg$/i, "An AutoCAD drawing (DWG)."],
  [/\.(?:xlsx|xls|numbers)$/i, "A spreadsheet."],
  [/\.(?:docx|doc|pages)$/i, "A Word document."],
  [/\.(?:pptx|ppt|key)$/i, "A slide deck."],
  [/\.(?:heic|heif)$/i, "A photo (HEIC)."],
  [/\.zip$/i, "A zip archive."],
  [
    /\.py$/i,
    "The script the part is built from. Ask in the chat to change it, or edit the part by hand.",
  ],
  [/\.ya?ml$/i, "Settings or data the tools read."],
  [/\.json$/i, "Data the tools read and write."],
];

export function aboutFile(path: string): string {
  return ABOUT.find(([test]) => test.test(path))?.[1] ?? "A file of the project.";
}

/** Plain text, read as a document rather than as code. */
export const isPlainText = (path: string) => /\.txt$/i.test(path);

/**
 * What opening a file in its own app on this Mac is called, by what it is: "Open the spreadsheet",
 * "Open in KiCad", else "Open". Null for a file Studio does not hand to another app. The desktop
 * app checks the same list again before it opens anything (`isOpenable` in
 * apps/desktop/src/studio/studioImportFiles.ts), so keep the two together.
 */
const OPEN_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\.(?:xlsx|xlsm|xls|numbers|csv)$/i, "Open the spreadsheet"],
  [/\.(?:docx|doc|pages|rtf)$/i, "Open the document"],
  [/\.(?:pptx|ppt|key)$/i, "Open the slides"],
  [/\.kicad_(?:pcb|sch|pro)$/i, "Open in KiCad"],
  [/\.(?:heic|heif|png|jpe?g|gif|tiff?|webp)$/i, "Open the picture"],
  [/\.zip$/i, "Open the zip"],
  [
    /\.(?:txt|md|pdf|svg|dwg|dxf|step|stp|iges|igs|stl|3mf|obj|glb|f3d|sldprt|sldasm|gbr|drl|gcode|gco|nc|ngc|tap|mp4|mov)$/i,
    "Open",
  ],
];

export function openLabel(path: string): string | null {
  return OPEN_LABELS.find(([test]) => test.test(path))?.[1] ?? null;
}

/**
 * A file chip's words on hover, as an engineer would put it: what it is and where ("Drawing, in
 * drawings"), not its path, line and size.
 */
export function fileChipWords(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/:\d+(?::\d+)?$/, "");
  const kind = partName(normalized)?.kind ?? "File";
  const folder = normalized.split("/").slice(0, -1).join("/");
  return folder === "" ? kind : `${kind}, in ${folder}`;
}
