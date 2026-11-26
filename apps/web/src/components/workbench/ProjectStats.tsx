import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** A fact that opens what it counts: "Drawing", "Parts list". */
export interface ProjectLink {
  readonly label: string;
  /** What a press opens, for its tooltip and screen readers. */
  readonly opens: string;
  readonly onPress: () => void;
}

const CHIP =
  "inline-flex h-5 items-center gap-1 rounded-md border border-border bg-card px-1.5 text-xs text-foreground outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/**
 * The Overview's facts at a glance, one line under the project's name: what it is made of, how many
 * parts and its size, as plain words, then what it has (its drawings, parts list) as small chips
 * that open it, and when it was last exported. Only what is known: a size a run measured, never a
 * guess (law 4), and nothing is said of what is missing.
 */
export function ProjectStats(props: {
  /** "5052-H32 aluminium", "10 parts", "105 × 140 × 80 mm": each known fact, in that order. */
  readonly spec: ReadonlyArray<string>;
  readonly links: ReadonlyArray<ProjectLink>;
  /** Plain facts said after the chips: "Exported 2026-11-25". */
  readonly notes: ReadonlyArray<string>;
}) {
  if (props.spec.length + props.links.length + props.notes.length === 0) return null;
  return (
    // Its pieces sit in the heading's one line (`ProjectHeading`), beside the last build.
    <div aria-label="At a glance" className="contents text-sm">
      {props.spec.length === 0 ? null : (
        <span className="text-foreground">{props.spec.join(" · ")}</span>
      )}
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
      {props.notes.map((note) => (
        <span key={note} className="text-xs text-muted-foreground">
          {note}
        </span>
      ))}
    </div>
  );
}
