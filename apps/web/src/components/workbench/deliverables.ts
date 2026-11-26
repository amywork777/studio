import type { StudioDeliverablesExport, StudioDeliverablesInput } from "@t3tools/contracts";

import type { CheckResult, CheckStatus } from "./checkResults";
import type { ProjectFile } from "./projectFiles";

/**
 * The Overview's Deliverables package: what goes in it and its receipt, from the project's own files
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
const LEFT_OUT = /(?:^|\/)(?:deliverables|\.studio|brief|node_modules)\/|-pages\//i;
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

/**
 * The package for a project: its parts exported from their models as they are now (the first
 * folder's; another folder's are copied as they are), their drawings, the parts list, the build
 * guide and the pictures, each where the project has one, and the receipt.
 */
export function deliverablesPlan(input: {
  readonly name: string;
  /** The folder the package goes in: the project's first. */
  readonly cwd: string;
  readonly folders: ReadonlyArray<{ readonly root: string; readonly paths: ReadonlyArray<string> }>;
  readonly parts: ReadonlyArray<PackagePart>;
  readonly now: Date;
}): StudioDeliverablesInput {
  const name = `${input.name} deliverables ${day(input.now)}`;
  const exports: StudioDeliverablesExport[] = [];
  const copies: Array<{ root: string; path: string; to: string }> = [];
  const taken = new Set<string>();
  const add = (root: string, path: string, place: string) => {
    const to = `${place}/${baseName(path)}`;
    if (taken.has(to)) return;
    taken.add(to);
    copies.push({ root, path, to });
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
    if (copy !== undefined) add(part.root, copy, "models");
    for (const drawing of part.drawings) add(part.root, drawing, "drawings");
  }
  let partsLists = 0;
  let guides = 0;
  let pictures = 0;
  for (const folder of input.folders) {
    for (const path of folder.paths) {
      const at = normal(path);
      if (LEFT_OUT.test(at)) continue;
      if (PARTS_LIST.test(at)) {
        add(folder.root, path, "parts-list");
        partsLists += 1;
      } else if (BUILD_GUIDE.test(at)) {
        add(folder.root, path, "build-guide");
        guides += 1;
      } else if (PICTURE.test(at) && RENDER_PLACE.test(at)) {
        add(folder.root, path, "renders");
        pictures += 1;
      }
    }
  }
  const missing = [
    ...(parts.length === 0 ? ["Models: the project has no part yet"] : []),
    ...(parts.some((part) => part.drawings.length > 0)
      ? []
      : ["Drawings: none made yet (Toolbox, Engineering drawing)"]),
    ...(partsLists > 0 ? [] : ["Parts list: none made yet (Toolbox, Parts list)"]),
    ...(guides > 0 ? [] : ["Build guide: none made yet (Toolbox, Assembly instructions)"]),
    ...(pictures > 0 ? [] : ["Renders: none made yet (Toolbox, Pictures from every side)"]),
  ];
  return {
    cwd: input.cwd,
    name,
    exports,
    copies,
    receipt: receiptFor(parts, input.name, input.now),
    missing,
  };
}
