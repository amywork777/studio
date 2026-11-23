import {
  type DraftingStandard,
  type StudioProjectBrief,
  usualGeneralTolerance,
} from "@t3tools/contracts";

/**
 * A project's brief: what Studio and the agent should know before any design
 * work. It lives on the project (`StudioProject` in contracts), which the
 * server hands to every agent in the project's folders; the sketches, photos,
 * datasheets and mating parts it gathers are filed under `brief/references/`.
 */

export {
  EMPTY_STUDIO_BRIEF as EMPTY_BRIEF,
  STUDIO_PROCESSES as PROCESSES,
} from "@t3tools/shared/studioProjects";

export type ProjectBrief = StudioProjectBrief;

export const BRIEF_REFERENCES = "brief/references";

/** The setup the project page shows as a CAD tool's document properties. */
export type SetupKey =
  | "units"
  | "material"
  | "process"
  | "quantity"
  | "standard"
  | "generalTolerance";

/** Each setup key as a request names it. */
const SETUP_WORDS: Record<SetupKey, string> = {
  units: "units",
  material: "material",
  process: "process",
  quantity: "quantity",
  standard: "drafting standard",
  generalTolerance: "general tolerance",
};

/** A drafting standard as Studio names it (Settings, Engineering; the Overview's properties). */
export const STANDARD_LABELS: Record<DraftingStandard, string> = {
  ISO: "ISO",
  ASME: "ASME Y14.5",
};

/**
 * What picking a setup value asks of the agent: one plain request, which it
 * applies to the project and then explains (`studioProjectContext`).
 */
export function setupRequest(key: SetupKey, value: string): string {
  const word = SETUP_WORDS[key];
  if (value === "") return `Clear the project's ${word}.`;
  const shown =
    key === "units"
      ? value === "in"
        ? "inches"
        : "millimeters"
      : key === "standard" && (value === "ISO" || value === "ASME")
        ? STANDARD_LABELS[value]
        : value;
  return `Change the project's ${word} to ${shown}.`;
}

/**
 * The project's properties in one line, as a CAD tool's document properties read:
 * `mm · ISO · ISO 2768-m · PLA`. An unset tolerance is the standard's usual; no material, none said.
 */
export function propertiesLine(brief: StudioProjectBrief): string {
  const standard = brief.standard ?? "ISO";
  const tolerance = brief.generalTolerance?.trim() || usualGeneralTolerance(standard, brief.units);
  return [brief.units, STANDARD_LABELS[standard], tolerance, brief.material.trim()]
    .filter((part) => part !== "")
    .join(" · ");
}
