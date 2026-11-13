import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";
import { ChatPage } from "../ChatPages";
import { ProjectThumb } from "../ProjectChoices";
import { useStudioProjectsList } from "../useStudioProjects";
import { inTrashOrder } from "./trash";
import { useTrash } from "./useTrash";

/** Delete forever's question: what goes (the project and its chats) and what stays (its folder). */
function DeleteForeverDialog(props: {
  /** The project being deleted; null while none is. */
  readonly name: string | null;
  readonly onCancel: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <AlertDialog open={props.name !== null} onOpenChange={(open) => !open && props.onCancel()}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {props.name ?? "this project"} forever</AlertDialogTitle>
          <AlertDialogDescription>
            Deletes {props.name ?? "this project"} and its chats from Studio. Its folder stays on
            your disk. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <Button variant="secondary" onClick={props.onDelete}>
            Delete forever
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

function TrashPageFor(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const list = useStudioProjectsList(environmentId).data;
  const trash = useTrash(environmentId);
  const entries = inTrashOrder(list?.trashed ?? {});
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  // One step at a time per project, so a second click never repeats one under way.
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  useNowMinute();

  const run = (id: string, step: (id: string) => Promise<boolean>) => {
    if (busy.has(id)) return;
    setBusy((current) => new Set(current).add(id));
    void step(id).finally(() =>
      setBusy((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      }),
    );
  };
  const deleteForever = () => {
    const target = deleting;
    setDeleting(null);
    if (target !== null) run(target.id, trash.deleteForever);
  };

  return (
    <ChatPage
      title="Trash"
      count={entries.length}
      lede="Projects and their chats stay here until you delete them forever."
    >
      {list === null ? null : entries.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Trash is empty. A project's menu has Move to Trash.
        </p>
      ) : (
        <ul className="flex flex-col border-t border-border">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex min-w-0 items-center gap-3 border-b border-border px-3 py-2"
            >
              <ProjectThumb environmentId={environmentId} project={entry} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {entry.name}
              </span>
              <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">
                {formatRelativeTimeLabel(entry.trashedAt)}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy.has(entry.id)}
                  onClick={() => run(entry.id, trash.restoreProject)}
                >
                  Restore
                </Button>
                <Button
                  variant="ghost-muted"
                  size="sm"
                  disabled={busy.has(entry.id)}
                  onClick={() => setDeleting({ id: entry.id, name: entry.name })}
                >
                  Delete forever
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <DeleteForeverDialog
        name={deleting?.name ?? null}
        onCancel={() => setDeleting(null)}
        onDelete={deleteForever}
      />
    </ChatPage>
  );
}

/**
 * Studio's Trash (`/trash`, at the foot of the rail): the projects moved there from a project's
 * menu, the last first, each with when, Restore (back where it was, its chats with it) and Delete
 * forever, which asks first and deletes it and its chats from Studio, keeping its folder on disk
 * (`useTrash`).
 */
export function TrashPage() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <TrashPageFor environmentId={environmentId} />;
}
