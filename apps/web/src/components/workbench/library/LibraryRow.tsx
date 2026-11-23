import type { ReactNode, Ref } from "react";

import { cn } from "~/lib/utils";
import { PinStar } from "../PinStar";

/**
 * A Toolbox page entry as a compact row, the Toolbox popup's look: its small picture beside its
 * name and a line on it. With `pin`, a star at its end pins its one job (`PinStar`).
 */
export function LibraryRow({
  ref,
  ...props
}: {
  /** The picture, small (`LibraryPicture`); its name says what it is, so it is hidden from readers. */
  readonly picture: ReactNode;
  readonly name: string;
  readonly blurb?: string;
  readonly note: string | null;
  readonly pin?: { readonly jobId: string } | null;
  readonly onOpen: () => void;
  readonly ref?: Ref<HTMLButtonElement>;
}) {
  const pin = props.pin ?? null;
  const row = (
    <button
      ref={ref}
      type="button"
      onClick={props.onOpen}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-background p-2 text-left outline-none transition-colors duration-150 hover:border-foreground/25 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none",
        pin !== null && "pe-9",
      )}
    >
      <span aria-hidden="true" className="flex shrink-0">
        {props.picture}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{props.name}</span>
        {props.blurb === undefined ? null : (
          <span className="line-clamp-2 text-xs text-muted-foreground">{props.blurb}</span>
        )}
        {props.note === null ? null : (
          <span className="line-clamp-1 text-xs text-muted-foreground">{props.note}</span>
        )}
      </span>
    </button>
  );
  return pin === null ? (
    row
  ) : (
    <div className="group/pin relative min-w-0">
      {row}
      <PinStar jobId={pin.jobId} name={props.name} />
    </div>
  );
}

/** A row's picture box: small and square, framed (`LibraryPicture`'s `className`). */
export const ROW_PICTURE = "aspect-square size-14 shrink-0 rounded-md border border-border";
