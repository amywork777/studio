import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** A fact that opens what it counts: "Drawing", "Parts list". */
export interface ProjectLink {
  readonly label: string;
  /** What a press opens, for its tooltip and screen readers. */
  readonly opens: string;
  readonly onPress: () => void;
}

const CHIP =
  "inline-flex h-6 items-center rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/**
 * The project's key facts beside its lead part: what it is made of, how many parts and its size,
 * each under its name, then what it has (its drawing, parts list) as chips that open it. Only what is
 * known: a size a run measured, never a guess (law 4); a fact no run gave is left out.
 */
export function ProjectFacts(props: {
  readonly facts: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly links: ReadonlyArray<ProjectLink>;
}) {
  if (props.facts.length + props.links.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {props.facts.length === 0 ? null : (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5">
          {props.facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="text-base leading-snug font-medium text-foreground tabular-nums">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {props.links.length === 0 ? null : (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {props.links.map((link) => (
            <Tooltip key={link.label}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`${link.label}: ${link.opens}`}
                    onClick={link.onPress}
                    className={CHIP}
                  />
                }
              >
                {link.label}
              </TooltipTrigger>
              <TooltipPopup side="bottom">{link.opens}</TooltipPopup>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
