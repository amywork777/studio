import { type DraftingStandard, usualGeneralTolerance } from "@t3tools/contracts";
import { EMPTY_STUDIO_BRIEF, type StudioProjectKind } from "@t3tools/shared/studioProjects";

/** What a new project's brief is made from: its kind, and what its maker already knows of it. */
export interface NewProjectBriefInput {
  readonly kind: StudioProjectKind;
  readonly units: "mm" | "in";
  /** Whose rules its drawings follow, from Settings, Engineering. */
  readonly standard: DraftingStandard;
  /** The general tolerance Settings states; empty is the standard's usual. */
  readonly generalTolerance: string;
  readonly material: string;
  readonly purpose: string;
  /** How it is made, when known (a copy of an example); the kind's own process otherwise. */
  readonly process?: string;
}

/**
 * A new project's brief: empty but for its units, drawing conventions, material, process and
 * purpose. The process is the one given, or else the kind's, so a copy of a CNC example is a CNC
 * project, not a part's. The tolerance is kept as stated, so a later Settings change leaves it be.
 */
export function newProjectBrief(input: NewProjectBriefInput) {
  const process = input.process?.trim();
  return {
    ...EMPTY_STUDIO_BRIEF,
    units: input.units,
    standard: input.standard,
    generalTolerance:
      input.generalTolerance.trim() || usualGeneralTolerance(input.standard, input.units),
    material: input.material.trim(),
    process: process === undefined || process === "" ? input.kind.process : process,
    purpose: input.purpose.trim(),
  };
}
