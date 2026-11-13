import type { InstalledPlugin } from "@t3tools/contracts";

/**
 * Whether something New or the library offers can be made now; `installed` tells a skill turned
 * off from a plugin not installed. Imports neither New nor the library, so New can use it
 * without importing the library.
 */
export type Availability =
  | { readonly on: true }
  | {
      readonly on: false;
      readonly skill: string;
      readonly plugin: string;
      readonly installed: boolean;
    };

/** The plugin Studio's own skills come from. */
export const TEXT_TO_CAD = "text-to-cad";

/**
 * A skill no enabled plugin has, named with the first installed plugin that lists it, or with
 * text-to-cad when none does.
 */
export function missingSkill(skill: string, plugins: ReadonlyArray<InstalledPlugin>) {
  const lister = plugins.find((plugin) => plugin.skills.includes(skill));
  return {
    on: false,
    skill,
    plugin: lister?.id ?? TEXT_TO_CAD,
    installed: lister !== undefined,
  } as const;
}
