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
import { openComments, type ReviewComment } from "./reviewPrompt";
import { TeamAvatar } from "./TeamAvatar";
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

type Comment = ReviewComment;

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
  /** The review before this Version's, whose comments this Version may have answered. */
  readonly previous: StudioTeamReview | null;
  readonly account: string | null;
  /** Hands the open comments to the project's chat; null where no chat or no right to change it. */
  readonly onAskAgent: (() => void) | null;
}) {
  const { environmentId, folder, shared, review, previous, account } = props;
  const comment = useAtomCommand(studioTeamsEnvironment.reviewComment, { reportFailure: false });
  const decide = useAtomCommand(studioTeamsEnvironment.reviewDecide, { reportFailure: false });
  const releaseVersion = useAtomCommand(studioTeamsEnvironment.releaseVersion, {
    reportFailure: false,
  });
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const action = useTeamAction();
  const mine = review.people.find((person) => person.email === account) ?? null;
  const released = review.status === "released";

  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (text === "") return;
    action.run(async () => {
      const result = await comment({
        environmentId,
        input: { cwd: folder, body: text, ...(replyTo === null ? {} : { replyTo: replyTo.id }) },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      setBody("");
      setReplyTo(null);
    });
  };
  const choose = (decision: StudioTeamReviewDecision) =>
    action.run(async () => {
      const result = await decide({ environmentId, input: { cwd: folder, decision } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    });
  const copyLink = (link: string) => {
    void navigator.clipboard.writeText(link).then(
      () =>
        toastManager.add({
          type: "success",
          title: "Review link copied",
          description: "Reviewers open it in a browser and sign in with the email you invited.",
        }),
      () => toastManager.add({ type: "info", title: "Review link", description: link }),
    );
  };
  const open = openComments(review);
  const answeredHere =
    previous === null
      ? []
      : previous.comments.filter(
          (each) => each.replyTo === null && each.resolvedIn === review.version,
        );
  const repliesTo = (all: StudioTeamReview, id: string) =>
    all.comments.filter((each) => each.replyTo === id);
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
      {answeredHere.length === 0 || previous === null ? null : (
        <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 px-2.5 py-2">
          <span className="text-xs font-medium text-foreground">
            Answered in this Version, from the review of Version {previous.version}
          </span>
          <ol className="flex flex-col gap-2">
            {answeredHere.map((each) => (
              <CommentItem key={each.id} comment={each} replies={repliesTo(previous, each.id)} />
            ))}
          </ol>
        </div>
      )}
      {review.comments.some((each) => each.replyTo === null) ? (
        <ol className="flex flex-col gap-2.5">
          {review.comments
            .filter((each) => each.replyTo === null)
            .map((each) => (
              <CommentItem
                key={each.id}
                comment={each}
                replies={repliesTo(review, each.id)}
                onReply={released ? null : () => setReplyTo(each)}
              />
            ))}
        </ol>
      ) : null}
      {released ? null : (
        <form className="flex min-w-0 flex-wrap items-center gap-2" onSubmit={send}>
          <div className="min-w-48 flex-1">
            <Input
              size="sm"
              aria-label={replyTo === null ? "Comment on this Version" : `Reply to ${replyTo.by}`}
              placeholder={
                replyTo === null
                  ? "Comment on this Version, for example: holes need more clearance"
                  : `Reply to ${replyTo.by}`
              }
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
            {replyTo === null ? "Comment" : "Reply"}
          </Button>
          {replyTo === null ? null : (
            <Button type="button" size="sm" variant="ghost-muted" onClick={() => setReplyTo(null)}>
              Cancel reply
            </Button>
          )}
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
          {review.status === "changes" && open.length > 0 && props.onAskAgent !== null ? (
            <Button type="button" size="sm" disabled={action.busy} onClick={props.onAskAgent}>
              Ask the agent to address{" "}
              {open.length === 1 ? "the comment" : `${open.length} comments`}
            </Button>
          ) : null}
          {review.link === null ? null : (
            <Button
              type="button"
              size="sm"
              variant="ghost-muted"
              onClick={() => copyLink(review.link!)}
            >
              Copy review link
            </Button>
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

/** One comment: who and when, what it points at, whether a later Version resolved it, its replies. */
function CommentItem(props: {
  readonly comment: Comment;
  readonly replies: ReadonlyArray<Comment>;
  readonly onReply?: (() => void) | null;
}) {
  const { comment, replies } = props;
  return (
    <li className="flex min-w-0 gap-2">
      <TeamAvatar email={comment.by} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{comment.by}</span>
          {formatRelativeTimeLabel(comment.at)}
          {comment.pin === null ? null : <span>on {comment.pin.file}</span>}
          {comment.resolvedIn === null ? null : (
            <Badge variant="success">Resolved in Version {comment.resolvedIn}</Badge>
          )}
          {props.onReply ? (
            <Button type="button" size="xs" variant="ghost-muted" onClick={props.onReply}>
              Reply
            </Button>
          ) : null}
        </span>
        <span className="text-sm whitespace-pre-wrap text-foreground">{comment.body}</span>
        {replies.map((reply) => (
          <div key={reply.id} className="flex min-w-0 gap-2 border-s-2 border-border ps-2.5">
            <TeamAvatar email={reply.by} />
            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{reply.by}</span>{" "}
                {formatRelativeTimeLabel(reply.at)}
              </span>
              <span className="text-sm whitespace-pre-wrap text-foreground">{reply.body}</span>
            </div>
          </div>
        ))}
      </div>
    </li>
  );
}
