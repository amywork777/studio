import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";

/** The formats a part's tab exports to: what a supplier, a printer and another CAD tool read. */
export type ExportFormat = "step" | "stl" | "3mf";

export const EXPORT_LABELS: Readonly<Record<ExportFormat, string>> = {
  step: "STEP",
  stl: "STL",
  "3mf": "3MF",
};

const ALL: ReadonlyArray<ExportFormat> = ["step", "stl", "3mf"];

/** What each file kind exports to. A STEP never to STEP, the person's own file; a mesh never to one; an
 * implicit part to a STEP alone, its faces held to its field (`cad gsl step`). */
const BY_ENDING: ReadonlyArray<readonly [RegExp, ReadonlyArray<ExportFormat>]> = [
  [/\.xbf$/i, ALL],
  [/\.(?:step|stp)$/i, ["stl", "3mf"]],
  [/\.stl$/i, ["3mf"]],
  [/\.3mf$/i, ["stl"]],
  [/\.glb$/i, ["stl", "3mf"]],
  [/\.gsl$/i, ["step"]],
];

export interface ExportPlan {
  /** The tab's file, or its model's document id: what the CAD tools export from. */
  readonly source: string;
  readonly formats: ReadonlyArray<ExportFormat>;
  /** Where the files go: beside the part, by its name and the format's ending. */
  readonly destination: (format: ExportFormat) => string;
}

/**
 * What a tab's part exports to and where, or null for a tab with nothing to export (a drawing, a
 * document, a file outside the project, a model whose script is not known yet). A model's files go
 * beside its script, named as it is.
 */
export function tabExportPlan(
  file: string | null,
  scriptOf: (id: string) => string | undefined,
): ExportPlan | null {
  if (file === null || /^(?:\/|[A-Za-z]:[\\/])/.test(file)) return null;
  if (isDocumentId(file)) {
    const script = scriptOf(file)?.replaceAll("\\", "/");
    if (script === undefined) return null;
    const stem = script.replace(/\.py$/i, "");
    return { source: file, formats: ALL, destination: (format) => `${stem}.${format}` };
  }
  const formats = BY_ENDING.find(([ending]) => ending.test(file))?.[1];
  if (formats === undefined) return null;
  const stem = file.replaceAll("\\", "/").replace(/\.[^./]+$/, "");
  return { source: file, formats, destination: (format) => `${stem}.${format}` };
}
