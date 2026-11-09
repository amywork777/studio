/**
 * What a Toolbox job made for a part, kept beside it: every job that makes files saves them in
 * `outputs/<job>/<part's file name>/` (`hardwareActions.ts` says so in its ask), so a job's block
 * on the Nodes canvas finds them and running it again can use the settings saved with them (the
 * slicer presets the Slice job saved, say). Plain functions, no React.
 */

import type { Figure } from "./studyFigures";

const OUTPUTS = "outputs";

const stemOf = (path: string) => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

/** Where a job keeps what it makes for the part with this script (or STEP). */
export const outputFolder = (job: string, script: string) => `${OUTPUTS}/${job}/${stemOf(script)}`;

/** The job and the part's file name of a file a job made; null for any other file. */
export function outputOf(path: string): { readonly job: string; readonly stem: string } | null {
  const [top, job, stem, ...rest] = path.split("/");
  return top === OUTPUTS && job && stem && rest.length > 0 ? { job, stem } : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A preset value as written: a string, or the first of a list (one per extruder). */
const first = (value: unknown): string | null => {
  const held = Array.isArray(value) ? value[0] : value;
  return typeof held === "string" && held.trim() !== "" ? held.trim() : null;
};

/** The slicer presets a job saves (the gcode skill's `orca_presets.py` output), by file name. */
export const PRESET_FILES = ["printer.json", "process.json", "filament-1.json"] as const;

/**
 * The settings a reader checks before printing, from the saved presets by file name, in the order
 * they read them. Only what the presets hold: one missing or not JSON gives nothing.
 */
export function printSettings(presets: ReadonlyMap<string, string>): ReadonlyArray<Figure> {
  const read = (name: string): Record<string, unknown> => {
    const contents = presets.get(name);
    if (contents === undefined) return {};
    try {
      const data: unknown = JSON.parse(contents);
      return isRecord(data) ? data : {};
    } catch {
      return {};
    }
  };
  const [printer, process, filament] = PRESET_FILES.map(read);
  const figures: Figure[] = [];
  const add = (label: string, value: string | null, unit = "") => {
    if (value !== null) figures.push({ label, value: `${value}${unit}` });
  };
  add("Printer", first(printer?.printer_model) ?? first(printer?.name));
  add("Nozzle", first(printer?.nozzle_diameter), " mm");
  add("Settings", first(process?.name));
  add("Layer height", first(process?.layer_height), " mm");
  add("Walls", first(process?.wall_loops));
  add("Infill", first(process?.sparse_infill_density));
  add("Filament", first(filament?.name) ?? first(filament?.filament_type));
  add("Nozzle temperature", first(filament?.nozzle_temperature), " °C");
  return figures;
}
