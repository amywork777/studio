/**
 * A drawing check: every dimension the agent read off a drawing or a sketch, set against what the
 * built model measures. The agent writes `<part>.drawing-check.json` (the `drawing-check` job skill
 * says how); Studio grades it here, so a pass or a fail is always Studio's comparison of two real
 * numbers and never the agent's word (law 4). A row with no measurement says "not checked".
 */

import type { CheckIssue, CheckResult } from "./checkResults";

const DRAWING_CHECK_FILE = /\.drawing-check\.json$/i;

export const isDrawingCheckPath = (path: string) => DRAWING_CHECK_FILE.test(path);

export type DrawingUnits = "in" | "mm" | "deg";

/** What the agent says about a dimension beyond reading it. */
export type DrawingFlag =
  /** It disagrees with another dimension, a view or the geometry. */
  | "conflict"
  /** The drawing does not give it; the value was chosen, derived or scaled. */
  | "missing"
  /** It could not be read with confidence. */
  | "unclear"
  /** A reference dimension: shown, never passed or failed. */
  | "reference"
  /** A note carried as text (a thread, a finish, a process). */
  | "note";

/** Where on the drawing it was read: a page of a source, and a box on it (0 to 1, from top left). */
export interface DrawingPlace {
  readonly source: string;
  readonly page: number;
  readonly view: string | null;
  readonly box: readonly [number, number, number, number] | null;
}

export interface DrawingSource {
  readonly id: string;
  /** The drawing in the project: a PDF or a picture. */
  readonly file: string | null;
  /** The PDF's pages as pictures (`<name>-pages/`), when Studio rendered them. */
  readonly pages: string | null;
  readonly title: string | null;
}

export interface DrawingDimension {
  readonly id: string;
  /** As printed ("Ø1.000/1.002", "R2 3/4", "2X .03 X 45°"); null when the drawing gives none. */
  readonly text: string | null;
  readonly nominal: number | null;
  readonly units: DrawingUnits;
  /** Its own limits, low then high, in its units. */
  readonly limits: readonly [number, number] | null;
  readonly feature: string;
  /** The model element it maps to, as the viewer names it (a cad ref). */
  readonly featureRef: string | null;
  readonly where: DrawingPlace | null;
  readonly confidence: "high" | "medium" | "low";
  /** What the built model measures, in the dimension's units; null when nothing measured it. */
  readonly measured: number | null;
  readonly measuredHow: string | null;
  readonly flag: DrawingFlag | null;
  /** The engineer's answer to the row's flag ("Centred, as modelled"): settled, no longer to confirm. */
  readonly confirmed: string | null;
  readonly note: string | null;
  /** Other dimensions it is read against (a chain that does not add up). */
  readonly related: ReadonlyArray<string>;
}

/** The drawing's general tolerance, by how many decimals a size prints, for fractions and angles. */
export interface GeneralTolerance {
  readonly decimals: Readonly<Record<string, number>>;
  readonly fraction: number | null;
  readonly angle: number | null;
}

export interface DrawingCheck {
  /** The part's script: the code is the model (law 3). */
  readonly part: string | null;
  /** The built model the measurements were taken on, for the viewer. */
  readonly model: string | null;
  readonly units: DrawingUnits;
  /** The script or command that measured the model. */
  readonly measuredBy: string | null;
  readonly generalTolerance: GeneralTolerance | null;
  readonly sources: ReadonlyArray<DrawingSource>;
  readonly dimensions: ReadonlyArray<DrawingDimension>;
}

/**
 * How a dimension came out. `ok` and `out` are Studio's comparison against its tolerance; `flag`
 * needs the engineer, and `confirmed` is a flag the engineer answered; `reference`, `note` and
 * `not-checked` pass or fail nothing.
 */
export type DimensionStatus =
  | "ok"
  | "out"
  | "flag"
  | "confirmed"
  | "reference"
  | "note"
  | "not-checked";

export interface GradedDimension extends DrawingDimension {
  readonly status: DimensionStatus;
  /** Measured less nominal, in the dimension's units; null without both. */
  readonly delta: number | null;
  /** The band it was held to, low and high, and where the band came from. */
  readonly band: { readonly low: number; readonly high: number; readonly from: BandSource } | null;
}

/** Its own limits, the title block's general tolerance, or half the last printed digit. */
export type BandSource = "limits" | "general" | "as-printed";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const UNITS: ReadonlyArray<DrawingUnits> = ["in", "mm", "deg"];
const FLAGS: ReadonlyArray<DrawingFlag> = ["conflict", "missing", "unclear", "reference", "note"];

