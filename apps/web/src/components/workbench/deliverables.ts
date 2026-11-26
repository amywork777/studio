import type { StudioDeliverablesExport, StudioDeliverablesInput } from "@t3tools/contracts";

import type { CheckResult, CheckStatus } from "./checkResults";
import type { ProjectFile } from "./projectFiles";

/**
 * The Overview's Export: what goes in it and its receipt, from the project's own files
 * and the checks its runs saved (law 4). The server exports the parts and writes the files
 * (`StudioDeliverables.ts`); nothing here is made up, and what was not run says Not checked.
 */

export interface PackagePart {
  readonly root: string;
  readonly file: ProjectFile;
  /** Its checks still about it as it is (`currentResults`). */
  readonly results: ReadonlyArray<CheckResult>;
  /** Its checks run before it was last built. */
  readonly outdated: ReadonlyArray<CheckResult>;
  /** Its drawing sheets (`drawingsFor`). */
  readonly drawings: ReadonlyArray<string>;
}

const normal = (path: string) => path.replaceAll("\\", "/");
const baseName = (path: string) => normal(path).split("/").at(-1) ?? path;
const stemOf = (name: string) => baseName(name).replace(/\.[^.]+$/, "");

/** Not deliverables: a package already made, the brief's own references, a drawing's sheets. */
const LEFT_OUT = /(?:^|\/)(?:exports|deliverables|\.studio|brief|node_modules)\/|-pages\//i;
const PARTS_LIST =
  /(?:^|[/_-])(?:parts[_-]?list|bom|bill[_-]of[_-]materials)\.(?:md|csv|pdf|html|xlsx)$/i;
const BUILD_GUIDE =
  /(?:^|[/_-])(?:work[_-]instructions|assembly[_-]instructions|build[_-]guide|instructions)\.(?:pdf|md)$/i;
const PICTURE = /\.(?:png|jpe?g)$/i;
const RENDER_PLACE = /(?:^|\/)(?:pictures|renders)\/|render/i;

const STATUS_WORDS: Readonly<Record<CheckStatus, string>> = {
  fix: "Failed",
  warnings: "Warning",
  ready: "Passed",
};

const pad = (value: number) => String(value).padStart(2, "0");
const day = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const minute = (date: Date) => `${day(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** What the CAD tools write for a part, and what is copied as it is. */
function partFiles(
  part: PackagePart,
  cwd: string,
): { readonly exports?: StudioDeliverablesExport; readonly copy?: string } {
  const { file } = part;
  const own = part.root === cwd;
  if (file.document !== undefined && file.script !== undefined) {
    return own
      ? { exports: { source: file.document, stem: stemOf(file.script), formats: ["step", "stl"] } }
      : {};
  }
  if (/\.(?:step|stp)$/i.test(file.path)) {
    return {
      copy: file.path,
      ...(own ? { exports: { source: file.path, stem: stemOf(file.path), formats: ["stl"] } } : {}),
    };
  }
  return /\.(?:stl|3mf)$/i.test(file.path) ? { copy: file.path } : {};
}

/** A check's line in the receipt: what it is, how it went, its verdict, and when it ran. */
function checkLine(result: CheckResult): string {
  const ran =
    result.written === undefined ? "" : ` (run ${minute(new Date(result.written * 1000))})`;
  return `- ${result.check}: ${STATUS_WORDS[result.status]}. ${result.headline}${ran}`;
}

/** At most this many findings a check, the rest counted: the report itself has them all. */
const FINDINGS = 12;

const built = (part: PackagePart) =>
  part.file.version === undefined
    ? "a file as it came, not built by Studio's CAD tools"
    : `built ${minute(new Date(Number(part.file.version) * 1000))} by the CAD tools`;

function receiptFor(parts: ReadonlyArray<PackagePart>, name: string, now: Date): string {
  const lines = [
    `# Verification receipt: ${name}`,
    "",
    `Packed ${minute(now)} by Studio. Each result below is read from the run the project saved, as`,
    "the Overview shows it. Nothing here is estimated: what no run checked says Not checked.",
  ];
  const checked = parts.filter(
    (part) => part.results.length > 0 || part.outdated.length > 0 || part.drawings.length > 0,
  );
  if (checked.length > 0) lines.push("", "## Checked parts");
  for (const part of checked) {
    lines.push("", `### ${part.file.title} (${part.file.name})`, "", `- Model: ${built(part)}`);
    if (part.drawings.length > 0)
      lines.push(`- Drawing: ${part.drawings.map(baseName).join(", ")}`);
    for (const result of part.results) {
      lines.push(checkLine(result));
      const findings = result.issues.filter((issue) => issue.note !== true);
      for (const issue of findings.slice(0, FINDINGS)) {
        const level = issue.severity === "error" ? "Failed" : "Warning";
        lines.push(`  - ${level}: ${issue.summary}`);
      }
      if (findings.length > FINDINGS) lines.push(`  - and ${findings.length - FINDINGS} more`);
    }
    for (const result of part.outdated) {
      lines.push(`- ${result.check}: part changed since this check, so it counts as not checked`);
    }
    if (!part.results.some((result) => result.check === "Drawing check")) {
      lines.push("- Drawing check: not checked");
    }
    if (!part.results.some((result) => result.check !== "Drawing check")) {
      lines.push("- Strength and other checks: not checked");
    }
  }
  const rest = parts.filter((part) => !checked.includes(part));
  if (rest.length > 0) {
    lines.push(
      "",
      "## Not checked",
      "",
      "No check has been run on these; each is in the package as its model.",
      "",
    );
    for (const part of rest) lines.push(`- ${part.file.title} (${part.file.name}): ${built(part)}`);
  }
  return lines.join("\n");
}

