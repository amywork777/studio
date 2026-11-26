import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  type EnvironmentId,
  STUDIO_BACKUP_BRIEF_FILE,
  type StudioProjectBrief,
} from "@t3tools/contracts";
import { UsersIcon } from "lucide-react";
import { useState } from "react";

import { useEnvironmentQuery } from "~/state/query";
import { projectEnvironment } from "~/state/projects";
import { studioTeamsEnvironment } from "~/state/studioTeams";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../../ui/button";
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
import { toastManager } from "../../ui/toast";
import { Choice } from "../BackupDialog";
import { ROLE_LABEL, useTeamAction } from "./teamWords";

/**
 * Share with team: the project goes to the team hub as Version 1, with its brief, and from then on
 * one person at a time checks it out. Teams where the person is a Viewer cannot take it.
 */
export function ShareDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly project: {
    readonly name: string;
    readonly folders: ReadonlyArray<string>;
    readonly brief: StudioProjectBrief;
  };
}) {
  const { environmentId, project } = props;
  const folder = project.folders.length === 1 ? project.folders[0]! : null;
  const status =
    useEnvironmentQuery(
      props.open ? studioTeamsEnvironment.status({ environmentId, input: {} }) : null,
    ).data ?? null;
  const already =
    useEnvironmentQuery(
      props.open && folder !== null
        ? studioTeamsEnvironment.folderStatus({ environmentId, input: { cwd: folder } })
        : null,
    ).data ?? null;
  const share = useAtomCommand(studioTeamsEnvironment.share, { reportFailure: false });
  const writeFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const allowed = useAtomValue(studioTeamsEnvironment.share.permissionAtom(environmentId));
  const [chosen, setChosen] = useState<string | null>(null);
  const action = useTeamAction();

  const teams = status?.teams ?? [];
  const editable = teams.filter((team) => team.role !== "viewer");
  const teamId = chosen ?? editable[0]?.id ?? null;
  const reason =
    status === null
      ? null
      : !status.available
        ? "This Studio has no team hub."
        : status.account === null
          ? "Sign in to your team first, in the Team section of Projects."
          : teams.length === 0
            ? "You are on no team yet. Make one in the Team section of Projects."
            : folder === null
              ? "Only a project in one folder can be shared."
              : already !== null
                ? `Already shared with ${already.project.teamName}.`
                : null;

  const run = () =>
    action.run(async () => {
      if (folder === null || teamId === null) return;
      // The brief travels in the project, as a backup's does, so a teammate's copy has it.
      const written = await writeFile({
        environmentId,
        input: {
          cwd: folder,
          relativePath: STUDIO_BACKUP_BRIEF_FILE,
          contents: `${JSON.stringify(project.brief, null, 2)}\n`,
        },
      });
      if (written._tag === "Failure") throw squashAtomCommandFailure(written);
      const result = await share({
        environmentId,
        input: { cwd: folder, teamId, name: project.name },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      props.onOpenChange(false);
      toastManager.add({
        type: "success",
        title: `Shared ${project.name}`,
        description: `Version 1 is on ${result.value?.project.teamName ?? "the team"}. Check it out to change it.`,
      });
    });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {project.name} with your team</DialogTitle>
          <DialogDescription>
            The project and every Version go to the team as Version 1. After that, one person at a
            time checks it out to change it, then checks it in for everyone.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {reason !== null ? (
            <p className="text-sm text-muted-foreground">{reason}</p>
          ) : (
            <div role="radiogroup" aria-label="Which team" className="flex flex-col gap-2">
              {teams.map((team) => (
                <Choice
                  key={team.id}
                  selected={team.id === teamId}
                  disabled={team.role === "viewer"}
                  onSelect={() => setChosen(team.id)}
                  icon={UsersIcon}
                  title={team.name}
                  description={`${team.members.length} ${team.members.length === 1 ? "person" : "people"}. You are ${ROLE_LABEL[team.role]}.`}
                  note={team.role === "viewer" ? "Viewers cannot share projects." : null}
                />
              ))}
            </div>
          )}
          {action.error === null ? null : (
            <p className="pt-3 text-xs text-destructive">{action.error}</p>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button
            disabled={action.busy || reason !== null || teamId === null || !allowed}
            onClick={run}
          >
            {action.busy ? "Sharing" : "Share"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
