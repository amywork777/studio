import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  type EnvironmentId,
  STUDIO_BACKUP_BRIEF_FILE,
  type StudioProjectBrief,
} from "@t3tools/contracts";
import { LinkIcon } from "lucide-react";
import { useState } from "react";

import { readLocalApi } from "~/localApi";
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
import { Input } from "../../ui/input";
import { toastManager } from "../../ui/toast";
import { SignInForm } from "./SignInForm";
import { useTeamAction } from "./teamWords";

/** Where the dialog's link stands: none made yet, or made at a Version. */
type Made = { readonly url: string; readonly version: number } | null;

/**
 * Share: a link to the project's models and drawings in a browser, with no team to set up.
 * Whoever opens it signs in with their email and may comment; the scripts never go.
 */
export function ShareLinkDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly project: {
    readonly name: string;
    readonly folder: string;
    readonly brief: StudioProjectBrief | null;
  };
}) {
  const { environmentId, project } = props;
  const status =
    useEnvironmentQuery(
      props.open ? studioTeamsEnvironment.status({ environmentId, input: {} }) : null,
    ).data ?? null;
  const shareLink = useAtomCommand(studioTeamsEnvironment.shareLink, { reportFailure: false });
  const writeFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const allowed = useAtomValue(studioTeamsEnvironment.shareLink.permissionAtom(environmentId));
  const [made, setMade] = useState<Made>(null);
  const action = useTeamAction();

  const copy = (url: string) =>
    navigator.clipboard.writeText(url).then(
      () => toastManager.add({ type: "success", title: "Link copied", description: url }),
      () => toastManager.add({ type: "info", title: "Share link", description: url }),
    );

  const make = () =>
    action.run(async () => {
      if (project.brief !== null) {
        // The brief travels in the project, as a backup's does.
        const written = await writeFile({
          environmentId,
          input: {
            cwd: project.folder,
            relativePath: STUDIO_BACKUP_BRIEF_FILE,
            contents: `${JSON.stringify(project.brief, null, 2)}\n`,
          },
        });
        if (written._tag === "Failure") throw squashAtomCommandFailure(written);
      }
      const result = await shareLink({
        environmentId,
        input: { cwd: project.folder, name: project.name },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      setMade(result.value);
      void copy(result.value.url);
    });

  const signedIn = status?.account ?? null;
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) setMade(null);
        props.onOpenChange(open);
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {project.name}</DialogTitle>
          <DialogDescription>
            Anyone with the link signs in with their email, then sees the models and drawings in a
            browser and can comment on them. The scripts stay on this computer.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-3">
            {status === null ? null : !status.available ? (
              <p className="text-sm text-muted-foreground">This Studio has no share page.</p>
            ) : signedIn === null ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Sign in first, so comments on the link come back to you.
                </p>
                <SignInForm environmentId={environmentId} />
              </>
            ) : made === null ? (
              <p className="text-sm text-muted-foreground">
                Signed in as {signedIn}. Make link sends this Version&apos;s models and drawings.
                Sharing again after a change sends the new Version to the same link.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input size="sm" readOnly value={made.url} aria-label="Share link" />
                  <Button size="sm" onClick={() => void copy(made.url)}>
                    Copy link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The link shows Version {made.version}.{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() =>
                      void readLocalApi()
                        ?.shell.openExternal(made.url)
                        .catch(() => void copy(made.url))
                    }
                  >
                    Open in browser
                  </button>
                </p>
              </div>
            )}
            {action.error === null ? null : (
              <p className="text-xs text-destructive">{action.error}</p>
            )}
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            {made === null ? "Cancel" : "Done"}
          </DialogClose>
          {made === null ? (
            <Button
              disabled={action.busy || signedIn === null || !status?.available || !allowed}
              onClick={make}
            >
              <LinkIcon />
              {action.busy ? "Making link" : "Make link"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
