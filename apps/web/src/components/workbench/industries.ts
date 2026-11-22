import type { InstalledPlugin, PluginCatalogEntry } from "@t3tools/contracts";

/**
 * What a person makes, as the Toolbox page lists it: an industry is one skill and its jobs. Two are
 * built into text-to-cad and always there; the rest are Studio's own plugins (`studio-plugins/`),
 * off until the person turns one on, so its skill stays out of the agent's context for everyone
 * who does not make that kind of thing.
 */
export interface Industry {
  readonly id: string;
  readonly name: string;
  /** What it makes, in a line under its name. */
  readonly makes: string;
  /** Its skill, which its jobs run on (`INDUSTRY_ACTIONS`, or text-to-cad's own in `HARDWARE_ACTIONS`). */
  readonly skill: string;
  /** Its plugin in `studio-plugins/`, named as its skill; null for one built into text-to-cad. */
  readonly plugin: string | null;
}

export const INDUSTRIES: ReadonlyArray<Industry> = [
  {
    id: "electronics",
    name: "Electronics",
    makes: "Circuit boards in KiCad, their checks and the files a fab needs.",
    skill: "pcb",
    plugin: null,
  },
  {
    id: "robotics",
    name: "Robotics",
    makes: "Robot descriptions for ROS, MoveIt and MuJoCo.",
    skill: "robot-simulation",
    plugin: null,
  },
  {
    id: "apparel",
    name: "Apparel",
    makes: "Sewing patterns from measurements, graded, with a cutting-room file.",
    skill: "apparel",
    plugin: "apparel",
  },
  {
    id: "packaging",
    name: "Packaging",
    makes: "Folding cartons sized to the product, with the dieline to cut and crease.",
    skill: "packaging",
    plugin: "packaging",
  },
  {
    id: "woodworking",
    name: "Woodworking",
    makes: "Furniture from sheet goods, with a cut list and the boards laid out on sheets.",
    skill: "woodworking",
    plugin: "woodworking",
  },
  {
    id: "jewelry",
    name: "Jewelry",
    makes: "Rings and stone settings for casting, with the metal's weight.",
    skill: "jewelry",
    plugin: "jewelry",
  },
  {
    id: "footwear",
    name: "Footwear",
    makes: "Soles from a foot's size, and upper pieces flattened into patterns.",
    skill: "footwear",
    plugin: "footwear",
  },
];

/**
 * The catalog Studio's own plugins are listed in: the launcher copies `studio-plugins/` to a folder
 * of that name, and T3 Code's plugin store names a folder's catalog `local-<folder>`.
 */
export const STUDIO_CATALOG = "local-studio-plugins";

/**
 * The word every industry's listing carries (`category` in `studio-plugins`' marketplace.json), so
 * one search of the catalog finds them all whatever else it lists.
 */
export const INDUSTRY_CATALOG_QUERY = "industry";

/** Where an industry stands in this environment, for its row on the Toolbox page. */
export type IndustryStanding =
  /** Part of text-to-cad: there whenever its skill is, with nothing to turn on. */
  | { readonly state: "built-in"; readonly on: boolean }
  /** Its plugin is installed: the switch turns it on and off. */
  | { readonly state: "installed"; readonly on: boolean; readonly pluginId: string }
  /** Studio's catalog lists its plugin: the switch installs it, which turns it on. */
  | { readonly state: "listed"; readonly on: false; readonly key: string };

/**
 * An industry's standing by the installed plugins and the catalog's entries, or null for one this
 * build of Studio does not carry (its plugin neither installed nor listed), which gets no row.
 */
export function industryStanding(
  industry: Industry,
  plugins: ReadonlyArray<InstalledPlugin>,
  catalog: ReadonlyArray<PluginCatalogEntry>,
): IndustryStanding | null {
  if (industry.plugin === null) {
    const on = plugins.some((plugin) => plugin.enabled && plugin.skills.includes(industry.skill));
    return { state: "built-in", on };
  }
  const installed = plugins.find(
    (plugin) => plugin.id === industry.plugin && plugin.skills.includes(industry.skill),
  );
  if (installed !== undefined) {
    return { state: "installed", on: installed.enabled, pluginId: installed.id };
  }
  const listed = catalog.find(
    (entry) =>
      entry.name === industry.plugin &&
      entry.installedId === null &&
      entry.marketplaces.some((market) => market.id === STUDIO_CATALOG),
  );
  // Installed from Studio's own catalog, whichever catalog the entry leads with.
  return listed === undefined
    ? null
    : { state: "listed", on: false, key: `${STUDIO_CATALOG}/${industry.plugin}` };
}