const unitsOf = (value: unknown, fallback: DrawingUnits): DrawingUnits => {
  const word = text(value)?.toLowerCase();
  if (word === "inch" || word === "inches" || word === '"') return "in";
  if (word === "°" || word === "degrees") return "deg";
  return UNITS.find((unit) => unit === word) ?? fallback;
};

function placeOf(value: unknown, sources: ReadonlyArray<DrawingSource>): DrawingPlace | null {
  if (!isRecord(value)) return null;
  const source = text(value.source) ?? sources[0]?.id ?? null;
  if (source === null) return null;
  const box =
    Array.isArray(value.box) &&
    value.box.length === 4 &&
    value.box.every((n) => finite(n) !== null && (n as number) >= 0 && (n as number) <= 1)
      ? (value.box as [number, number, number, number])
      : null;
  return {
    source,
    page: Math.max(1, Math.round(finite(value.page) ?? 1)),
    view: text(value.view),
    box,
  };
}

function limitsOf(row: Record<string, unknown>, nominal: number | null) {
  if (Array.isArray(row.limits) && row.limits.length === 2) {
    const [a, b] = row.limits.map(finite);
    if (a !== null && a !== undefined && b !== null && b !== undefined) {
      return [Math.min(a, b), Math.max(a, b)] as const;
    }
  }
  // A plus and minus tolerance, as `[-0.005, 0.005]` around the nominal.
  if (nominal !== null && Array.isArray(row.tolerance) && row.tolerance.length === 2) {
    const [a, b] = row.tolerance.map(finite);
    if (a !== null && a !== undefined && b !== null && b !== undefined) {
      return [nominal + Math.min(a, b), nominal + Math.max(a, b)] as const;
    }
  }
  return null;
}

function generalToleranceOf(value: unknown): GeneralTolerance | null {
  if (!isRecord(value)) return null;
  const decimals: Record<string, number> = {};
  if (isRecord(value.decimals)) {
    for (const [places, band] of Object.entries(value.decimals)) {
      const size = finite(band);
      if (/^\d$/.test(places) && size !== null && size > 0) decimals[places] = size;
    }
  }
  return {
    decimals,
    fraction: finite(value.fraction),
    angle: finite(value.angle),
  };
}

/** A drawing check from its file, or null when the file is not one (or not yet whole). */
export function parseDrawingCheck(contents: string): DrawingCheck | null {
  let data: unknown;
  try {
    data = JSON.parse(contents);
  } catch {
    return null;
  }
  if (!isRecord(data) || !Array.isArray(data.dimensions)) return null;
  const units = unitsOf(data.units, "mm");
  const sources: DrawingSource[] = (Array.isArray(data.sources) ? data.sources : []).flatMap(
    (source, index) =>
      isRecord(source)
        ? [
            {
              id: text(source.id) ?? `source-${index + 1}`,
              file: text(source.file),
              pages: text(source.pages),
              title: text(source.title),
            },
          ]
        : [],
  );
  const dimensions = data.dimensions.flatMap((row, index): DrawingDimension[] => {
    if (!isRecord(row)) return [];
    const feature = text(row.feature) ?? text(row.label);
    if (feature === null) return [];
    const nominal = finite(row.nominal) ?? finite(row.value);
    const flag = FLAGS.find((word) => word === text(row.flag)?.toLowerCase()) ?? null;
    const confidence = text(row.confidence)?.toLowerCase();
    return [
      {
        id: text(row.id) ?? `d${index + 1}`,
        text: text(row.text) ?? text(row.drawing),
        nominal,
        units: unitsOf(row.units, units),
        limits: limitsOf(row, nominal),
        feature,
        featureRef: text(row.featureRef),
        where: placeOf(row.where, sources),
        confidence: confidence === "medium" || confidence === "low" ? confidence : "high",
        measured: finite(row.measured),
        measuredHow: text(row.measuredHow),
        flag,
        confirmed: text(row.confirmed) ?? (row.confirmed === true ? "Confirmed" : null),
        note: text(row.note),
        related: Array.isArray(row.related) ? row.related.flatMap((id) => text(id) ?? []) : [],
      },
    ];
  });
  return {
    part: text(data.part),
    model: text(data.model),
    units,
    measuredBy: text(data.measuredBy),
    generalTolerance: generalToleranceOf(data.generalTolerance),
    sources,
    dimensions,
  };
}

/** A fraction as printed ("1 1/4", "R2 3/4", "5/16"), not limits written with a slash ("1.000/1.002"). */
const FRACTION = /(?:^|[^\d.])\d+\/\d+(?![\d.])/;

