// @effect-diagnostics nodeBuiltinImport:off -- writes through the plugin's own CLI into the project's folder.
/**
 * Export, from a part's tab: the files text-to-cad's own `cad <type> export` writes beside the part,
 * from the document the CAD server holds. Nothing rebuilds and no agent runs.
 */
import * as NodePath from "node:path";

import { documentType, runCad, type SnapshotLaunch } from "./modelPictures.ts";

/** What an export may write: the formats the tab's menu offers. */
const WRITABLE = /\.(?:step|stl|3mf)$/i;
/** An implicit (GSL) part, whose STEP is `cad gsl step`: its mesh as planar faces, held to its field. */
const IMPLICIT = /\.gsl$/i;

export interface ExportInput {
  readonly launch: SnapshotLaunch;
  /** The project's folder. */
  readonly cwd: string;
  /** A workspace-relative file, or a cadgen model by its document id. */
  readonly source: string;
  /** Workspace-relative files to write, each its format by its ending. */
  readonly destinations: ReadonlyArray<string>;
}

/**
 * The command that writes `destinations` from `source`, or why it is refused: a destination outside
 * the project, of a format the menu does not offer, or the source itself (a person's own STEP is
 * never written again, if only in its header).
 */
export function exportCommand(
  input: Omit<ExportInput, "launch"> & { readonly typeless?: boolean | undefined },
): { readonly type: string; readonly args: ReadonlyArray<string> } | { readonly refused: string } {
  if (input.typeless === true) return { refused: "This CAD release has no export of its own." };
  const type = IMPLICIT.test(input.source) ? "gsl" : documentType(input.source);
  if (type === null) return { refused: `${input.source} is not a model Studio can export.` };
  const root = NodePath.resolve(input.cwd);
  const inside = (path: string) => {
    const absolute = NodePath.resolve(root, path);
    return absolute.startsWith(`${root}${NodePath.sep}`) ? absolute : null;
  };
  const source = type === "model" ? input.source : inside(input.source);
  if (source === null) return { refused: `${input.source} is not in this project.` };
  if (input.destinations.length === 0) return { refused: "Nothing to export." };
  const destinations: string[] = [];
  for (const destination of input.destinations) {
    const absolute = inside(destination);
    if (absolute === null || !WRITABLE.test(destination))
      return { refused: `${destination} is not a file Studio exports.` };
    if (absolute === source) return { refused: `${destination} is the part's own file.` };
    destinations.push(absolute);
  }
  if (type !== "gsl") return { type, args: [type, "export", source, ...destinations] };
  const [step, ...more] = destinations;
  if (step === undefined || more.length > 0 || !/\.step$/i.test(step))
    return { refused: "An implicit part exports to one STEP." };
  return { type, args: ["gsl", "step", source, step] };
}

/** Writes the files, starting the CAD server first where the release needs one running. */
export async function exportModel(input: ExportInput): Promise<ReadonlyArray<string>> {
  const command = exportCommand({ ...input, typeless: input.launch.typeless });
  if ("refused" in command) throw new Error(command.refused);
  if (input.launch.startsServer === true)
    await runCad(input.launch, [...input.launch.args, "server", "start"]).catch(() => undefined);
  await runCad(input.launch, [...input.launch.args, ...command.args]);
  return input.destinations;
}
