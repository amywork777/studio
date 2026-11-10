import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  type EnvironmentId,
  STUDIO_BACKUP_BRIEF_FILE,
  type StudioProjectBrief,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { GithubIcon, HardDriveUploadIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { projectEnvironment } from "~/state/projects";
import { serverEnvironment } from "~/state/server";
import { shellEnvironment } from "~/state/shell";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { studioProjectsEnvironment } from "~/state/studioProjects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useEnvironmentQuery } from "~/state/query";
import { vcsEnvironment } from "~/state/vcs";
import { GitHubSignIn } from "../settings/GitHubSignIn";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { toastManager } from "../ui/toast";
import { folderLabel } from "./folderLabel";
import { readStudioImport } from "./studioImportBridge";
import {
  backupFolder,
  type BackupPlace,
  backupPlaceLabel,
  githubChoice,
  githubDescription,
  githubRepository,
  type LastBackup,
} from "./useBackup";

/** An error from the desktop app or the server, in its own words. */
export const plainError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']*': (?:Error: )?/,
    "",
  );

/** One place a backup can be, Back up and Restore a backup alike. */
export function Choice(props: {
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
  readonly icon: typeof GithubIcon;
  readonly title: string;
  readonly description: string;
  readonly note: string | null;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      disabled={props.disabled}
      onClick={props.onSelect}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60",
        props.selected ? "border-primary bg-primary/5" : "border-border hover:border-foreground/25",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{props.title}</span>
        <span className="text-xs leading-snug text-muted-foreground">{props.description}</span>
        {props.note === null ? null : (
          <span className="text-xs leading-snug text-warning-foreground">{props.note}</span>
        )}
      </span>
    </button>
  );
}

/**
 * Back up, from the project's menu (`ProjectSwitcher`). A project is already a folder on this Mac
 * with its versions in it; a backup puts a copy somewhere else: GitHub (a private repository the
 * server's `StudioSync` makes for it, then each backup sent with every version, as the account the
 * source control settings are signed in as), or a folder that syncs (a Google Drive, Dropbox or
 * iCloud folder, or a drive; the desktop app copies only what changed, `backUp`).
 */