/** A count before a size: "2X", "3 X", "(4)". */
const COUNT = /(?:^|\s)(?:\d+\s*X|\(\d+\))(?=\s|$|[^\w.])/gi;

/** How many decimals the first size in the text prints with: ".030" is 3, "20" is 0, "2X .03" is 2. */
export function printedDecimals(printed: string): number | null {
  const plain = printed.replaceAll(",", "");
  const SIZE = /\d*\.\d+|\d+/;
  // Without a size besides it, the count is the dimension: "(4) Places".
  const number = SIZE.exec(plain.replaceAll(COUNT, " ")) ?? SIZE.exec(plain);
  if (number === null) return null;
  const dot = number[0].indexOf(".");
  return dot === -1 ? 0 : number[0].length - dot - 1;
}

/** The band a dimension is held to: its own limits, else the title block's, else as printed. */
function bandOf(
  dimension: DrawingDimension,
  general: GeneralTolerance | null,
): GradedDimension["band"] {
  if (dimension.limits !== null) {
    return { low: dimension.limits[0], high: dimension.limits[1], from: "limits" };
  }
  const nominal = dimension.nominal;
  if (nominal === null) return null;
  const around = (half: number, from: BandSource) => ({
    low: nominal - half,
    high: nominal + half,
    from,
  });
  const printed = dimension.text;
  if (dimension.units === "deg") {
    if (general?.angle != null) return around(general.angle, "general");
  } else if (printed !== null && FRACTION.test(printed)) {
    if (general?.fraction != null) return around(general.fraction, "general");
  } else if (printed !== null) {
    const places = printedDecimals(printed);
    const half = places === null ? undefined : general?.decimals[String(places)];
    if (half !== undefined) return around(half, "general");
  }
  if (printed === null) return null;
  // No tolerance to hold it to: it matches when it rounds to what is printed.
  const places = FRACTION.test(printed) ? null : printedDecimals(printed);
  return places === null ? null : around(0.5 * 10 ** -places, "as-printed");
}

/** Float noise from a measurement must not fail a size sitting exactly on its limit. */
const SLACK = 1e-9;

function gradeDimension(
  dimension: DrawingDimension,
  general: GeneralTolerance | null,
): GradedDimension {
  const band = bandOf(dimension, general);
  const { measured, nominal } = dimension;
  const delta = measured !== null && nominal !== null ? measured - nominal : null;
  const status: DimensionStatus =
    dimension.flag === "note"
      ? "note"
      : dimension.flag === "reference"
        ? "reference"
        : dimension.flag !== null
          ? dimension.confirmed === null
            ? "flag"
            : "confirmed"
          : measured === null || band === null
            ? "not-checked"
            : measured >= band.low - SLACK - Math.abs(band.low) * SLACK &&
                measured <= band.high + SLACK + Math.abs(band.high) * SLACK
              ? "ok"
              : "out";
  return { ...dimension, status, delta, band };
}

export interface GradedDrawingCheck extends DrawingCheck {
  readonly dimensions: ReadonlyArray<GradedDimension>;
  readonly counts: Readonly<Record<DimensionStatus, number>>;
}

export function gradeDrawingCheck(check: DrawingCheck): GradedDrawingCheck {
  const dimensions = check.dimensions.map((row) => gradeDimension(row, check.generalTolerance));
  const counts: Record<DimensionStatus, number> = {
    ok: 0,
    out: 0,
    flag: 0,
    confirmed: 0,
    reference: 0,
    note: 0,
    "not-checked": 0,
  };
  for (const row of dimensions) counts[row.status] += 1;
  return { ...check, dimensions, counts };
}

/** The verdict in a line, in the report's words: "94 match · 9 to confirm · 1 out of tolerance". */
export function drawingCheckHeadline(counts: GradedDrawingCheck["counts"]): string {
  return (["out", "flag", "ok", "confirmed", "not-checked"] as const)
    .filter((status) => status === "ok" || counts[status] > 0)
    .map((status) => countWords(status, counts[status]))
    .join(" · ");
}

const MM_PER_INCH = 25.4;

/** A size in the other units, as a dual-dimensioned drawing prints it in brackets. */
export function otherUnits(value: number, units: DrawingUnits): string | null {
  if (units === "in") return `${(value * MM_PER_INCH).toFixed(2)} mm`;
  if (units === "mm") return `${(value / MM_PER_INCH).toFixed(3)} in`;
  return null;
}

