import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface ProjectStat {
  readonly label: string;
  /** What it is, or what was not checked or made: "not checked", "none yet". */
  readonly value: string;
  /** It is not known yet: said quietly, and a press starts what finds it out. */
  readonly missing?: boolean;
  /** Opens what it counts, or starts what finds it out; none for a plain fact. */
  readonly onPress?: () => void;
  /** What a press does, for its tooltip and screen readers. */
  readonly pressLabel?: string;
}

const CHIP =
  "inline-flex min-h-6 items-baseline gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 text-xs";

/**
 * The Overview's facts at a glance, a chip each under the project's name: what it is made of, how
 * many parts, its size and mass where a run measured them, its drawings, parts list and last export.
 * What no run gave says so (law 4), and a press on it starts what would.
 */
export function ProjectStats(props: { readonly stats: ReadonlyArray<ProjectStat> }) {
  if (props.stats.length === 0) return null;
  return (
    <ul aria-label="At a glance" className="flex min-w-0 flex-wrap items-center gap-1.5">
      {props.stats.map((stat) => {
        const words = (
          <>
            <span className="text-muted-foreground">{stat.label}</span>
            <span
              className={cn(
                "font-medium tabular-nums",
                stat.missing === true ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {stat.value}
            </span>
          </>
        );
        return (
          <li key={stat.label}>
            {stat.onPress === undefined ? (
              <span className={CHIP}>{words}</span>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`${stat.label}: ${stat.value}. ${stat.pressLabel ?? ""}`}
                      onClick={stat.onPress}
                      className={cn(
                        CHIP,
                        "outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      )}
                    />
                  }
                >
                  {words}
                </TooltipTrigger>
                {stat.pressLabel === undefined ? null : (
                  <TooltipPopup side="bottom">{stat.pressLabel}</TooltipPopup>
                )}
              </Tooltip>
            )}
          </li>
        );
      })}
    </ul>
  );
}
