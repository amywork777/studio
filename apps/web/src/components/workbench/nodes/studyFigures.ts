/**
 * The numbers a strength study's result gives (`cad fea` writes them in its `.fea.json` summary): the
 * load it was run under, the material, the peak stress against the material's limit, the safety
 * factor and the most the part moves. Only what the result holds; nothing is worked out here.
 */

export interface Figure {
  readonly label: string;
  readonly value: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** A figure to three significant digits, never in exponent form: 521, 0.529, 0.000114. */
export function figure(value: number): string {
  if (value === 0) return "0";
  const digits = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(value))));
  return Number(value.toFixed(Math.min(digits, 12))).toLocaleString("en-US", {
    maximumFractionDigits: 12,
  });
}

/** A study result's figures, in the order a reader takes them; none for a file that is not one. */
export function studyFigures(contents: string): ReadonlyArray<Figure> {
  let data: unknown;
  try {
    data = JSON.parse(contents);
  } catch {
    return [];
  }
  if (!isRecord(data) || !isRecord(data.summary)) return [];
  const summary = data.summary;
  const figures: Figure[] = [];

  const force = Array.isArray(summary.applied_force_N)
    ? summary.applied_force_N.map(num).filter((value): value is number => value !== null)
    : [];
  if (force.length > 0) {
    figures.push({ label: "Load", value: `${figure(Math.hypot(...force))} N` });
  }
  const material = isRecord(data.material) ? data.material.name : null;
  if (typeof material === "string" && material.trim() !== "") {
    figures.push({ label: "Material", value: material.trim() });
  }
  const check =
    Array.isArray(summary.checks) && isRecord(summary.checks[0]) ? summary.checks[0] : null;
  const stress = num(check?.value) ?? num(summary.max_von_mises_MPa);
  const limit = num(check?.limit) ?? num(summary.yield_MPa);
  const unit = typeof check?.unit === "string" ? check.unit : "MPa";
  if (stress !== null) {
    figures.push({
      label: "Peak stress",
      value:
        limit === null
          ? `${figure(stress)} ${unit}`
          : `${figure(stress)} ${unit} (limit ${figure(limit)} ${unit})`,
    });
  }
  const safety = num(summary.safety_factor);
  if (safety !== null) figures.push({ label: "Safety factor", value: figure(safety) });
  const moves = num(summary.max_displacement_mm);
  if (moves !== null) figures.push({ label: "Most it moves", value: `${figure(moves)} mm` });
  return figures;
}
