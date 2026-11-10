import type { InstalledPlugin } from "@t3tools/contracts";

import { TEXT_TO_CAD } from "../workbench/library/skillAvailability";

/** Where each project lives, which About links to: its code, and how to take part. */
export const TEXT_TO_CAD_REPOSITORY = "https://github.com/earthtojake/text-to-cad";
export const TEXT_TO_CAD_DISCORD = "https://discord.gg/5FGB9DwJYU";
export const STUDIO_REPOSITORY = "https://github.com/amywork777/studio";
/** Where Studio lists everything it can send: its README's "Usage data" section. */
export const STUDIO_USAGE_DATA = `${STUDIO_REPOSITORY}#usage-data`;

/** The text-to-cad this Studio carries, as its plugin names it; null where it names none. */
export function textToCadVersion(
  plugins: ReadonlyArray<Pick<InstalledPlugin, "id" | "version">>,
): string | null {
  return plugins.find((plugin) => plugin.id === TEXT_TO_CAD)?.version ?? null;
}
