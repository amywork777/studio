/**
 * Every page: `WorkspacePageContainer`, `PageTitle` 24px; `gap-6` between sections, `gap-3` label to
 * content, `gap-2` between siblings, `p-3` inside cards. Controls `size="sm"`/`"icon-sm"` (28px);
 * `rounded-lg` outside, `rounded-md` only inside. Type: `MODULE_HEADING`, `GROUP_LABEL`, body
 * `text-sm`, secondary `text-xs`; nothing smaller but the rail's count.
 */

/** A section's label, on every page and in Settings. */
export const MODULE_HEADING =
  "flex items-baseline gap-2 text-xs font-medium text-muted-foreground uppercase";

/** Said quietly in a section's label: where its words came from, or when they were written. */
export const MODULE_NOTE = "font-normal text-muted-foreground normal-case";

/** A group within a section, such as Starred and Recent, or a Toolbox section's tools. */
export const GROUP_LABEL = "text-xs font-medium text-muted-foreground";

/** A section's label over its content, or groups one over the next. */
export const SECTION_STACK = "flex min-w-0 flex-col gap-3";

/** Home's and Projects' tiles, four across on a wide window. */
export const TILE_GRID = "grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4";

/**
 * A group of project tiles: `TILE_GRID`, or five across where four across would leave one tile
 * alone on its last row (5, 9, 13). By the group, so every project stays and no row is capped.
 */
export const projectTileGrid = (tiles: number) =>
  tiles > 1 && tiles % 4 === 1 ? "grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5" : TILE_GRID;

/** The card grid every module of files uses, by the width of its `@container`. */
export const CARD_GRID = "grid grid-cols-2 gap-2 @xl:grid-cols-3 @4xl:grid-cols-4";
