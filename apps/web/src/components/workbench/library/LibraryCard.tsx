import type { ReactNode, Ref } from "react";

import { cn } from "~/lib/utils";

/** The tags a card names, whole; the rest are counted, so its line fits a tile without cutting one. */
const TAGS_SHOWN = 2;

/**
 * A card, as Home's project tiles are: a picture over a name, and a note or tags under it. A press
 * opens what it shows; a disabled one says why in its note, and one that needs a program or a
 * download first says which. The Library's entries, the Toolbox's groups and the examples
 * (`ExampleCard`, with what each shows as tags) are these. Tags are one quiet line, so the name
 * leads.
 */
export function LibraryCard({
  ref,
  ...props
}: {
  /** The picture (`LibraryPicture`); its name says what it is, so it is hidden from readers. */
  readonly picture: ReactNode;
  readonly name: string;
  readonly note: string | null;
  /** Two lines on what it is, a skill's blurb. */
  readonly blurb?: string;
  /** Short words under the name: what an example shows. */
  readonly tags?: ReadonlyArray<string>;
  readonly disabled?: boolean;
  readonly onOpen: () => void;
  readonly ref?: Ref<HTMLButtonElement>;
}) {
  const tags = props.tags ?? [];
  const uncounted = tags.length - TAGS_SHOWN;
  return (
    <button
      ref={ref}
      type="button"
      onClick={props.onOpen}
      disabled={props.disabled}
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background text-left outline-none transition-colors duration-150 enabled:hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-64"
    >
      {/* A page's words in the picture would be read out as the name. */}
      <span aria-hidden="true" className="flex flex-col">
        {props.picture}
      </span>
      {/* A Toolbox cover keeps room for a name and blurb of two lines each: one tile size. */}
      <span
        className={cn(
          "flex min-w-0 flex-col gap-1 p-3",
          props.tags === undefined ? "min-h-25" : null,
        )}
      >
        <span className="line-clamp-2 text-sm font-medium text-foreground">{props.name}</span>
        {props.blurb === undefined ? null : (
          <span className="line-clamp-2 h-[2lh] text-xs text-muted-foreground">{props.blurb}</span>
        )}
        {props.note === null ? null : (
          <span className="line-clamp-2 text-xs text-muted-foreground">{props.note}</span>
        )}
        {tags.length === 0 ? null : (
          <span className="flex min-w-0 gap-1 text-xs text-muted-foreground">
            <span className="min-w-0">{tags.slice(0, TAGS_SHOWN).join(" · ")}</span>
            {uncounted > 0 ? <span className="shrink-0">+{uncounted}</span> : null}
          </span>
        )}
      </span>
    </button>
  );
}