/** A part the package carries: a model or a STEP, and a mesh only where nothing else has its name. */
function packedParts(parts: ReadonlyArray<PackagePart>): PackagePart[] {
  const solid = (part: PackagePart) =>
    part.file.document !== undefined || /\.(?:step|stp)$/i.test(part.file.path);
  const stems = new Set(parts.filter(solid).map((part) => stemOf(part.file.name)));
  return parts.filter(
    (part) =>
      part.file.group === "CAD" &&
      (solid(part) ||
        (/\.(?:stl|3mf)$/i.test(part.file.path) && !stems.has(stemOf(part.file.name)))),
  );
}

/** What a project's Export can hold, each a checkbox under Everything (zip). */
export type ExportContent =
  | "step"
  | "stl"
  | "drawings"
  | "partsList"
  | "buildGuide"
  | "pictures"
  | "receipt";

export const EXPORT_CONTENTS: ReadonlyArray<{
  readonly id: ExportContent;
  readonly label: string;
}> = [
  { id: "step", label: "STEP" },
  { id: "stl", label: "STL" },
  { id: "drawings", label: "Drawing PDFs" },
  { id: "partsList", label: "Parts list (BOM)" },
  { id: "buildGuide", label: "Build guide" },
  { id: "pictures", label: "Pictures" },
  { id: "receipt", label: "Verification receipt" },
];

export const EVERYTHING: ReadonlySet<ExportContent> = new Set(
  EXPORT_CONTENTS.map((item) => item.id),
);

interface ProjectInput {
  readonly name: string;
  /** The folder the export goes in: the project's first. */
  readonly cwd: string;
  readonly folders: ReadonlyArray<{ readonly root: string; readonly paths: ReadonlyArray<string> }>;
  readonly parts: ReadonlyArray<PackagePart>;
}

