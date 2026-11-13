/**
 * A SolidCraft design's named sizes and timeline, read from `parameters.list` and
 * `inspect_design`. Sketch dimensions are drawn on the model instead (`dimensions.ts`).
 */

export interface DesignParameter {
  readonly name: string;
  readonly expression: string;
  readonly value: number;
  readonly unit: string;
  /** `user`: a named size; `sketch`: a sketch dimension; `feature`: a feature's input. */
  readonly source: string;
  readonly feature: string | null;
  readonly input: string | null;
  readonly comment?: string;
  readonly error: string | null;
}

export interface TimelineEntry {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly error: string | null;
  readonly warning: string | null;
  readonly suppressed: boolean;
  readonly rolled_back: boolean;
}

export interface TimelineFeature extends TimelineEntry {
  /** What it is, in a word: "Extrude", "Fillet", "Rectangular pattern". */
  readonly kind: string;
  /** Its own inputs, changed like any parameter. */
  readonly inputs: ReadonlyArray<DesignParameter>;
}

/** "RectangularPatternFeature" reads "Rectangular pattern"; "Sketch" stays "Sketch". */
export function featureKind(type: string): string {
  const words = type
    .replace(/Feature$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words === "" ? type : words[0]!.toUpperCase() + words.slice(1);
}

/** A value with its unit as an engineer writes it: "75 mm", "45°", "2". */
export function formatValue(value: number, unit: string): string {
  const rounded = Math.round(value * 1000) / 1000;
  const number = String(rounded);
  if (unit === "") return number;
  if (unit === "deg" || unit === "°") return `${number}°`;
  return `${number} ${unit}`;
}

/** Whether the expression only restates the value ("75 mm" for 75), so the panel shows it once. */
export function restatesValue(parameter: Pick<DesignParameter, "expression" | "value" | "unit">) {
  const plain = parameter.expression.replace(/\s+/g, "").toLowerCase();
  const number = String(Math.round(parameter.value * 1000) / 1000);
  const unit = parameter.unit.toLowerCase();
  return (
    plain === number || plain === `${number}${unit}` || (unit === "deg" && plain === `${number}deg`)
  );
}

/** The named sizes, and each feature with its inputs, in timeline order. */
export function designPanels(
  parameters: ReadonlyArray<DesignParameter>,
  timeline: ReadonlyArray<TimelineEntry>,
): { readonly named: DesignParameter[]; readonly features: TimelineFeature[] } {
  const named = parameters.filter((parameter) => parameter.source === "user");
  const features = timeline.map((entry) => ({
    ...entry,
    kind: featureKind(entry.type),
    inputs: parameters.filter(
      (parameter) => parameter.source === "feature" && parameter.feature === entry.name,
    ),
  }));
  return { named, features };
}

/** How the design built, in a line: "Built", "2 features failed", "1 warning". */
export function buildSummary(features: ReadonlyArray<TimelineEntry>): {
  readonly text: string;
  readonly tone: "ok" | "warning" | "error";
} {
  const live = features.filter((feature) => !feature.suppressed && !feature.rolled_back);
  const failed = live.filter((feature) => feature.error !== null).length;
  if (failed > 0) {
    return { text: `${failed} ${failed === 1 ? "feature" : "features"} failed`, tone: "error" };
  }
  const warned = live.filter((feature) => feature.warning !== null).length;
  if (warned > 0) {
    return { text: `${warned} ${warned === 1 ? "warning" : "warnings"}`, tone: "warning" };
  }
  return { text: "Built", tone: "ok" };
}
