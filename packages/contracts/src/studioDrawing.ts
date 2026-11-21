import * as Schema from "effect/Schema";

/**
 * Studio: whose rules a project's drawings are read by (Settings, Engineering). ISO is ISO GPS with
 * first-angle projection; ASME is ASME Y14.5 with third-angle, as text-to-cad's `Profile` names them.
 */
export const DRAFTING_STANDARDS = ["ISO", "ASME"] as const;
export const DraftingStandard = Schema.Literals(DRAFTING_STANDARDS);
export type DraftingStandard = typeof DraftingStandard.Type;

export const ProjectUnits = Schema.Literals(["mm", "in"]);
export type ProjectUnits = typeof ProjectUnits.Type;

/**
 * The general tolerance a drawing states when the engineer has not set one. ISO names a class of
 * ISO 2768; a Y14.5 drawing states its values, and text-to-cad refuses either standard's words
 * under the other.
 */
export function usualGeneralTolerance(standard: DraftingStandard, units: ProjectUnits): string {
  if (standard === "ISO") return "ISO 2768-m";
  return units === "in" ? "±.005" : "±0.1";
}
