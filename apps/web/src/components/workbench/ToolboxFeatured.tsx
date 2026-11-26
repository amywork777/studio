import type { EnvironmentId } from "@t3tools/contracts";

import { Button } from "../ui/button";
import { jobLine } from "./hardwareActions";
import { entryOfAction } from "./library/libraryCatalog";
import { LibraryPicture } from "./library/LibraryPicture";
import { GROUP_LABEL } from "./studioLayout";
import type { FeaturedJob } from "./toolbox";

/**
 * The Toolbox home's Featured row (`featuredJobs`): each job a card with its Library cover (drawn
 * from the examples' own files, `libraryPictures.ts`), what it makes in a line, the project's reason
 * where it has one, and Try, which writes the job for the part in front into the chat as a tile does.
 */
export function ToolboxFeatured(props: {
  readonly environmentId: EnvironmentId;
  readonly featured: ReadonlyArray<FeaturedJob>;
  /** The part in front by name, for the row's title. */
  readonly partName: string;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  readonly onTry: (job: FeaturedJob["job"]) => void;
}) {
  if (props.featured.length === 0) return null;
  return (
    <section aria-label="Featured" className="flex flex-col gap-1">
      <h4 className={`${GROUP_LABEL} px-1`}>Featured for {props.partName}</h4>
      <ul className="grid grid-cols-3 gap-2">
        {props.featured.map(({ job, reason }) => {
          const entry = entryOfAction(job.id);
          return (
            <li
              key={job.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
            >
              {entry === null ? null : (
                <LibraryPicture entry={entry} environmentId={props.environmentId} />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1 p-2">
                <span className="text-xs leading-tight font-medium text-foreground">
                  {job.label}
                </span>
                <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {reason ?? jobLine(job)}
                </span>
                <div className="mt-auto pt-1">
                  <Button
                    size="xs"
                    variant={reason === null ? "outline" : "default"}
                    disabled={props.disabled}
                    aria-label={`Try ${job.label}`}
                    onClick={() => props.onTry(job)}
                  >
                    Try
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
