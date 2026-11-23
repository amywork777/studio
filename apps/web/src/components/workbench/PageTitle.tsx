import type { ReactNode } from "react";

/** A page's title at the top of its frame: how many it lists, a line more, and its actions. */
export function PageTitle(props: {
  readonly title: ReactNode;
  /** What the title names, small and grey beside it: "Part". */
  readonly label?: ReactNode;
  /** How many the page lists, beside its title; none for a page of one thing. */
  readonly count?: number | undefined;
  readonly lede?: ReactNode;
  /** The page's actions, at the end of its title. */
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-base leading-5 font-semibold text-foreground">
          {props.title}
          {props.label === undefined ? null : (
            <>
              {" "}
              <span className="text-sm font-normal text-muted-foreground">{props.label}</span>
            </>
          )}
          {props.count === undefined ? null : (
            <>
              {" "}
              <span className="text-sm font-normal text-muted-foreground tabular-nums">
                {props.count}
              </span>
            </>
          )}
        </h1>
        {props.lede === undefined ? null : (
          <p className="text-sm text-muted-foreground">{props.lede}</p>
        )}
      </div>
      {props.action === undefined ? null : (
        <div className="flex min-h-8 items-center gap-2">{props.action}</div>
      )}
    </div>
  );
}
