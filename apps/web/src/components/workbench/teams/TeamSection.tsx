import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  StudioTeam,
  StudioTeamProject,
  StudioTeamRole,
} from "@t3tools/contracts";
import { UsersIcon } from "lucide-react";
import { type FormEvent, useState } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { waitForProject } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { studioTeamsEnvironment } from "~/state/studioTeams";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../ui/select";
import { toastManager } from "../../ui/toast";
import { copyName } from "../examples/examples";
import { showProject } from "../overviewPanel";
import { MODULE_HEADING, SECTION_STACK } from "../studioLayout";
import { useImportProjects } from "../useImportProjects";
import { useStudioProjects } from "../useStudioProjects";
import { ConfirmDelete } from "./ConfirmDelete";
import { SignInForm } from "./SignInForm";
import { ROLE_LABEL, useTeamAction } from "./teamWords";

/** A size in the largest unit that keeps it at 1 or more, to one decimal under 10. */
const sizeWords = (bytes: number) => {
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
};

const ROLES: ReadonlyArray<StudioTeamRole> = ["editor", "viewer", "admin"];

function TeamSignIn(props: { readonly environmentId: EnvironmentId }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-start gap-3">
        <UsersIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">Work with your team</span>
          <span className="text-xs leading-snug text-muted-foreground">
            Share a project with your team. One person checks it out to change it, then checks it in
            as a new Version everyone can get.
          </span>
        </div>
      </div>
      <SignInForm environmentId={props.environmentId} />
    </div>
  );
}