/** A number in a dimension's units, to one more decimal than the drawing prints it (at least 3). */
export function formatValue(value: number, row: Pick<DrawingDimension, "units" | "text">): string {
  const places = row.text === null ? null : printedDecimals(row.text);
  const digits = Math.min(5, Math.max(row.units === "deg" ? 2 : 3, (places ?? 2) + 1));
  return row.units === "deg" ? `${value.toFixed(digits)}°` : value.toFixed(digits);
}

/** A count of rows in a status, in words: "24 match", "1 out of tolerance", "2 notes". */
export function countWords(status: DimensionStatus, count: number): string {
  const one = count === 1;
  const words: Record<DimensionStatus, string> = {
    ok: "match",
    out: "out of tolerance",
    flag: "to confirm",
    confirmed: "confirmed",
    "not-checked": "not checked",
    reference: one ? "reference" : "references",
    note: one ? "note" : "notes",
  };
  return `${count} ${words[status]}`;
}

export const STATUS_WORDS: Readonly<Record<DimensionStatus, string>> = {
  ok: "Matches",
  out: "Out of tolerance",
  flag: "To confirm",
  confirmed: "Confirmed",
  reference: "Reference",
  note: "Note",
  "not-checked": "Not checked",
};

const FLAG_WORDS: Readonly<Record<DrawingFlag, string>> = {
  conflict: "conflict",
  missing: "not on the drawing",
  unclear: "hard to read",
  reference: "reference",
  note: "note",
};

const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");

/** The report as Markdown, to keep beside the check or send on: a table like a checked print. */
export function drawingCheckMarkdown(check: GradedDrawingCheck, title: string): string {
  return [
    `# ${title}`,
    "",
    `${drawingCheckHeadline(check.counts)}. Drawing units: ${check.units}.`,
    "",
    check.measuredBy === null
      ? "Model values: none measured."
      : `Model values are measured on the built model by \`${check.measuredBy}\`.`,
    "",
    "| Feature | Drawing | Model | Status | Where | Note |",
    "|---|---|---|---|---|---|",
    ...reportOrder(check.dimensions).map(
      (row) =>
        `| ${[
          row.feature,
          row.text ?? "(not dimensioned)",
          modelWords(row),
          statusWords(row),
          placeWords(check, row),
          row.note ?? "",
        ]
          .map(cell)
          .join(" | ")} |`,
    ),
    "",
  ].join("\n");
}

/** A row's place on the drawing, in words: "Servo bracket drawing, p.1, Top". */
export function placeWords(check: DrawingCheck, row: DrawingDimension): string {
  if (row.where === null) return "";
  const source = check.sources.find((s) => s.id === row.where?.source);
  const name = source?.title ?? source?.file?.split("/").at(-1) ?? row.where.source;
  return [name, `p.${row.where.page}`, row.where.view].filter(Boolean).join(", ");
}

/** What the model measures, with how far from the drawing: "8.275 (Δ -0.005)". */
export function modelWords(row: GradedDimension): string {
  if (row.measured === null) return "not checked";
  const delta =
    row.delta === null || Math.abs(row.delta) < 1e-12
      ? ""
      : ` (Δ ${row.delta > 0 ? "+" : ""}${formatValue(row.delta, row)})`;
  return `${formatValue(row.measured, row)}${delta}`;
}

/** A row's status in words, with what its flag means: "To confirm: conflict". */
export const statusWords = (row: GradedDimension) =>
  row.flag !== null && (row.status === "flag" || row.status === "confirmed")
    ? `${STATUS_WORDS[row.status]}: ${FLAG_WORDS[row.flag]}`
    : STATUS_WORDS[row.status];

/** The order a report lists rows in: what needs the engineer first, then the drawing's order. */
const ROW_ORDER: Readonly<Record<DimensionStatus, number>> = {
  out: 0,
  flag: 1,
  "not-checked": 2,
  ok: 3,
  confirmed: 4,
  reference: 5,
  note: 6,
};

export const reportOrder = (rows: ReadonlyArray<GradedDimension>) =>
  rows.toSorted((a, b) => ROW_ORDER[a.status] - ROW_ORDER[b.status]);

/**
 * The check as Studio's check results read (`checkResults.ts`), so it shows with a part's other
 * checks: a size out of tolerance fails it, a number to confirm warns.
 */