export function BackupDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly project: {
    readonly name: string;
    readonly folders: ReadonlyArray<string>;
    readonly brief: StudioProjectBrief;
  };
  readonly last: LastBackup | null;
  readonly onBackedUp: (place: BackupPlace) => void;
}) {
  const { environmentId, project, last } = props;
  const folder = project.folders.length === 1 ? project.folders[0]! : null;
  const discoveryQuery = useEnvironmentQuery(
    sourceControlEnvironment.discovery({ environmentId, input: {} }),
  );
  const discovery = discoveryQuery.data;
  const status =
    useEnvironmentQuery(
      folder === null ? null : vcsEnvironment.status({ environmentId, input: { cwd: folder } }),
    ).data ?? null;
  const syncState =
    useEnvironmentQuery(
      folder === null
        ? null
        : studioProjectsEnvironment.syncStatus({ environmentId, input: { cwd: folder } }),
    ).data ?? null;
  const send = useAtomCommand(studioProjectsEnvironment.syncSend, { reportFailure: false });
  const writeFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const canSend = useAtomValue(studioProjectsEnvironment.syncSend.permissionAtom(environmentId));
  const bridge = readStudioImport();
  const pickFolder = bridge?.pickFolder;
  const backUpInto = bridge?.backUp;

  const github = discovery?.sourceControlProviders.find((provider) => provider.kind === "github");
  const account = github === undefined ? null : Option.getOrNull(github.auth.account);
  // The folder's own record outlives this computer's memory of the last backup, and covers a
  // first send that stopped partway.
  const backedUpTo =
    last?.place.kind === "github" ? last.place.repository : (syncState?.repository ?? null);
  const toGitHub = githubChoice({
    signedIn: github?.status === "available" && github.auth.status !== "unauthenticated",
    account,
    folders: project.folders.length,
    folder: status === null ? null : { isRepo: status.isRepo, hasRemote: status.hasPrimaryRemote },
    backedUpTo,
  });
  const toFolder = pickFolder !== undefined && backUpInto !== undefined;
  const [chosen, setChosen] = useState<"github" | "folder" | null>(null);
  const choice =
    chosen ?? (last?.place.kind === "folder" ? "folder" : toGitHub.available ? "github" : "folder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: true });
  const canReveal = serverConfig?.availableEditors.includes("file-manager") === true;
  // The toast shows where the backup went: the repository on GitHub, or the folder on disk.
  const see = (place: BackupPlace) =>
    place.kind === "github"
      ? {
          children: "Open on GitHub",
          onClick: () =>
            void readLocalApi()
              ?.shell.openExternal(`https://github.com/${place.repository}`)
              .catch(() =>
                toastManager.add({ type: "error", title: "GitHub could not be opened" }),
              ),
        }
      : canReveal
        ? {
            children: folderLabel(serverConfig?.environment.platform.os),
            onClick: () =>
              void openInEditor({
                environmentId,
                input: { cwd: place.folder, editor: "file-manager" },
              }),
          }
        : undefined;
  const finish = (place: BackupPlace, description: string) => {
    props.onBackedUp(place);
    props.onOpenChange(false);
    const action = see(place);
    toastManager.add({
      type: "success",
      title: `Backed up ${project.name}`,
      description,
      ...(action === undefined ? {} : { actionProps: action }),
    });
  };

  /** Puts the brief in the work folder, which is all a backup carries. */
  const keepBrief = async () => {
    const contents = `${JSON.stringify(project.brief, null, 2)}\n`;
    for (const cwd of project.folders) {
      const written = await writeFile({
        environmentId,
        input: { cwd, relativePath: STUDIO_BACKUP_BRIEF_FILE, contents },
      });
      if (written._tag === "Failure") throw squashAtomCommandFailure(written);
    }
  };

  const backUpToGitHub = async () => {
    if (account === null || folder === null) return;
    const repository = backedUpTo ?? githubRepository(account, project.name);
    await keepBrief();
    const result = await send({ environmentId, input: { cwd: folder, repository } });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    finish(
      { kind: "github", repository },
      result.value.sent
        ? `Saved as a version in ${repository}, private.`
        : "Nothing changed since the last backup.",
    );
  };

  const backUpToFolder = async (another: boolean) => {
    if (pickFolder === undefined || backUpInto === undefined) return;
    const remembered = last?.place.kind === "folder" && !another ? last.place.folder : null;
    let target = remembered;
    if (target === null) {
      const picked = await pickFolder(`Back up ${project.name}`, "Back up here");
      if (picked === null) return;
      target = backupFolder(picked, project.name);
    }
    await keepBrief();
    const result = await backUpInto(project.folders, target);
    const place = { kind: "folder", folder: result.folder } as const;
    finish(
      place,
      result.copied === 0
        ? `Nothing changed since the last backup, in ${backupPlaceLabel(place)}.`
        : `${result.copied} ${result.copied === 1 ? "file" : "files"} copied to ${backupPlaceLabel(place)}.`,
    );
  };

  const run = (another = false) => {
    setBusy(true);
    setError(null);
    void (choice === "github" ? backUpToGitHub() : backUpToFolder(another))
      .catch((cause: unknown) => setError(plainError(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Back up {project.name}</DialogTitle>
          <DialogDescription>
            {project.name} is a folder on this computer, and its versions are kept in it. A backup
            puts a copy somewhere else, so the project is safe if this computer is not.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div role="radiogroup" aria-label="Where to back up" className="flex flex-col gap-2">
            <Choice
              selected={choice === "github"}
              disabled={!toGitHub.available || !canSend}
              onSelect={() => setChosen("github")}
              icon={GithubIcon}
              title="GitHub"
              description={githubDescription({
                repository: backedUpTo,
                account,
                synced: syncState?.synced ?? null,
              })}
              note={toGitHub.note}
            />
            <Choice
              selected={choice === "folder"}
              disabled={!toFolder}
              onSelect={() => setChosen("folder")}
              icon={HardDriveUploadIcon}
              title="A folder that syncs"
              description={
                last?.place.kind === "folder"
                  ? `Into ${backupPlaceLabel(last.place)}. Only what changed is copied.`
                  : "Your Google Drive, Dropbox or iCloud Drive folder, which uploads what is put in it, or a drive. Only what changed is copied each time."
              }
              note={toFolder ? null : "Needs Studio's desktop app."}
            />
          </div>
          {toGitHub.signIn ? (
            <div className="pt-3">
              <GitHubSignIn environmentId={environmentId} onSignedIn={discoveryQuery.refresh} />
            </div>
          ) : null}
          {error === null ? null : <p className="pt-3 text-xs text-destructive">{error}</p>}
        </DialogPanel>
        <DialogFooter>
          {choice === "folder" && last?.place.kind === "folder" ? (
            <Button variant="ghost" disabled={busy} onClick={() => run(true)}>
              Another folder
            </Button>
          ) : null}
          <Button
            disabled={busy || (choice === "github" ? !toGitHub.available || !canSend : !toFolder)}
            onClick={() => run()}
          >
            {busy ? "Backing up" : "Back up"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