function MakeTeam(props: { readonly environmentId: EnvironmentId }) {
  const create = useAtomCommand(studioTeamsEnvironment.create, { reportFailure: false });
  const [name, setName] = useState("");
  const action = useTeamAction();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    action.run(async () => {
      const result = await create({
        environmentId: props.environmentId,
        input: { name: name.trim() },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    });
  };
  return (
    <form className="flex flex-col gap-2 rounded-lg border border-border p-4" onSubmit={submit}>
      <span className="text-sm font-medium text-foreground">Make a team</span>
      <span className="text-xs leading-snug text-muted-foreground">
        You are on no team yet. Make one and invite people, or ask a teammate to invite this email.
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          size="sm"
          className="max-w-72"
          placeholder="Team name"
          aria-label="Team name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={action.busy || name.trim() === ""}>
          Make team
        </Button>
      </div>
      {action.error === null ? null : <p className="text-xs text-destructive">{action.error}</p>}
    </form>
  );
}

/** A team's people, with Invite and Remove for an Admin and Leave team for everyone. */
function TeamPeople(props: {
  readonly environmentId: EnvironmentId;
  readonly team: StudioTeam;
  readonly account: string;
}) {
  const { environmentId, team, account } = props;
  const invite = useAtomCommand(studioTeamsEnvironment.invite, { reportFailure: false });
  const remove = useAtomCommand(studioTeamsEnvironment.remove, { reportFailure: false });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StudioTeamRole>("editor");
  const action = useTeamAction();
  const admin = team.role === "admin";
  const paid = [...team.members, ...team.invites].filter((person) => person.role !== "viewer");

  const send = (event: FormEvent) => {
    event.preventDefault();
    const to = email.trim();
    if (to === "") return;
    action.run(async () => {
      const result = await invite({ environmentId, input: { teamId: team.id, email: to, role } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      setEmail("");
      toastManager.add({
        type: "success",
        title: `Invited ${to}`,
        description: "They join when they sign in to Studio with that email.",
      });
    });
  };
  const takeOff = (who: string) =>
    action.run(async () => {
      const result = await remove({ environmentId, input: { teamId: team.id, email: who } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {paid.length} of {team.seats} paid seats used. Viewers are free.
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          Files: {sizeWords(team.storageUsed)} of {sizeWords(team.storageLimit)}
        </span>
      </div>
      <ul className="flex flex-col border-t border-border">
        {[
          ...team.members.map((person) => ({ ...person, invited: false })),
          ...team.invites.map((person) => ({ ...person, invited: true })),
        ].map((person) => (
          <li
            key={person.email}
            className="flex min-w-0 items-center gap-3 border-b border-border py-2 pe-1"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {person.email}
              {person.email === account ? (
                <span className="text-muted-foreground"> (you)</span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {person.invited ? `Invited, ${ROLE_LABEL[person.role]}` : ROLE_LABEL[person.role]}
            </span>
            {admin && person.email !== account ? (
              <Button
                variant="ghost-muted"
                size="sm"
                disabled={action.busy}
                onClick={() => takeOff(person.email)}
              >
                {person.invited ? "Withdraw" : "Remove"}
              </Button>
            ) : person.email === account ? (
              <Button
                variant="ghost-muted"
                size="sm"
                disabled={action.busy}
                onClick={() => takeOff(account)}
              >
                Leave team
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {admin ? (
        <form className="flex flex-wrap items-center gap-2 pt-1" onSubmit={send}>
          <Input
            type="email"
            size="sm"
            className="max-w-64"
            placeholder="teammate@company.com"
            aria-label="Email to invite"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <div className="w-36">
            <Select value={role} onValueChange={(value) => value !== null && setRole(value)}>
              <SelectTrigger size="sm" aria-label="Their role">
                <SelectValue>{ROLE_LABEL[role]}</SelectValue>
              </SelectTrigger>
              <SelectPopup alignItemWithTrigger={false}>
                {ROLES.map((each) => (
                  <SelectItem key={each} value={each}>
                    {ROLE_LABEL[each]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <Button type="submit" size="sm" disabled={action.busy || email.trim() === ""}>
            Invite
          </Button>
        </form>
      ) : null}
      {action.error === null ? null : <p className="text-xs text-destructive">{action.error}</p>}
    </div>
  );
}

/**
 * One team project: who has it, its Version, and Get to bring a copy to this computer. A Viewer
 * gets no copy, only the review page; an Admin may delete it from the team.
 */
function TeamProjectRow(props: {
  readonly project: StudioTeamProject;
  readonly role: StudioTeamRole;
  readonly reviewPage: string | null;
  readonly here: boolean;
  readonly busy: boolean;
  readonly onGet: () => void;
  readonly onDelete: () => void;
}) {
  const { project } = props;
  return (
    <li className="flex min-w-0 items-center gap-3 border-b border-border py-2 pe-1">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {project.name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {project.version === 0 ? "Not checked in yet" : `Version ${project.version}`}
      </span>
      <span className="hidden w-56 shrink-0 truncate text-xs text-muted-foreground @xl:inline">
        {project.checkedOutBy === null
          ? `Checked in ${formatRelativeTimeLabel(project.updatedAt)}`
          : `Checked out by ${project.checkedOutBy}`}
      </span>
      {props.role === "viewer" ? (
        props.reviewPage === null ? null : (
          <Button
            variant="outline"
            size="sm"
            render={<a href={props.reviewPage} target="_blank" rel="noopener noreferrer" />}
          >
            Review in browser
          </Button>
        )
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={props.busy || project.version === 0}
          onClick={props.onGet}
        >
          {props.here ? "Get another copy" : "Get"}
        </Button>
      )}
      {props.role === "admin" ? (
        <Button variant="ghost-muted" size="sm" disabled={props.busy} onClick={props.onDelete}>
          Delete
        </Button>
      ) : null}
    </li>
  );
}

type Deleting =
  | { readonly kind: "project"; readonly project: StudioTeamProject }
  | { readonly kind: "team"; readonly team: StudioTeam }
  | { readonly kind: "account" };

/** What each delete says before it happens. */
function deleteWords(deleting: Deleting) {
  switch (deleting.kind) {
    case "project":
      return {
        title: `Delete ${deleting.project.name} from ${deleting.project.teamName}`,
        description: `Deletes the project, its Versions, reviews and files from the team hub. Copies already on people's computers stay. This can't be undone.`,
        action: "Delete project",
      };
    case "team":
      return {
        title: `Delete ${deleting.team.name}`,
        description: `Deletes the team, everyone's place on it, and its projects and files on the team hub. Copies on people's computers stay. This can't be undone.`,
        action: "Delete team",
      };
    case "account":
      return {
        title: "Delete your team account",
        description:
          "Deletes your sign-in and takes you off every team. Teams only you are on are deleted with their files. Projects on this computer stay. This can't be undone.",
        action: "Delete account",
      };
  }
}

/**
 * The Projects page's Team section: sign in, the team's people, and its shared projects to get onto
 * this computer. Absent from a build that names no team hub.
 */
export function TeamSection(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const statusQuery = useEnvironmentQuery(
    studioTeamsEnvironment.status({ environmentId, input: {} }),
  );
  const status = statusQuery.data ?? null;
  const signedIn = status?.account !== null && status?.account !== undefined;
  const projectsQuery = useEnvironmentQuery(
    signedIn && (status?.teams.length ?? 0) > 0
      ? studioTeamsEnvironment.projects({ environmentId, input: {} })
      : null,
  );
  const signOut = useAtomCommand(studioTeamsEnvironment.signOut, { reportFailure: true });
  const get = useAtomCommand(studioTeamsEnvironment.get, { reportFailure: false });
  const deleteProject = useAtomCommand(studioTeamsEnvironment.deleteProject, {
    reportFailure: false,
  });
  const deleteTeam = useAtomCommand(studioTeamsEnvironment.deleteTeam, { reportFailure: false });
  const deleteAccount = useAtomCommand(studioTeamsEnvironment.deleteAccount, {
    reportFailure: false,
  });
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const canGet = useAtomValue(studioTeamsEnvironment.get.permissionAtom(environmentId));
  const runImport = useImportProjects(environmentId);
  const handleNewThread = useNewThreadHandler();
  const local = useStudioProjects(environmentId);
  const action = useTeamAction();

  if (status === null || !status.available) return null;

  const localNames = Object.values(local).map((project) => project.name);
  const bring = (project: StudioTeamProject) =>
    action.run(async () => {
      const result = await get({ environmentId, input: { projectId: project.id } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      const title = copyName(project.name, localNames);
      const { made, first } = await runImport({
        projects: [
          {
            folder: result.value.folder,
            name: title,
            files: [],
            ...(result.value.brief === null ? {} : { brief: result.value.brief }),
          },
        ],
        placements: [],
        newProjectName: title,
      });
      if (made === 0) throw new Error("The project came, but Studio could not add it.");
      toastManager.add({
        type: "success",
        title: `Got ${title}`,
        description: `Version ${project.version}, with every Version before it.`,
      });
      if (first === null) return;
      const projectRef = scopeProjectRef(environmentId, first);
      const opened = await waitForProject(projectRef).catch(() => null);
      const draft = opened === null ? null : await handleNewThread(projectRef).catch(() => null);
      if (draft !== null) showProject(scopeThreadRef(environmentId, draft.threadId));
    });

  const confirmDelete = (target: Deleting) =>
    action.run(async () => {
      const result =
        target.kind === "project"
          ? await deleteProject({ environmentId, input: { projectId: target.project.id } })
          : target.kind === "team"
            ? await deleteTeam({ environmentId, input: { teamId: target.team.id } })
            : await deleteAccount({ environmentId, input: {} });
      setDeleting(null);
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      toastManager.add({ type: "success", title: deleteDone(target) });
    });

  const projects = projectsQuery.data?.projects ?? [];
  return (
    <section aria-label="Team" className={SECTION_STACK}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={MODULE_HEADING}>Team</h2>
        {signedIn ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            Signed in as {status.account}
            <Button
              variant="ghost-muted"
              size="sm"
              onClick={() => void signOut({ environmentId, input: {} })}
            >
              Sign out
            </Button>
            <Button
              variant="ghost-muted"
              size="sm"
              disabled={action.busy}
              onClick={() => setDeleting({ kind: "account" })}
            >
              Delete account
            </Button>
          </span>
        ) : null}
      </div>
      {!signedIn ? (
        <TeamSignIn environmentId={environmentId} />
      ) : status.teams.length === 0 ? (
        <MakeTeam environmentId={environmentId} />
      ) : (
        status.teams.map((team) => {
          const shared = projects.filter((project) => project.teamId === team.id);
          return (
            <div
              key={team.id}
              className="@container flex flex-col gap-4 rounded-lg border border-border p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{team.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  You are {ROLE_LABEL[team.role]}
                  {team.role === "admin" ? (
                    <Button
                      variant="ghost-muted"
                      size="sm"
                      disabled={action.busy}
                      onClick={() => setDeleting({ kind: "team", team })}
                    >
                      Delete team
                    </Button>
                  ) : null}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">Projects</span>
                {shared.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No shared projects yet. Open a project and choose Share with team in its menu.
                  </p>
                ) : (
                  <ul className="flex flex-col border-t border-border">
                    {shared.map((project) => (
                      <TeamProjectRow
                        key={project.id}
                        project={project}
                        role={team.role}
                        reviewPage={status.reviewPage}
                        here={localNames.includes(project.name)}
                        busy={action.busy || !canGet}
                        onGet={() => bring(project)}
                        onDelete={() => setDeleting({ kind: "project", project })}
                      />
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">People</span>
                <TeamPeople environmentId={environmentId} team={team} account={status.account!} />
              </div>
            </div>
          );
        })
      )}
      {action.error === null ? null : <p className="text-xs text-destructive">{action.error}</p>}
      {deleting === null ? null : (
        <ConfirmDelete
          open
          {...deleteWords(deleting)}
          busy={action.busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => confirmDelete(deleting)}
        />
      )}
    </section>
  );
}

function deleteDone(target: Deleting): string {
  switch (target.kind) {
    case "project":
      return `Deleted ${target.project.name} from ${target.project.teamName}`;
    case "team":
      return `Deleted ${target.team.name}`;
    case "account":
      return "Deleted your team account";
  }
}