export function drawingCheckResult(
  path: string,
  contents: string,
  modifiedAt?: string,
): CheckResult | null {
  const parsed = parseDrawingCheck(contents);
  if (parsed === null) return null;
  const check = gradeDrawingCheck(parsed);
  const issues = reportOrder(check.dimensions).flatMap((row): CheckIssue[] =>
    row.status === "out"
      ? [
          {
            severity: "error",
            summary: `${row.feature}: ${modelWords(row)} on the model, ${row.text ?? "not dimensioned"} on the drawing`,
            detail: row.note,
          },
        ]
      : row.status === "flag"
        ? [
            {
              severity: "warning",
              summary: `${row.feature}: ${row.flag === null ? "to confirm" : FLAG_WORDS[row.flag]}`,
              detail: row.note,
            },
          ]
        : [],
  );
  const name = path.replaceAll("\\", "/").split("/").at(-1) ?? path;
  return {
    path,
    // What its badge opens: the report, which shows the part a press away.
    model: path,
    part: (parsed.model ?? parsed.part ?? name.replace(DRAWING_CHECK_FILE, "")).split("/").at(-1)!,
    check: "Drawing check",
    status: check.counts.out > 0 ? "fix" : check.counts.flag > 0 ? "warnings" : "ready",
    headline: drawingCheckHeadline(check.counts),
    issues,
    ...(modifiedAt === undefined ? {} : { written: Date.parse(modifiedAt) / 1000 }),
  };
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Status colours on paper: red, amber and green say only how a row went (law 7). */
const PAPER_TONES: Readonly<Record<DimensionStatus, string>> = {
  ok: "#15803d",
  out: "#b91c1c",
  flag: "#b45309",
  confirmed: "#15803d",
  reference: "#52525b",
  note: "#52525b",
  "not-checked": "#52525b",
};

/** The report as a printable page, for the desktop app to save as PDF: no script, no pictures. */
export function drawingCheckHtml(check: GradedDrawingCheck, title: string): string {
  const rows = reportOrder(check.dimensions)
    .map(
      (row) => `<tr>
<td>${escapeHtml(row.feature)}</td>
<td>${escapeHtml(row.text ?? "(not dimensioned)")}${row.band === null || row.band.from === "as-printed" ? "" : `<div class="sub">${formatValue(row.band.low, row)} to ${formatValue(row.band.high, row)}</div>`}</td>
<td>${escapeHtml(modelWords(row))}${row.measuredHow === null ? "" : `<div class="sub">${escapeHtml(row.measuredHow)}</div>`}</td>
<td style="color:${PAPER_TONES[row.status]};font-weight:600">${escapeHtml(statusWords(row))}</td>
<td>${escapeHtml(placeWords(check, row))}</td>
<td>${escapeHtml(row.note ?? "")}</td>
</tr>`,
    )
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font:10px/1.35 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#18181b;margin:0}
h1{font-size:16px;margin:0 0 4px}p{margin:0 0 10px;color:#3f3f46}
table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:4px 6px;border-bottom:1px solid #e4e4e7}
th{font-weight:600;border-bottom:1.5px solid #18181b}tr{page-break-inside:avoid}.sub{color:#71717a;font-size:9px}
</style></head><body><h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(drawingCheckHeadline(check.counts))}. Drawing units: ${check.units}. ${
    check.measuredBy === null
      ? "Model values: none measured."
      : `Model values measured on the built model by ${escapeHtml(check.measuredBy)}.`
  }</p>
<table><thead><tr><th>Feature</th><th>Drawing</th><th>Model</th><th>Status</th><th>Where</th><th>Note</th></tr></thead>
<tbody>
${rows}
</tbody></table></body></html>`;
}

/**
 * The part of a sheet a row's crop shows, in the sheet's pixels: its callout with room around it
 * to see what it dimensions, at the crop's aspect, inside the sheet. Without a box, the whole sheet.
 */
export function regionAround(
  box: DrawingPlace["box"],
  sheet: { readonly width: number; readonly height: number },
  aspect: number,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const fit = Math.min(sheet.width, sheet.height * aspect);
  if (box === null) {
    return {
      x: (sheet.width - fit) / 2,
      y: (sheet.height - fit / aspect) / 2,
      width: fit,
      height: fit / aspect,
    };
  }
  const [bx, by, bw, bh] = box;
  const width = Math.min(
    fit,
    Math.max(bw * sheet.width * 3, bh * sheet.height * 3 * aspect, 0.12 * sheet.width),
  );
  const height = width / aspect;
  const clamp = (value: number, room: number) => Math.min(Math.max(value, 0), Math.max(room, 0));
  return {
    x: clamp((bx + bw / 2) * sheet.width - width / 2, sheet.width - width),
    y: clamp((by + bh / 2) * sheet.height - height / 2, sheet.height - height),
    width,
    height,
  };
}
