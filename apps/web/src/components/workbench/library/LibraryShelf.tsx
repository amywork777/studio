import type { LucideIcon } from "lucide-react";
import { type CSSProperties, Fragment, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { MODULE_HEADING } from "../studioLayout";

/** Columns of rows, by the width of the page's `@container`: one rule for every shelf. */
const SHELF_COLUMNS = "grid-cols-2 @4xl:grid-cols-3";

/** How many columns `SHELF_COLUMNS` comes to, at each of its widths. */
const COLUMN_COUNTS = [2, 3] as const;

/** A shelf's rows across the page's columns. */
const SHELF_ROW = `grid gap-2 ${SHELF_COLUMNS}`;

/** The shelves on the same columns as their rows, so a row is one size on any of them. */
export const SHELF_GRID = `grid min-w-0 gap-x-2 gap-y-6 ${SHELF_COLUMNS}`;

/**
 * A shelf this short takes only its covers' columns, in place of a whole row, and shares the row
 * with the next. Its covers' tracks come out the width of `SHELF_GRID`'s: same width, same gap.
 */
const SHORT_SHELVES: Readonly<
  Partial<Record<number, { readonly span: string; readonly row: string }>>
> = {
  1: { span: "col-span-1", row: "grid grid-cols-1 gap-2" },
  2: { span: "col-span-2", row: "grid grid-cols-2 gap-2" },
};

/**
 * The last short shelf, out to the end of its row by the spans `shortRowEnd` sets, so the row ends
 * on a rule and not a hole. Subgrid keeps its covers on the page's tracks, however wide it spans.
 */
const ROW_END_SHELF =
  "grid grid-cols-subgrid content-start gap-y-2 col-span-(--span-of-2) @4xl:col-span-(--span-of-3)";

/** A shelf the page lists: what its index and its heading both show. */
export interface Shelf {
  readonly key: string;
  readonly title: string;
  readonly icon: LucideIcon;
  readonly tint: string;
  readonly count: number;
  /** Who it comes from, over its run of shelves in the index. */
  readonly source?: string;
}

/** A shelf's place on the page, which `group` in the URL and the shelf index scroll to. */
export const shelfAnchor = (key: string) => `library-${key}`;

/**
 * The shelves in page order, with the short ones drawn up to the first of them so they share rows.
 * In the list, not a dense grid, so tab order stays what the page shows.
 */
export function gatherShortShelves<T>(
  shelves: ReadonlyArray<T>,
  tiles: (shelf: T) => number,
): ReadonlyArray<T> {
  const isShort = (shelf: T) => SHORT_SHELVES[tiles(shelf)] !== undefined;
  const longBefore = shelves.findIndex(isShort);
  if (longBefore === -1) return shelves;
  const long = shelves.filter((shelf) => !isShort(shelf));
  return [...long.slice(0, longBefore), ...shelves.filter(isShort), ...long.slice(longBefore)];
}

/**
 * The last short shelf and the columns left on its row at each of `COLUMN_COUNTS`, as `ROW_END_SHELF`
 * reads them. Short shelves fill a row left to right and wrap whole, as the grid places them.
 */
export function shortRowEnd<T>(
  shelves: ReadonlyArray<T>,
  tiles: (shelf: T) => number,
): { readonly shelf: T; readonly spans: CSSProperties } | null {
  const short = shelves.filter((shelf) => SHORT_SHELVES[tiles(shelf)] !== undefined);
  const last = short.at(-1);
  if (last === undefined) return null;
  const spanOf = (columns: number) => {
    const taken = short.slice(0, -1).reduce((used, shelf) => {
      const fits = used + tiles(shelf) <= columns;
      return fits ? used + tiles(shelf) : tiles(shelf);
    }, 0);
    return taken + tiles(last) <= columns ? columns - taken : columns;
  };
  return {
    shelf: last,
    spans: Object.fromEntries(
      COLUMN_COUNTS.map((columns) => [`--span-of-${columns}`, spanOf(columns)]),
    ) as CSSProperties,
  };
}

/** One shelf: its title in its hue over a line, then its covers, always open. */
export function LibraryShelf(props: {
  readonly shelf: Shelf;
  /** How many covers it holds, Add a skill's among them. */
  readonly tiles: number;
  /** A line under the title. */
  readonly note?: string;
  /** Set on the last short shelf: the columns left on its row (`shortRowEnd`). */
  readonly rowEnd?: CSSProperties | undefined;
  readonly children: ReactNode;
}) {
  const { shelf, rowEnd } = props;
  const Icon = shelf.icon;
  const short = SHORT_SHELVES[props.tiles];
  return (
    <section
      id={shelfAnchor(shelf.key)}
      aria-label={shelf.title}
      style={rowEnd}
      className={cn(
        "min-w-0 scroll-mt-6",
        rowEnd === undefined
          ? ["flex flex-col gap-3", short?.span ?? "col-span-full"]
          : ROW_END_SHELF,
      )}
    >
      <h2
        className={cn(
          MODULE_HEADING,
          "items-center border-b border-border pb-2",
          rowEnd === undefined ? null : "col-span-full",
        )}
      >
        <Icon aria-hidden="true" className={cn("size-4 shrink-0", shelf.tint)} />
        <span className="truncate">{shelf.title}</span>
        <span className="tabular-nums">{shelf.count}</span>
      </h2>
      {props.note === undefined ? null : (
        <p
          className={cn(
            "text-sm text-muted-foreground",
            rowEnd === undefined ? null : "col-span-full",
          )}
        >
          {props.note}
        </p>
      )}
      <div
        className={
          rowEnd === undefined
            ? (short?.row ?? SHELF_ROW)
            : "col-span-full grid grid-cols-subgrid gap-y-2"
        }
      >
        {props.children}
      </div>
    </section>
  );
}

/**
 * An index of shelves, down a page's side as a library's directory is. A press goes there. The
 * shelves take the width left beside it, so a cover stays one size on every shelf.
 */
export function ShelfIndex(props: { readonly shelves: ReadonlyArray<Shelf> }) {
  return (
    <nav
      aria-label="Shelves"
      className="sticky top-0 hidden w-40 shrink-0 flex-col gap-0.5 @3xl:flex"
    >
      {props.shelves.map((shelf, index) => {
        const Icon = shelf.icon;
        const button = (
          <button
            key={shelf.key}
            type="button"
            onClick={() =>
              document.getElementById(shelfAnchor(shelf.key))?.scrollIntoView({ block: "start" })
            }
            className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <Icon aria-hidden="true" className={cn("size-4 shrink-0", shelf.tint)} />
            <span className="min-w-0 flex-1 truncate">{shelf.title}</span>
            <span className="text-xs text-muted-foreground">{shelf.count}</span>
          </button>
        );
        return shelf.source === undefined || shelf.source === props.shelves[index - 1]?.source ? (
          button
        ) : (
          <Fragment key={shelf.key}>
            <p className={cn(MODULE_HEADING, "px-2 py-1.5")}>{shelf.source}</p>
            {button}
          </Fragment>
        );
      })}
    </nav>
  );
}