/** Everything the project has to export, each file by what it is. */
function contents(input: ProjectInput) {
  const exports: StudioDeliverablesExport[] = [];
  const copies: Array<{ root: string; path: string; to: string; content: ExportContent }> = [];
  const taken = new Set<string>();
  const add = (root: string, path: string, place: string, content: ExportContent) => {
    const to = `${place}/${baseName(path)}`;
    if (taken.has(to)) return;
    taken.add(to);
    copies.push({ root, path, to, content });
  };
  const parts = packedParts(input.parts);
  // The exports first: a copy never stands in for a file the CAD tools write from the model.
  for (const part of parts) {
    const made = partFiles(part, input.cwd).exports;
    if (made === undefined || exports.some((held) => held.stem === made.stem)) continue;
    exports.push(made);
    for (const format of made.formats) taken.add(`models/${made.stem}.${format}`);
  }
  for (const part of parts) {
    const copy = partFiles(part, input.cwd).copy;
    if (copy !== undefined)
      add(part.root, copy, "models", /\.(?:step|stp)$/i.test(copy) ? "step" : "stl");
    for (const drawing of part.drawings) add(part.root, drawing, "drawings", "drawings");
  }
  for (const folder of input.folders) {
    for (const path of folder.paths) {
      const at = normal(path);
      if (LEFT_OUT.test(at)) continue;
      if (PARTS_LIST.test(at)) add(folder.root, path, "parts-list", "partsList");
      else if (BUILD_GUIDE.test(at)) add(folder.root, path, "build-guide", "buildGuide");
      else if (PICTURE.test(at) && RENDER_PLACE.test(at))
        add(folder.root, path, "renders", "pictures");
    }
  }
  return { parts, exports, copies };
}

/** How many files of each kind the project's Export would hold: a kind with none is greyed. */
export function exportCounts(input: ProjectInput): Readonly<Record<ExportContent, number>> {
  const { parts, exports, copies } = contents(input);
  const copied = (content: ExportContent) =>
    copies.filter((copy) => copy.content === content).length;
  const made = (format: "step" | "stl") =>
    exports.filter((part) => part.formats.includes(format)).length;
  return {
    step: made("step") + copied("step"),
    stl: made("stl") + copied("stl"),
    drawings: copied("drawings"),
    partsList: copied("partsList"),
    buildGuide: copied("buildGuide"),
    pictures: copied("pictures"),
    receipt: parts.length,
  };
}

/** What a kind the export asked for, and the project lacks, says in the receipt. */
const MISSING: Readonly<Partial<Record<ExportContent, string>>> = {
  drawings: "Drawings: none made yet (Toolbox, Engineering drawing)",
  partsList: "Parts list: none made yet (Toolbox, Parts list)",
  buildGuide: "Build guide: none made yet (Toolbox, Assembly instructions)",
  pictures: "Renders: none made yet (Toolbox, Pictures from every side)",
};

/**
 * The project's Export: what `include` asks for of its parts exported from their models as they are
 * now (the first folder's; another folder's are copied as they are), their drawings, the parts
 * list, the build guide and the pictures, each where the project has one, and the receipt.
 * `label` names a single kind's export ("STEP"); with none it is everything.
 */
export function deliverablesPlan(
  input: ProjectInput & {
    readonly now: Date;
    readonly include?: ReadonlySet<ExportContent>;
    readonly label?: string;
  },
): StudioDeliverablesInput {
  const include = input.include ?? EVERYTHING;
  const { parts, exports, copies } = contents(input);
  const counts = exportCounts(input);
  const formats = (["step", "stl"] as const).filter((format) => include.has(format));
  const missing = [
    ...(parts.length === 0 && (include.has("step") || include.has("stl"))
      ? ["Models: the project has no part yet"]
      : []),
    ...EXPORT_CONTENTS.flatMap(({ id }) => {
      const line = MISSING[id];
      return line !== undefined && include.has(id) && counts[id] === 0 ? [line] : [];
    }),
  ];
  return {
    cwd: input.cwd,
    name: `${input.name}${input.label === undefined ? "" : ` ${input.label}`} ${day(input.now)}`,
    exports: exports.flatMap((part) => {
      const kept = part.formats.filter((format) => formats.includes(format));
      return kept.length === 0 ? [] : [{ ...part, formats: kept }];
    }),
    copies: copies
      .filter((copy) => include.has(copy.content))
      .map(({ root, path, to }) => ({ root, path, to })),
    receipt: include.has("receipt") ? receiptFor(parts, input.name, input.now) : null,
    missing,
  };
}
