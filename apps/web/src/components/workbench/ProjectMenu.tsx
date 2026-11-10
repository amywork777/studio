import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { EMPTY_STUDIO_BRIEF } from "@t3tools/shared/studioProjects";
import { type ReactNode, useState } from "react";

import { readLocalApi } from "~/localApi";
import { serverEnvironment } from "~/state/server";
import { shellEnvironment } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { BackupDialog } from "./BackupDialog";
import { folderLabel } from "./folderLabel";
import type { ListedProject } from "./projectList";
import { useStarredStore } from "./starredProjects";
import { useTrash } from "./trash/useTrash";
import { useLastBackup } from "./useBackup";
import { useDuplicateProject } from "./useDuplicateProject";
import { useSaveStudioProject } from "./useStudioProjects";

/** Rename, as Google Drive asks it: the name in a box, Enter or Rename to keep it. */
function RenameDialog(props: {
  readonly card: ListedProject | null;
  readonly onClose: () => void;
  readonly onRename: (card: ListedProject, name: string) => void;
}) {
  const { card } = props;
  const keep = (form: HTMLFormElement) => {
    const typed = new FormData(form).get("name");
    if (card !== null && typeof typed === "string") props.onRename(card, typed);
  };
  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogPopup className="max-w-sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            keep(event.currentTarget);
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <Input
              name="name"
              aria-label="Project name"
              defaultValue={card?.project.name ?? ""}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
            />
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit">Rename</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** Back up for a project picked from its tile, with where it last went. */
function BackupFor(props: {
  readonly environmentId: EnvironmentId;
  readonly card: ListedProject;
  readonly onClose: () => void;
}) {
  const backup = useLastBackup(props.card.id);
  return (
    <BackupDialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      environmentId={props.environmentId}
      project={{
        name: props.card.project.name,
        folders: props.card.project.folders,
        brief: props.card.project.brief,
      }}
      last={backup.last}
      onBackedUp={backup.remember}
    />
  );
}

type Choice = "open" | "rename" | "duplicate" | "backup" | "folder" | "star" | "trash";

/**
 * A project's menu where it shows as a tile (Home), as Google Drive's is on a file: a right-click,
 * or the "…" on its hover. The same actions in the same words as the project switcher's own menu
 * (`ProjectSwitcher`): Open, Rename…, Duplicate, Back up…, Show in Finder, Star (not where the
 * project's own star shows, `ownStar`), and Move to Trash, which says so with Undo (`useTrash`).
 * `dialogs` goes once beside the tiles.
 */
export function useProjectMenu(props: {
  readonly environmentId: EnvironmentId;
  readonly cards: ReadonlyArray<ListedProject>;
  readonly onOpen: (card: ListedProject) => void;
  /** The project shows its star itself, as a tile does, so the menu does not say it again. */
  readonly ownStar?: boolean;
}): {
  readonly show: (card: ListedProject, position: { x: number; y: number }) => void;
  /** The menu of a folder that holds chats but is in no project: what still applies to one. */
  readonly showFolder: (
    folder: { readonly name: string; readonly root: string },
    position: { x: number; y: number },
  ) => void;
  readonly dialogs: ReactNode;
} {
  const { environmentId, cards, onOpen } = props;
  const save = useSaveStudioProject(environmentId);
  const { trashProject } = useTrash(environmentId);
  const duplicate = useDuplicateProject(environmentId);
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: true });
  const starred = useStarredStore((store) => store.starred);
  const toggleStar = useStarredStore((store) => store.toggle);
  const [renaming, setRenaming] = useState<ListedProject | null>(null);
  const [backingUp, setBackingUp] = useState<ListedProject | null>(null);
  const canShowFolder = serverConfig?.availableEditors.includes("file-manager") === true;

  const show = (card: ListedProject, position: { x: number; y: number }) => {
    const api = readLocalApi();
    if (!api) return;
    const folder = card.project.folders[0];
    void api.contextMenu
      .show<Choice>(
        [
          { id: "open", label: "Open" },
          { id: "rename", label: "Rename…", separatorBefore: true },
          ...(duplicate === null ? [] : [{ id: "duplicate" as const, label: "Duplicate" }]),
          { id: "backup", label: "Back up…" },
          ...(canShowFolder && folder !== undefined
            ? [{ id: "folder" as const, label: folderLabel(serverConfig?.environment.platform.os) }]
            : []),
          ...(props.ownStar === true
            ? []
            : [
                {
                  id: "star" as const,
                  label: starred.includes(card.id) ? "Unstar" : "Star",
                },
              ]),
          { id: "trash", label: "Move to Trash", separatorBefore: true },
        ],
        position,
      )
      .then((choice) => {
        if (choice === "open") onOpen(card);
        else if (choice === "rename") setRenaming(card);
        else if (choice === "duplicate" && duplicate !== null) {
          void duplicate(
            card.project,
            cards.map((each) => each.project.name),
          );
        } else if (choice === "backup") setBackingUp(card);
        else if (choice === "folder" && folder !== undefined) {
          void openInEditor({ environmentId, input: { cwd: folder, editor: "file-manager" } });
        } else if (choice === "star") toggleStar(card.id);
        else if (choice === "trash") void trashProject(card.id, card.project.name);
      });
  };

  const showFolder = (
    { name, root }: { readonly name: string; readonly root: string },
    position: { x: number; y: number },
  ) => {
    const api = readLocalApi();
    if (!api) return;
    void api.contextMenu
      .show<"folder" | "trash">(
        [
          ...(canShowFolder
            ? [{ id: "folder" as const, label: folderLabel(serverConfig?.environment.platform.os) }]
            : []),
          { id: "trash" as const, label: "Move to Trash", separatorBefore: canShowFolder },
        ],
        position,
      )
      .then(async (choice) => {
        if (choice === "folder") {
          void openInEditor({ environmentId, input: { cwd: root, editor: "file-manager" } });
        } else if (choice === "trash") {
          // Trash holds projects: the folder becomes one on its way there, so Undo and Delete
          // forever work on it as on any other.
          const id = await save(null, {
            name,
            template: null,
            brief: EMPTY_STUDIO_BRIEF,
            folders: [root],
            createdAt: new Date().toISOString(),
          });
          if (id !== null) void trashProject(id, name);
        }
      });
  };

  const rename = (card: ListedProject, typed: string) => {
    setRenaming(null);
    const name = typed.trim();
    if (name !== "" && name !== card.project.name) void save(card.id, { ...card.project, name });
  };

  const dialogs = (
    <>
      <RenameDialog card={renaming} onClose={() => setRenaming(null)} onRename={rename} />
      {backingUp === null ? null : (
        <BackupFor
          environmentId={environmentId}
          card={backingUp}
          onClose={() => setBackingUp(null)}
        />
      )}
    </>
  );
  return { show, showFolder, dialogs };
}
