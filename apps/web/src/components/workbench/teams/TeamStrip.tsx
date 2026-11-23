import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, StudioTeamsFolderStatusResult } from "@t3tools/contracts";
import { LockIcon, LockOpenIcon, UsersIcon } from "lucide-react";
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
import { ROLE_LABEL, useTeamAction } from "./teamWords";

type Shared = NonNullable<StudioTeamsFolderStatusResult>;

/** Check in: what changed, in the engineer's words, and whether to keep working on it. */
function CheckInDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly folder: string;
  readonly shared: Shared;
}) {
  const checkIn = useAtomCommand(studioTeamsEnvironment.checkIn, { reportFailure: false });
  const [note, setNote] = useState("");
  const [keep, setKeep] = useState(false);
  const action = useTeamAction();
  const next = props.shared.project.version + 1;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    action.run(async () => {
      const result = await checkIn({
        environmentId: props.environmentId,
        input: { cwd: props.folder, note: note.trim(), keep },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      props.onOpenChange(false);
      setNote("");
      toastManager.add({
        type: "success",
        title: `Checked in Version ${next}`,
        description: `${props.shared.project.teamName} can get it now.`,
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
              {action.error === null ? null : (
                <p className="text-xs text-destructive">{action.error}</p>
              )}
            </div>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={action.busy}>
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
  return shared.changesHere
    ? "This copy has changes that are not checked in. Check it out to keep them."
    : "Up to date. Check it out to change it.";
}

/**
 * A team project's place on its team, at the top of its Overview: its Version, who has it checked
 * out, and the one or two things this copy can do next. Nothing for a project that is not shared.
 */
export function TeamStrip(props: {
  readonly environmentId: EnvironmentId;
  readonly folder: string;
}) {
  const { environmentId, folder } = props;
  const query = useEnvironmentQuery(
    studioTeamsEnvironment.folderStatus({ environmentId, input: { cwd: folder } }),
  );
  const checkOut = useAtomCommand(studioTeamsEnvironment.checkOut, { reportFailure: false });
  const getLatest = useAtomCommand(studioTeamsEnvironment.getLatest, { reportFailure: false });
  const release = useAtomCommand(studioTeamsEnvironment.release, { reportFailure: false });
  const allowed = useAtomValue(studioTeamsEnvironment.checkOut.permissionAtom(environmentId));
  const [checkingIn, setCheckingIn] = useState(false);
  const [history, setHistory] = useState(false);
  const action = useTeamAction();
  const shared = query.data ?? null;
  if (shared === null) {
    // A shared project whose hub answered no (signed out, offline) says so rather than vanish.
    return query.error === null ? null : (
      <p className="text-xs text-muted-foreground">Team: {query.error}</p>
    );
  }
  const { project } = shared;
  const editor = shared.role !== "viewer";
  const behind = project.version > shared.localVersion;
  const call = (run: typeof checkOut, done: string | null) =>
    action.run(async () => {
      const result = await run({ environmentId, input: { cwd: folder } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      if (done !== null) toastManager.add({ type: "success", title: done });
    });

  return (
    <section
      aria-label="Team"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border px-3 py-2.5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {shared.mine ? (
          <LockIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        ) : project.checkedOutBy !== null ? (
          <LockIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <UsersIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="flex min-w-48 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">{project.teamName}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              Version {shared.localVersion}
              {behind ? ` of ${project.version}` : ""}
            </span>
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
          {shared.checkIns.length === 0 ? null : (
            <Button variant="ghost-muted" size="sm" onClick={() => setHistory(!history)}>
              {history ? "Hide check-ins" : "Check-ins"}
            </Button>
          )}
        </span>
      </div>
      {action.error === null ? null : <p className="text-xs text-destructive">{action.error}</p>}
      {history ? (
        <ol className="flex flex-col border-t border-border">
          {shared.checkIns.map((each) => (
            <li
              key={each.version}
              className="flex min-w-0 flex-wrap items-baseline gap-x-3 border-b border-border py-1.5 last:border-b-0"
            >
              <span className="w-20 shrink-0 text-xs font-medium text-foreground tabular-nums">
                Version {each.version}
              </span>
              <span className="min-w-32 flex-1 truncate text-xs text-foreground">
                {each.note ?? "No note"}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {each.by}, {formatRelativeTimeLabel(each.at)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <span className="sr-only">Your role: {ROLE_LABEL[shared.role]}</span>
      <CheckInDialog
        open={checkingIn}
        onOpenChange={setCheckingIn}
        environmentId={environmentId}
        folder={folder}
        shared={shared}
      />
    </section>
  );
}
