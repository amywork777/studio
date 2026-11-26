import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";
import { createElement } from "react";

import { Button } from "../ui/button";
import {
  RICH_TOOLTIP_DELAY,
  Tooltip,
  TooltipPopup,
  TooltipRich,
  TooltipTrigger,
} from "../ui/tooltip";
import { type HardwareAction, type HardwareActionGroup, jobLine } from "./hardwareActions";
import { MENU_TINTS } from "./kinds";
import { entryOfAction } from "./library/libraryCatalog";
import { LibraryPicture } from "./library/LibraryPicture";
import type { FeaturedJob, HomeRow } from "./toolbox";
import { toolIcon } from "./toolIcons";

/** A job's picture: its Library cover where it has one, else its tool icon on its tab's hue. */
function JobPicture(props: {
  readonly job: HardwareAction;
  readonly environmentId: EnvironmentId;
  readonly className: string;
}) {
  const entry = entryOfAction(props.job.id);
  if (entry !== null) {
    return (
      <LibraryPicture
        entry={entry}
        environmentId={props.environmentId}
        className={props.className}
      />
    );
  }
  return (
    <span
      className={`flex aspect-[8/5] items-center justify-center bg-current/10 dark:bg-current/15 ${MENU_TINTS[props.job.group]} ${props.className}`}
    >
      {createElement(toolIcon(props.job), {
        "aria-hidden": true,
        className: "size-8",
        strokeWidth: 1.5,
      })}
    </span>
  );
}

/**
 * The Toolbox's home, Featured: one large card for the job the part most needs (its cover, what it
 * makes in full, the project's reason where it has one, and Try), then rows of tiles that scroll
 * sideways (`homeRows`), each a cover, a name, its section and a Try pill. Try writes the job for
 * the part in front into the chat as a tile does. Every picture is a Library cover.
 */
export function ToolboxHome(props: {
  readonly environmentId: EnvironmentId;
  readonly featured: ReadonlyArray<FeaturedJob>;
  readonly rows: ReadonlyArray<HomeRow>;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  readonly onTry: (job: HardwareAction) => void;
  readonly onSeeAll: (group: HardwareActionGroup) => void;
}) {
  const hero = props.featured[0];
  return (
    <div className="flex flex-col gap-6">
      {hero === undefined ? null : (
        <section
          aria-label="Featured"
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <JobPicture job={hero.job} environmentId={props.environmentId} className="w-full" />
          <div className="flex flex-col gap-2 p-4">
            <span className="text-xs font-medium text-muted-foreground">
              {hero.reason === null ? "Featured" : "For your drawing"}
            </span>
            <h3 className="text-base leading-tight font-semibold text-foreground">
              {hero.job.label}
            </h3>
            <p className="text-sm text-muted-foreground">{hero.reason ?? jobLine(hero.job)}</p>
            <div className="pt-1">
              <Button
                size="sm-pill"
                disabled={props.disabled}
                aria-label={`Try ${hero.job.label}`}
                onClick={() => props.onTry(hero.job)}
              >
                Try
              </Button>
            </div>
          </div>
        </section>
      )}
      {props.rows.map((row) => (
        <section key={row.title} aria-label={row.title} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="text-sm font-semibold text-foreground">{row.title}</h3>
            {row.group === null ? null : (
              <Button
                variant="ghost-muted"
                size="xs"
                onClick={() => row.group !== null && props.onSeeAll(row.group)}
              >
                See all
                <ChevronRightIcon />
              </Button>
            )}
          </div>
          <ul className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2">
            {row.jobs.map(({ job, subtitle }) => (
              <li key={job.id} className="flex w-32 shrink-0 snap-start flex-col gap-2">
                <Tooltip>
                  <TooltipTrigger
                    delay={RICH_TOOLTIP_DELAY}
                    render={<span className="flex flex-col gap-2" />}
                  >
                    <JobPicture
                      job={job}
                      environmentId={props.environmentId}
                      className="w-full rounded-xl border border-border"
                    />
                    <span className="flex flex-col gap-0.5 px-0.5">
                      <span className="text-xs leading-snug font-medium text-foreground">
                        {job.label}
                      </span>
                      {subtitle === "" ? null : (
                        <span className="text-xs leading-snug text-muted-foreground">
                          {subtitle}
                        </span>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipPopup side="bottom">
                    <TooltipRich title={job.label} description={jobLine(job)} />
                  </TooltipPopup>
                </Tooltip>
                <div className="mt-auto px-0.5">
                  <Button
                    size="sm-pill"
                    variant="secondary"
                    disabled={props.disabled}
                    aria-label={`Try ${job.label}`}
                    onClick={() => props.onTry(job)}
                  >
                    Try
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
