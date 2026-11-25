import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  StudioTeamActivity,
  StudioTeamsFolderStatusResult,
} from "@t3tools/contracts";
import { LockIcon, LockOpenIcon } from "lucide-react";
import { type FormEvent, useState } from "react";

import { formatRelativeTimeLabel } from "~/timestampFormat";
import { useEnvironmentQuery } from "~/state/query";
import { studioTeamsEnvironment } from "~/state/studioTeams";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../ui/dialog";
import { Textarea } from "../../ui/textarea";
import { toastManager } from "../../ui/toast";
import type { ComposerHandleRef } from "~/composerHandleContext";
import { handToChat } from "../handToChat";
import { AddressCommentsDialog } from "./AddressCommentsDialog";
import { ReviewBadge, ReviewPanel } from "./ReviewPanel";
import { type ReviewComment, reviewPrompt } from "./reviewPrompt";
import { TeamAvatar, TeamAvatarStack } from "./TeamAvatar";
import { ROLE_LABEL, useTeamAction } from "./teamWords";

type Shared = NonNullable<StudioTeamsFolderStatusResult>;

/** Check in: what changed, in the engineer's words, and whether to keep working on it. */
function CheckInDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly folder: string;
  readonly shared: Shared;
  /** Everyone else on the team, who may be asked to review the new Version. */
  readonly teammates: ReadonlyArray<string>;
}) {
  const checkIn = useAtomCommand(studioTeamsEnvironment.checkIn, { reportFailure: false });
  const [note, setNote] = useState("");
  const [keep, setKeep] = useState(false);
  const [askReview, setAskReview] = useState(false);
  const [reviewers, setReviewers] = useState<ReadonlyArray<string> | null>(null);
  const chosen = reviewers ?? props.teammates;
  const action = useTeamAction();
  const next = props.shared.project.version + 1;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    action.run(async () => {
      const result = await checkIn({
        environmentId: props.environmentId,
        input: {
          cwd: props.folder,
          note: note.trim(),
          keep,
          reviewers: askReview ? [...chosen] : [],
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      props.onOpenChange(false);
      setNote("");
      toastManager.add({
        type: "success",
        title: `Checked in Version ${next}`,
        description:
          askReview && chosen.length > 0
            ? `Asked ${chosen.join(", ")} to review it.`
            : `${props.shared.project.teamName} can get it now.`,
      });
    });
  };
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-md">
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Check in Version {next}</DialogTitle>
            <DialogDescription>
              Everything in {props.shared.project.name} now becomes Version {next} for{" "}
              {props.shared.project.teamName}.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-3">
              <Textarea
                aria-label="What changed"
                placeholder="What changed, for example: thicker wall at the boss, M5 holes"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={keep} onCheckedChange={(checked) => setKeep(checked === true)} />
                Keep it checked out to me
              </label>
              {props.teammates.length === 0 ? null : (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={askReview}
                    onCheckedChange={(checked) => setAskReview(checked === true)}
                  />
                  Ask for review
                </label>
              )}
              {askReview ? (
                <ul className="flex flex-col gap-1.5 ps-6" aria-label="Reviewers">
                  {props.teammates.map((email) => (
                    <li key={email}>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <Checkbox
                          checked={chosen.includes(email)}
                          onCheckedChange={(checked) =>
                            setReviewers(
                              checked === true
                                ? [...chosen, email]
                                : chosen.filter((each) => each !== email),
                            )
                          }
                        />
                        {email}
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
              {action.error === null ? null : (
                <p className="text-xs text-destructive">{action.error}</p>
              )}
            </div>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={action.busy || (askReview && chosen.length === 0)}>
              {action.busy ? "Checking in" : "Check in"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** Who has it and what this copy can do: Check out, Check in, Get latest, Undo check out. */
function stateLine(shared: Shared): string {
  const { project } = shared;
  const behind = project.version > shared.localVersion;
  if (shared.mine) return "Checked out to you. Check it in when it is ready for the team.";
  if (project.checkedOutBy !== null) {
    return `${project.checkedOutBy} has it checked out${behind ? `. Version ${project.version} is newer than yours` : ""}.`;
  }
  if (behind)
    return `Version ${project.version} is newer than this copy (Version ${shared.localVersion}).`;
  if (shared.review?.status === "changes") {
    return "Changes were requested. Check it out to make them.";
  }
  if (shared.review?.status === "review") return "Out for review. It can still be checked out.";
  if (shared.review?.status === "approved") return "Approved. An Admin can release it.";
  return shared.changesHere
    ? "This copy has changes that are not checked in. Check it out to keep them."
    : "Up to date. Check it out to change it.";
}

function activityWords(event: StudioTeamActivity): string {
  switch (event.kind) {
    case "check-in":
      return `checked in Version ${event.version}`;
    case "review-asked":
      return `asked ${event.text ?? "teammates"} to review Version ${event.version}`;
    case "approved":
      return `approved Version ${event.version}`;
    case "changes":
      return `requested changes on Version ${event.version}`;
    case "comment":
      return `commented on Version ${event.version}`;
    case "released":
      return `Version ${event.version} was released as Rev ${event.text ?? ""}`;
  }
}

/** What happened on the project, newest first, as a shared document's activity reads. */
function ActivityList(props: { readonly activity: ReadonlyArray<StudioTeamActivity> }) {
  return (
    <ol className="flex flex-col border-t border-border">
      {props.activity.map((event, index) => (
        <li
          // oxlint-disable-next-line react/no-array-index-key -- Events have no id; the list is rebuilt whole.
          key={`${event.kind}-${event.at}-${index}`}
          className="flex min-w-0 gap-2.5 border-b border-border py-2 last:border-b-0"
        >
          {event.by === "" ? (
            <span className="size-5 shrink-0" aria-hidden="true" />
          ) : (
            <TeamAvatar email={event.by} />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs text-foreground">
              {event.by === "" ? null : <span className="font-medium">{event.by} </span>}
              {activityWords(event)}
              <span className="text-muted-foreground"> · {formatRelativeTimeLabel(event.at)}</span>
            </span>
            {(event.kind === "check-in" || event.kind === "comment") && event.text !== null ? (
              <span className="truncate text-xs text-muted-foreground">{event.text}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * A team project's place on its team, at the top of its Overview: its Version, who has it checked
 * out, and the one or two things this copy can do next. Nothing for a project that is not shared.
 */
export function TeamStrip(props: {
  readonly environmentId: EnvironmentId;
  readonly folder: string;
  /** The project's chat, which "Ask the agent to address comments" hands the review to. */
  readonly composerRef: ComposerHandleRef | null;
}) {
  const { environmentId, folder } = props;
  const query = useEnvironmentQuery(
    studioTeamsEnvironment.folderStatus({ environmentId, input: { cwd: folder } }),
  );
  const statusQuery = useEnvironmentQuery(
    studioTeamsEnvironment.status({ environmentId, input: {} }),
  );
  const checkOut = useAtomCommand(studioTeamsEnvironment.checkOut, { reportFailure: false });
  const getLatest = useAtomCommand(studioTeamsEnvironment.getLatest, { reportFailure: false });
  const release = useAtomCommand(studioTeamsEnvironment.release, { reportFailure: false });
  const allowed = useAtomValue(studioTeamsEnvironment.checkOut.permissionAtom(environmentId));
  const [checkingIn, setCheckingIn] = useState(false);
  const [history, setHistory] = useState(false);
  const [addressing, setAddressing] = useState(false);
  const action = useTeamAction();
  const shared = query.data ?? null;
  if (shared === null) {
    // A shared project whose hub answered no (signed out, offline) says so rather than vanish.
    return query.error === null ? null : (
      <p className="text-xs text-muted-foreground">Team: {query.error}</p>
    );
  }
  const { project } = shared;
  const account = statusQuery.data?.account ?? null;
  const people = statusQuery.data?.teams.find((team) => team.id === project.teamId)?.members ?? [];
  const members = people.map((member) => member.email);
  const roleOf = (email: string) => people.find((member) => member.email === email)?.role;
  const teammates = members.filter((email) => email !== account);
  const review = shared.review;
  const editor = shared.role !== "viewer";
  const behind = project.version > shared.localVersion;
  const call = (run: typeof checkOut, done: string | null) =>
    action.run(async () => {
      const result = await run({ environmentId, input: { cwd: folder } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      if (done !== null) toastManager.add({ type: "success", title: done });
    });
  const composerRef = props.composerRef;
  const askAgent =
    composerRef === null || review === null || !editor ? null : () => setAddressing(true);
  const handComments = (chosen: ReadonlyArray<ReviewComment>) =>
    action.run(async () => {
      if (composerRef === null || review === null) return;
      if (!shared.mine) {
        if (project.checkedOutBy !== null) {
          throw new Error(`${project.checkedOutBy} has it checked out.`);
        }
        const result = await checkOut({ environmentId, input: { cwd: folder } });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      }
      setAddressing(false);
      handToChat(
        composerRef,
        reviewPrompt({ review, teamName: project.teamName, folder, chosen, roleOf }),
      );
    });

  return (
    <section
      aria-label="Team"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border px-3 py-2.5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {project.checkedOutBy !== null ? (
          <TeamAvatar email={project.checkedOutBy} size="md" locked />
        ) : (
          <TeamAvatarStack emails={members.length > 0 ? members : [project.teamName]} max={3} />
        )}
        <span className="flex min-w-48 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">{project.teamName}</span>
            {project.checkedOutBy !== null && members.length > 0 ? (
              <TeamAvatarStack emails={members} max={4} />
            ) : null}
            <span className="text-xs text-muted-foreground tabular-nums">
              Version {shared.localVersion}
              {behind ? ` of ${project.version}` : ""}
            </span>
            {review === null ? null : <ReviewBadge review={review} />}
          </span>
          <span className="text-xs text-muted-foreground">{stateLine(shared)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {behind && !shared.mine ? (
            <Button
              variant="outline"
              size="sm"
              disabled={action.busy || !allowed}
              onClick={() => call(getLatest, `Got Version ${project.version}`)}
            >
              Get latest
            </Button>
          ) : null}
          {editor && project.checkedOutBy === null ? (
            <Button
              size="sm"
              disabled={action.busy || !allowed}
              onClick={() => call(checkOut, "Checked out to you")}
            >
              <LockIcon aria-hidden="true" />
              Check out
            </Button>
          ) : null}
          {shared.mine ? (
            <>
              <Button
                variant="ghost-muted"
                size="sm"
                disabled={action.busy || !allowed}
                onClick={() => call(release, "Check-out undone. Your changes stay in this copy.")}
              >
                <LockOpenIcon aria-hidden="true" />
                Undo check out
              </Button>
              <Button
                size="sm"
                disabled={action.busy || !allowed}
                onClick={() => setCheckingIn(true)}
              >
                Check in…
              </Button>
            </>
          ) : null}
          {!shared.mine && project.checkedOutBy !== null && shared.role === "admin" ? (
            <Button
              variant="ghost-muted"
              size="sm"
              disabled={action.busy || !allowed}
              onClick={() => call(release, `Took it back from ${project.checkedOutBy}`)}
            >
              Take back
            </Button>
          ) : null}
          {shared.activity.length === 0 ? null : (
            <Button variant="ghost-muted" size="sm" onClick={() => setHistory(!history)}>
              {history ? "Hide activity" : "Activity"}
            </Button>
          )}
        </span>
      </div>
      {action.error === null ? null : <p className="text-xs text-destructive">{action.error}</p>}
      {history ? <ActivityList activity={shared.activity} /> : null}
      {review === null ? null : (
        <ReviewPanel
          environmentId={environmentId}
          folder={folder}
          shared={shared}
          review={review}
          previous={shared.previousReview}
          account={account}
          onAskAgent={askAgent}
        />
      )}
      <span className="sr-only">Your role: {ROLE_LABEL[shared.role]}</span>
      {review === null ? null : (
        <AddressCommentsDialog
          open={addressing}
          onOpenChange={setAddressing}
          review={review}
          roleOf={roleOf}
          onHand={handComments}
        />
      )}
      <CheckInDialog
        open={checkingIn}
        onOpenChange={setCheckingIn}
        environmentId={environmentId}
        folder={folder}
        shared={shared}
        teammates={teammates}
      />
    </section>
  );
}
