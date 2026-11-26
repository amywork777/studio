import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { type ReactNode, useState } from "react";

import { BackupDialog } from "./BackupDialog";
import { useLastBackup } from "./useBackup";

/** The project Back up sends, as the Overview knows it. */
export interface ProjectBackupTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly project: StudioProject;
}

/**
 * Back up among the Overview's project actions: the one way a project goes to the person's own
 * account (law 9), the same dialog a project tile's menu opens (`ProjectMenu`). `children` gets what
 * opens it, so it can be a menu's item while the dialog outlives the menu.
 */
export function ProjectBackup(props: {
  readonly target: ProjectBackupTarget;
  readonly children: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const backup = useLastBackup(props.target.projectId);
  const { project } = props.target;
  return (
    <>
      {props.children(() => setOpen(true))}
      {open ? (
        <BackupDialog
          open
          onOpenChange={setOpen}
          environmentId={props.target.environmentId}
          project={{ name: project.name, folders: project.folders, brief: project.brief }}
          last={backup.last}
          onBackedUp={backup.remember}
        />
      ) : null}
    </>
  );
}
