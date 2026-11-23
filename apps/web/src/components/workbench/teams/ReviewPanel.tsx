import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  StudioTeamReview,
  StudioTeamReviewDecision,
  StudioTeamsFolderStatusResult,
} from "@t3tools/contracts";
import { type FormEvent, useState } from "react";

import { formatRelativeTimeLabel } from "~/timestampFormat";
import { studioTeamsEnvironment } from "~/state/studioTeams";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { toastManager } from "../../ui/toast";
import { useTeamAction } from "./teamWords";

type Shared = NonNullable<StudioTeamsFolderStatusResult>;

/** A review's state in a word, coloured by what it means: amber waits on changes, green passed. */
export function ReviewBadge(props: { readonly review: StudioTeamReview }) {
  const { review } = props;
  switch (review.status) {
    case "review":
      return <Badge variant="info">In review</Badge>;
    case "changes":
      return <Badge variant="warning">Changes requested</Badge>;
    case "approved":
      return <Badge variant="success">Approved</Badge>;
    case "released":
      return <Badge variant="secondary">Rev {review.releasedRev}</Badge>;
  }
}

const DECISION_WORDS: Record<StudioTeamReviewDecision, string> = {
  approved: "Approved",
  changes: "Requested changes",
};

/**
 * The latest Version's review under the check-out strip: who was asked and what each decided,
 * the comments, and what this person can do: comment, approve or request changes when they were
 * asked, and release an approved Version when they are an Admin.
 */
export function ReviewPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly folder: string;
  readonly shared: Shared;
  readonly review: StudioTeamReview;
  readonly account: string | null;
}) {
  const { environmentId, folder, shared, review, account } = props;
  const comment = useAtomCommand(studioTeamsEnvironment.reviewComment, { reportFailure: false });
  const decide = useAtomCommand(studioTeamsEnvironment.reviewDecide, { reportFailure: false });
  const releaseVersion = useAtomCommand(studioTeamsEnvironment.releaseVersion, {
    reportFailure: false,
  });
  const [body, setBody] = useState("");
  const action = useTeamAction();
  const mine = review.people.find((person) => person.email === account) ?? null;
  const released = review.status === "released";

  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (text === "") return;
    action.run(async () => {
      const result = await comment({ environmentId, input: { cwd: folder, body: text } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      setBody("");
    });
  };
  const choose = (decision: StudioTeamReviewDecision) =>
    action.run(async () => {
      const result = await decide({ environmentId, input: { cwd: folder, decision } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    });
  const release = () =>
    action.run(async () => {
      const result = await releaseVersion({ environmentId, input: { cwd: folder } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      const rev = result.value?.review?.releasedRev ?? "";
      toastManager.add({
        type: "success",
        title: `Released Version ${review.version} as Rev ${rev}`,
        description: `${shared.project.teamName} sees it as released.`,
      });
    });

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-sm font-medium text-foreground">
          Review of Version {review.version}
        </span>
        <ReviewBadge review={review} />
        <span className="text-xs text-muted-foreground">Asked by {review.requestedBy}</span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {review.people.map((person) => (
          <li key={person.email} className="flex items-baseline gap-1.5 text-xs">
            <span className="text-foreground">
              {person.email}
              {person.email === account ? " (you)" : ""}
            </span>
            <span
              className={
                person.decision === "approved"
                  ? "text-success-foreground"
                  : person.decision === "changes"
                    ? "text-warning-foreground"
                    : "text-muted-foreground"
              }
            >
              {person.decision === null ? "Not yet" : DECISION_WORDS[person.decision]}
            </span>
          </li>
        ))}
      </ul>
      {review.comments.length === 0 ? null : (
        <ol className="flex flex-col gap-2">
          {review.comments.map((each) => (
            <li key={each.id} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">
                {each.by}, {formatRelativeTimeLabel(each.at)}
              </span>
              <span className="text-sm whitespace-pre-wrap text-foreground">{each.body}</span>
            </li>
          ))}
        </ol>
      )}
      {released ? null : (
        <form className="flex min-w-0 flex-wrap items-center gap-2" onSubmit={send}>
          <div className="min-w-48 flex-1">
            <Input
              size="sm"
              aria-label="Comment on this Version"
              placeholder="Comment on this Version, for example: holes need more clearance"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={action.busy || body.trim() === ""}
          >
            Comment
          </Button>
          {mine === null ? null : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={action.busy || mine.decision === "changes"}
                onClick={() => choose("changes")}
              >
                Request changes
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={action.busy || mine.decision === "approved"}
                onClick={() => choose("approved")}
              >
                Approve
              </Button>
            </>
          )}
          {shared.role === "admin" && review.status === "approved" ? (
            <Button type="button" size="sm" disabled={action.busy} onClick={release}>
              Release
            </Button>
          ) : null}
        </form>
      )}
      {action.error === null ? null : <p className="text-xs text-destructive">{action.error}</p>}
    </div>
  );
}
